// A poll as a Discord Components V2 message, matching the coordinator's raid cards: one container
// with an accent stripe, the question, a bar per option when results may show, and the voting
// controls. Pure: data in, MessageData out. The custom ids are built and parsed here so the
// renderer and the interaction flow (apps/api src/discord-polls.ts) can't disagree.
import { discordColor } from '@vintage/design-tokens';
import {
  type ActionRow,
  actionRow,
  ButtonStyle,
  button,
  type ContainerChild,
  container,
  discordTimestamp,
  linkButton,
  type MessageData,
  MessageFlags,
  separator,
  stringSelect,
  TimestampStyle,
  textDisplay,
  truncate,
} from '@vintage/discord-kit';
import { type Tier, tierAllows } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import type { Poll, PollResults, Vote } from '../contract';
import { tally } from '../domain/tally';

/**
 * The description shown on a post. With the longest question and 25 of the longest options this
 * keeps the whole message under Discord's 4000-character text limit (LAYOUT_LIMITS.text).
 */
export const POST_DESCRIPTION = 500;

/** Buttons are used for single-choice polls up to this many options; a select beyond it. */
export const MAX_VOTE_BUTTONS = 5;

/** What a poll post's buttons and select mean, encoded in Discord custom ids (≤100 chars). */
export type PollAction =
  | { kind: 'vote'; pollId: string; optionId: string }
  | { kind: 'select'; pollId: string }
  | { kind: 'retract'; pollId: string }
  | { kind: 'close'; pollId: string }
  | { kind: 'close-confirm'; pollId: string };

const CODES = { vote: 'v', select: 's', retract: 'x', close: 'c', 'close-confirm': 'cc' } as const;
const KINDS = Object.fromEntries(Object.entries(CODES).map(([k, c]) => [c, k])) as Record<
  string,
  PollAction['kind']
>;

export function pollCustomId(action: PollAction): string {
  const base = `poll:${CODES[action.kind]}:${action.pollId}`;
  return action.kind === 'vote' ? `${base}:${action.optionId}` : base;
}

/** The poll action behind a custom id, or null when it isn't a poll control. */
export function parsePollCustomId(customId: string | undefined): PollAction | null {
  const [prefix, code, pollId, optionId] = (customId ?? '').split(':');
  const kind = code ? KINDS[code] : undefined;
  if (prefix !== 'poll' || !kind || !pollId) return null;
  if (kind === 'vote') return optionId ? { kind, pollId, optionId } : null;
  return { kind, pollId };
}

/**
 * Whether the tally shows on a public post. A post is seen by everyone in the channel, so it
 * follows the rule for a non-officer: live polls only when `live`, closed ones unless `officers`.
 */
export function publicTally(poll: Pick<Poll, 'status' | 'resultsVisible'>): boolean {
  if (poll.status === 'closed') return poll.resultsVisible !== 'officers';
  return poll.status === 'open' && poll.resultsVisible === 'live';
}

const AUDIENCE: Record<Tier, string> = {
  public: 'Everyone',
  member: 'Members and up',
  recruit: 'Recruits and up',
  raider: 'Raiders and up',
  leader: 'Raid leaders and officers',
  officer: 'Officers',
};

const METHOD: Record<Poll['method'], string> = {
  single: 'Pick one',
  multi: 'Pick any',
  ranked: 'Rank your choices',
};

const BAR = 12;
function bar(votes: number, total: number): string {
  const filled = total === 0 ? 0 : Math.round((votes / total) * BAR);
  return `${'█'.repeat(filled)}${'░'.repeat(BAR - filled)}`;
}

const pct = (votes: number, total: number) =>
  total === 0 ? '0%' : `${Math.round((votes / total) * 100)}%`;

const label = (o: Poll['options'][number]) => (o.emoji ? `${o.emoji} ${o.label}` : o.label);

export interface PollCard {
  poll: Poll;
  /** The current tally (the frozen one once closed). */
  results: PollResults;
  /** Members who may vote, for "12 of 30 voted"; null when unknown. */
  eligible: number | null;
  /** The website's poll page, for ranked voting and details; null when there's no site yet. */
  pollUrl: string | null;
}

function metaLine({ poll }: PollCard): string {
  const multi =
    poll.method === 'multi' && poll.maxChoices !== null ? ` up to ${poll.maxChoices}` : '';
  const parts = [`${METHOD[poll.method]}${multi}`, AUDIENCE[poll.eligibleTier]];
  if (poll.anonymous) parts.push('anonymous');
  if (poll.status === 'open' && poll.closesAt !== null) {
    parts.push(`closes ${discordTimestamp(poll.closesAt, TimestampStyle.RELATIVE)}`);
  }
  if (poll.status === 'closed') parts.push('**closed**');
  if (poll.status === 'cancelled') parts.push('**cancelled**');
  return parts.join(' · ');
}

function optionLines(card: PollCard): string {
  const { poll, results } = card;
  if (!publicTally(poll)) {
    return poll.options.map((o, i) => `**${i + 1}.** ${label(o)}`).join('\n');
  }
  const counts = new Map(results.options.map((o) => [o.optionId, o.votes]));
  const total = results.ballots;
  const winners = new Set(poll.status === 'closed' ? results.winners : []);
  return poll.options
    .map((o) => {
      const votes = counts.get(o.id) ?? 0;
      const mark = winners.has(o.id) ? ' ✓' : '';
      return `**${label(o)}**${mark}\n\`${bar(votes, total)}\` ${votes} · ${pct(votes, total)}`;
    })
    .join('\n');
}

function footer(card: PollCard): string {
  const { poll, results, eligible } = card;
  const voted =
    eligible === null ? `${results.ballots} voted` : `${results.ballots} of ${eligible} voted`;
  const parts = [voted];
  if (poll.quorum !== null) {
    parts.push(results.quorumMet ? `quorum ${poll.quorum} met` : `quorum ${poll.quorum}`);
  }
  if (poll.status === 'closed' && !results.quorumMet) parts.push('no result: quorum not met');
  if (poll.status === 'closed' && results.winners.length > 1) parts.push('tie');
  if (poll.status === 'closed' && poll.method === 'ranked' && results.rounds) {
    parts.push(`${results.rounds.length} rounds of runoff`);
  }
  if (!publicTally(poll) && poll.status === 'open') {
    parts.push(
      poll.resultsVisible === 'officers' ? 'results are for officers' : 'results show at close',
    );
  }
  return `-# ${parts.join(' · ')}`;
}

/** The voting controls for an open poll; none once it closes. */
function controls({ poll, pollUrl }: PollCard): ActionRow[] {
  if (poll.status !== 'open') return [];
  const rows: ActionRow[] = [];
  if (poll.method === 'ranked') {
    if (pollUrl) rows.push(actionRow(linkButton(pollUrl, 'Rank on the website')));
  } else if (poll.method === 'single' && poll.options.length <= MAX_VOTE_BUTTONS) {
    rows.push(
      actionRow(
        ...poll.options.map((o) =>
          button(
            pollCustomId({ kind: 'vote', pollId: poll.id, optionId: o.id }),
            o.label,
            ButtonStyle.PRIMARY,
          ),
        ),
      ),
    );
  } else {
    rows.push(
      actionRow(
        stringSelect(
          pollCustomId({ kind: 'select', pollId: poll.id }),
          poll.options.map((o) => ({ label: o.label, value: o.id })),
          {
            placeholder: poll.method === 'multi' ? 'Pick your options' : 'Pick one',
            min_values: 1,
            max_values: poll.method === 'multi' ? (poll.maxChoices ?? poll.options.length) : 1,
          },
        ),
      ),
    );
  }
  rows.push(
    actionRow(
      button(
        pollCustomId({ kind: 'retract', pollId: poll.id }),
        'Take back my vote',
        ButtonStyle.SECONDARY,
      ),
      button(pollCustomId({ kind: 'close', pollId: poll.id }), 'Close poll', ButtonStyle.DANGER),
    ),
  );
  return rows;
}

/** The poll post: question, details, options (with bars when results may show), and controls. */
export function renderPollPost(card: PollCard): MessageData {
  const { poll } = card;
  const live = poll.status === 'open';
  const description = poll.description ? `\n${truncate(poll.description, POST_DESCRIPTION)}` : '';
  const children: ContainerChild[] = [
    textDisplay(`## ${poll.question}${description}`),
    textDisplay(`-# ${metaLine(card)}`),
    separator(),
    textDisplay(optionLines(card)),
    textDisplay(footer(card)),
    ...controls(card),
  ];
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        {
          accentColor: live
            ? discordColor('color.accent.secondary')
            : discordColor('color.border.strong'),
        },
        ...children,
      ),
    ],
    allowed_mentions: { parse: [] },
  };
}

/** A short key of what the post shows, so an edit happens only when it would change. */
export function renderKey(card: PollCard): string {
  const { poll, results, eligible } = card;
  const tally = publicTally(poll) ? results.options.map((o) => o.votes).join(',') : 'hidden';
  return [poll.configVersion, poll.status, results.ballots, eligible ?? '-', tally].join('|');
}

/**
 * Everything a post shows, from the stored poll and votes: the frozen result once closed, a
 * live tally otherwise, and how many current members may vote.
 */
export function buildPollCard(
  poll: Poll,
  votes: readonly Pick<Vote, 'choices' | 'weight'>[],
  members: readonly Pick<Member, 'tier'>[] | null,
  pollUrl: string | null,
): PollCard {
  const results = poll.status === 'closed' && poll.results ? poll.results : tally(poll, votes);
  const eligible = members
    ? members.filter((m) => tierAllows(m.tier, poll.eligibleTier)).length
    : null;
  return { poll, results, eligible, pollUrl };
}
