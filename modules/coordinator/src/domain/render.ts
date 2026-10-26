// Discord messages the coordinator sends. Pure: data in, discord-kit MessageData out. Times use
// Discord timestamp markup so everyone sees their own local time (PLAN §6.2).
import { encodeBridge } from '@vintage/bridge-format';
import { type CompResult, compRoleOf, defaultTemplate, solveComp } from '@vintage/comp-solver';
import {
  actionRow,
  ButtonStyle,
  button,
  discordTimestamp,
  type Embed,
  embed,
  type MessageData,
  TimestampStyle,
} from '@vintage/discord-kit';
import { RANK_PRIORITY, type Signup } from '@vintage/raids/contract';
import type { TickEvent, TickMember } from '../store';

/** Discord's message content limit. */
const MAX_CONTENT = 2000;

const when = (ms: number) =>
  `${discordTimestamp(ms, TimestampStyle.LONG_DATE_TIME)} (${discordTimestamp(ms, TimestampStyle.RELATIVE)})`;

const mention = (m: TickMember) => `<@${m.discordId}>`;

const label = (s: Signup) => `${s.characterName} (${s.spec} ${s.class})`;

/** A signup line with its late marker and reason, e.g. "Bramble (holy priest) · late: after work". */
const detailed = (s: Signup) => {
  const tag = s.status === 'late' ? 'late' : null;
  const reason = s.note ? s.note : null;
  const extra = [tag, reason].filter(Boolean).join(': ');
  return extra ? `${label(s)} · ${extra}` : label(s);
};

const list = (signups: Signup[], line: (s: Signup) => string = detailed) =>
  signups.length ? signups.map(line).join('\n') : '—';

const GOING = new Set(['accepted', 'late']);

/** Going and inside the raid size (not waiting in the queue). */
const inRaid = (s: Signup) => GOING.has(s.status) && !s.queued;

type CompRoleName = 'tank' | 'healer' | 'dps';

/** "Tanks 4 · Healers 9 · DPS 25": who's in, per role. */
export function roleCounters(signups: Signup[]): string {
  const n = (role: CompRoleName) =>
    signups.filter((s) => inRaid(s) && compRoleOf(s.role) === role).length;
  return `Tanks ${n('tank')} · Healers ${n('healer')} · DPS ${n('dps')}`;
}

/** The comp for a raid's signups, ranked like comp-suggest. */
export function compFor(tick: TickEvent, members: TickMember[]): CompResult {
  const rank = new Map(members.map((m) => [m.memberId, m.rank]));
  const template = tick.event.roleTargets
    ? { ...defaultTemplate(tick.event.size), targets: tick.event.roleTargets }
    : defaultTemplate(tick.event.size);
  return solveComp({
    raidSize: tick.event.size,
    template,
    signups: tick.signups.map((s) => {
      const r = rank.get(s.memberId);
      return {
        id: s.id,
        name: s.characterName,
        class: s.class,
        spec: s.spec,
        role: s.role,
        // Queued people only play if nobody ahead of them fits.
        status: s.queued ? 'bench' : s.status,
        priority: r ? RANK_PRIORITY[r] : 0,
        signedUpAt: s.signedUpAt,
      };
    }),
  });
}

const gapLine = (comp: CompResult) =>
  comp.gaps.length ? comp.gaps.map((g) => g.reason).join(' · ') : 'No gaps';

const SIGNUP_BUTTONS = [
  ['accepted', 'Accept', ButtonStyle.SUCCESS],
  ['late', 'Late', ButtonStyle.PRIMARY],
  ['tentative', 'Tentative', ButtonStyle.SECONDARY],
  ['bench', 'Bench', ButtonStyle.SECONDARY],
  ['declined', 'Decline', ButtonStyle.DANGER],
] as const;

/**
 * The signup post: a counter line, who's in by role (late people marked, with reasons), the queue
 * when the raid is full, tentative and bench with reasons, comp gaps, and answer buttons. Edited
 * as signups change.
 */
export function renderSignupPost(tick: TickEvent, members: TickMember[]): MessageData {
  const { event, signups } = tick;
  const going = signups.filter(inRaid);
  const byRole = (role: CompRoleName) => going.filter((s) => compRoleOf(s.role) === role);
  const queue = signups
    .filter((s) => GOING.has(s.status) && s.queued)
    .sort((a, b) => a.signedUpAt - b.signedUpAt);
  const maybe = signups.filter((s) => s.status === 'tentative');
  const bench = signups.filter((s) => s.status === 'bench');
  const declined = signups.filter((s) => s.status === 'declined').length;
  const locked = event.status === 'locked';
  const comp = compFor(tick, members);

  const tanks = byRole('tank');
  const healers = byRole('healer');
  const dps = byRole('dps');
  const fields = [
    { name: `Tanks (${tanks.length})`, value: list(tanks), inline: true },
    { name: `Healers (${healers.length})`, value: list(healers), inline: true },
    { name: `DPS (${dps.length})`, value: list(dps), inline: true },
    ...(queue.length
      ? [
          {
            name: `Queue (${queue.length})`,
            value: list(queue, (s) => `${queue.indexOf(s) + 1}. ${detailed(s)}`),
          },
        ]
      : []),
    { name: `Tentative (${maybe.length})`, value: list(maybe), inline: true },
    { name: `Bench (${bench.length})`, value: list(bench), inline: true },
    { name: 'Comp', value: gapLine(comp) },
  ];
  const post: Embed = embed({
    title: `${event.name} — ${event.instance}`,
    description:
      `${when(event.startsAt)}\n${roleCounters(signups)}\n` +
      `${event.size}-person · ${going.length}/${event.size} going` +
      `${queue.length ? ` · ${queue.length} queued` : ''} · ${declined} declined · ` +
      `signups ${locked ? 'locked' : 'open'}`,
    fields,
    footer: { text: 'Answer with the buttons, or sign up on the guild site.' },
  });
  return {
    embeds: [post],
    components: [
      actionRow(
        ...SIGNUP_BUTTONS.map(([status, text, style]) =>
          button(`signup:${event.id}:${status}`, text, style, { disabled: locked }),
        ),
      ),
    ],
    allowed_mentions: { parse: [] },
  };
}

/** Stable hash of what the post would show, so it's edited only when it changes. */
export function hashMessage(message: MessageData): string {
  const text = JSON.stringify(message);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Channel reminder that pings only the people who haven't answered. */
export function renderReminder(tick: TickEvent, waiting: TickMember[]): MessageData {
  const names = waiting.map(mention).join(' ');
  const content = `**${tick.event.name}** starts ${when(tick.event.startsAt)}. Still waiting on: ${names}\nAnswer on the signup post above.`;
  return {
    content: content.slice(0, MAX_CONTENT),
    allowed_mentions: { users: waiting.map((m) => m.discordId) },
  };
}

/** Tells someone from the queue that a spot opened and they're in. */
export function renderPromotion(
  tick: TickEvent,
  signup: Signup,
  member: TickMember | undefined,
): MessageData {
  const who = member ? `<@${member.discordId}>` : `**${signup.characterName}**`;
  return {
    content:
      `${who} a spot opened up: ${signup.characterName} is in for **${tick.event.name}** ` +
      `${when(tick.event.startsAt)}. Can't make it after all? Change your answer on the signup post.`,
    allowed_mentions: { users: member ? [member.discordId] : [] },
  };
}

export function renderDm(tick: TickEvent, member: TickMember): MessageData {
  return {
    content:
      `Hi ${member.displayName}, **${tick.event.name}** starts ${when(tick.event.startsAt)} and you ` +
      "haven't answered yet. Use the buttons on the signup post in the raid signups channel. " +
      'You can turn these DMs off in your profile on the guild site.',
    allowed_mentions: { parse: [] },
  };
}

/** Officer digest: confirmed count, comp gaps, and who hasn't answered. */
export function renderDigest(
  tick: TickEvent,
  members: TickMember[],
  waiting: TickMember[],
): MessageData {
  const comp = compFor(tick, members);
  const waitingLine = waiting.length
    ? `Not answered (${waiting.length}): ${waiting.map((m) => m.displayName).join(', ')}`
    : 'Everyone expected has answered.';
  const withReasons = (status: Signup['status'], title: string) => {
    const people = tick.signups.filter((s) => s.status === status);
    if (!people.length) return null;
    const names = people.map((s) => (s.note ? `${s.characterName} (${s.note})` : s.characterName));
    return `${title} (${people.length}): ${names.join(', ')}`;
  };
  const queued = tick.signups.filter((s) => s.queued).length;
  return {
    content: [
      `**${tick.event.name}** ${when(tick.event.startsAt)}`,
      `${comp.counts.confirmed}/${tick.event.size} confirmed · ${roleCounters(tick.signups)}` +
        `${queued ? ` · ${queued} queued` : ''}`,
      gapLine(comp),
      withReasons('late', 'Late'),
      withReasons('tentative', 'Tentative'),
      withReasons('bench', 'Bench'),
      waitingLine,
    ]
      .filter((line): line is string => line !== null)
      .join('\n')
      .slice(0, MAX_CONTENT),
    allowed_mentions: { parse: [] },
  };
}

/**
 * Who's in: the leader's roster when they set one (rostered signups), otherwise the comp
 * solver's pick from the signups.
 */
export function finalRoster(
  tick: TickEvent,
  members: TickMember[],
): { going: Signup[]; bench: Signup[] } {
  const rostered = tick.signups.filter((s) => s.roster === 'rostered');
  if (rostered.length) {
    return { going: rostered, bench: tick.signups.filter((s) => s.roster === 'benched') };
  }
  const comp = compFor(tick, members);
  const byId = new Map(tick.signups.map((s) => [s.id, s]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((s): s is Signup => !!s);
  return {
    going: pick(comp.selected.map((d) => d.signup.id)),
    bench: pick(comp.bench.map((d) => d.signup.id)),
  };
}

export function renderFinalRoster(tick: TickEvent, members: TickMember[]): MessageData {
  const { going, bench } = finalRoster(tick, members);
  const byRole = (role: 'tank' | 'healer' | 'dps') =>
    going.filter((s) => compRoleOf(s.role) === role);
  return {
    content: `Signups for **${tick.event.name}** are locked. Final roster (${going.length}/${tick.event.size}):`,
    embeds: [
      embed({
        title: `${tick.event.name} — ${tick.event.instance}`,
        description: when(tick.event.startsAt),
        fields: [
          { name: `Tanks (${byRole('tank').length})`, value: list(byRole('tank')), inline: true },
          {
            name: `Healers (${byRole('healer').length})`,
            value: list(byRole('healer')),
            inline: true,
          },
          { name: `DPS (${byRole('dps').length})`, value: list(byRole('dps')), inline: true },
          { name: `Bench (${bench.length})`, value: list(bench) },
        ],
      }),
    ],
    allowed_mentions: { parse: [] },
  };
}

/** The addon import string (libs/bridge-format) for officers to paste in game. */
export function renderImportString(
  tick: TickEvent,
  members: TickMember[],
  guildId: string,
  now: number,
): MessageData {
  const { going } = finalRoster(tick, members);
  const groups = new Map<number, string[]>();
  for (const s of going) {
    if (s.group !== null) groups.set(s.group, [...(groups.get(s.group) ?? []), s.characterId]);
  }
  const encoded = encodeBridge({
    v: 1,
    kind: 'raid-import',
    guildId,
    generatedAt: Math.floor(now / 1000),
    raid: {
      eventId: tick.event.id,
      title: tick.event.name,
      startsAt: Math.floor(tick.event.startsAt / 1000),
    },
    roster: going.map((s) => ({
      characterId: s.characterId,
      name: s.characterName,
      class: s.class,
      spec: s.spec,
      role: s.role,
    })),
    groups: [...groups].map(([group, characterIds]) => ({ group, characterIds })),
    // Loot methods arrive with the loot module (Phase 2); until then the addon leaves loot alone.
    loot: {
      methodId: tick.event.lootMethodId ?? 'unset',
      methodVersion: 1,
      configVersion: tick.event.configVersion,
      mode: 'group',
    },
    candidates: [],
  });
  const header = `Addon import for **${tick.event.name}** (${going.length} characters). Paste it into the Vintage addon:`;
  if (!encoded.ok) {
    return {
      content: `${header}\nCould not build it: ${encoded.error.message}`,
      allowed_mentions: { parse: [] },
    };
  }
  const content = `${header}\n\`\`\`\n${encoded.value}\n\`\`\``;
  return {
    content:
      content.length <= MAX_CONTENT
        ? content
        : `${header}\nIt is too long for one message (${encoded.value.length} characters); use the website export.`,
    allowed_mentions: { parse: [] },
  };
}

export function renderFailure(tick: TickEvent, rule: string, error: string): MessageData {
  return {
    content:
      `Coordinator could not do \`${rule}\` for **${tick.event.name}** (${when(tick.event.startsAt)}): ${error}`.slice(
        0,
        MAX_CONTENT,
      ),
    allowed_mentions: { parse: [] },
  };
}
