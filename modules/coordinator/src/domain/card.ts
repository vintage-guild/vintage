// The coordinator's raid cards (signup-improvements §1 & §1a):
// - Four role columns (Tanks / Healers on row 1, Melee / Ranged on row 2, padded with empty inline
//   spacers so Discord renders 2x2), sorted by class then name.
// - Spec icons (`spec_<class>_<spec>`, falling back to `square_<class>`), no spec text, no place
//   numbers, late minutes icon/text, and recruit sprout mark.
// - Line-safe character-budget packing (<= 1,024 chars/field, never slicing mid-token).
// - Tentative names without public reasons (reasons stay leader-only in the digest and quarters);
//   Missing going-only + subtext if tentative or standby would change it; Absent names below Missing.
// - T-24h party draft in #leads (Approve and post / Redraft / Edit in quarters) and approved party
//   post that promotes in place into the Final Roster at lock.
// Pure: data in, MessageData out.
import {
  type CompGap,
  groupDraft,
  hasSplitDpsTargets,
  type RoleTargets,
} from '@vintage/comp-solver';
import { discordColor } from '@vintage/design-tokens';
import {
  actionRow,
  ButtonStyle,
  button,
  discordTimestamp,
  type EmbedField,
  embed,
  linkButton,
  type MessageData,
  TimestampStyle,
} from '@vintage/discord-kit';
import type { GuildRank } from '@vintage/identity/contract';
import {
  competingGoingSignups,
  DEFAULT_TIMINGS,
  hasRoleTargets,
  isRosterOvercommitted,
  kindOf,
  MAX_EVENT_SIZE,
  RANK_PRIORITY,
  type RaidEvent,
  type Signup,
  targetsOf,
} from '@vintage/raids/contract';
import type { Role } from '@vintage/wow-data';
import type { TickAway, TickEvent, TickMember } from '../store';
import { EMOJI_IDS } from './emoji-ids';
import { cardTitle, countOf, eventTitle, noun, sizeWords } from './kind-words';
import { compFor, finalRoster, recommendedSitsFromBench } from './render';

const ROLE_ROWS: readonly (readonly [Role, string][])[] = [
  [
    ['tank', 'Tanks'],
    ['healer', 'Healers'],
  ],
  [
    ['melee', 'Melee'],
    ['ranged', 'Ranged'],
  ],
];

const ALL_ROLES: readonly [Role, string][] = ROLE_ROWS.flat();

/** Discord collapses repeated spaces, so the status counts are spaced with em spaces. */
const GAP = String.fromCharCode(0x2003);
/** An empty line: spacing at the end of a description, or an empty field name/spacer. */
const BLANK = String.fromCharCode(0x200b);

const FIELD_MAX = 1024;
const GROUP_SIZE = 5;

/** `<:name:id>` for one of the app's emoji, or '' when it isn't uploaded. */
export function emoji(name: string): string {
  const id = EMOJI_IDS[name];
  return id ? `<:${name}:${id}>` : '';
}

function headerIcon(role: Role): string {
  const direct = emoji(`head_${role}`);
  if (direct) return direct;
  return role === 'melee' || role === 'ranged' ? emoji('head_dps') : '';
}

/** A column header: the role's outline icon, its name, and a count (with target when set). */
function header(role: Role, label: string, count: number, targets: RoleTargets | null): string {
  let countStr = String(count);
  if (targets) {
    if (role === 'tank' || role === 'healer') {
      countStr = `${count}/${targets[role]}`;
    } else if (hasSplitDpsTargets(targets)) {
      countStr = `${count}/${targets[role]}`;
    }
  }
  return `${headerIcon(role)} ${label} ${countStr}`.trim();
}

function specIcon(s: Pick<Signup, 'class' | 'spec'>): string {
  const key = `spec_${s.class}_${s.spec.replace(/-/g, '_')}`;
  return emoji(key) || emoji(`square_${s.class}`);
}

function lateMark(s: Pick<Signup, 'status' | 'lateMinutes'>): string {
  if (s.status !== 'late' && s.lateMinutes === null) return '';
  if (s.lateMinutes) {
    const custom = emoji(`late_${s.lateMinutes}`);
    if (custom) return ` ${custom}`;
    const clock = emoji('status_late');
    return clock ? ` ${clock} ${s.lateMinutes}m` : ` ${s.lateMinutes}m`;
  }
  const clock = emoji('status_late');
  return clock ? ` ${clock}` : '';
}

function recruitMark(rank: GuildRank | null | undefined): string {
  if (rank !== 'recruit') return '';
  const sprout = emoji('recruit');
  return sprout ? ` ${sprout}` : '';
}

/** "<spec_icon> Frostwyn" plus late minutes and recruit sprout when applicable. */
function line(s: Signup, ranks?: ReadonlyMap<string, GuildRank | null>): string {
  const rank = ranks?.get(s.memberId);
  return `${specIcon(s)} ${s.characterName}${lateMark(s)}${recruitMark(rank)}`.trim();
}

/** Sort within a role column: class first so icons cluster, then character name. */
function byClassThenName(a: Signup, b: Signup): number {
  return a.class.localeCompare(b.class) || a.characterName.localeCompare(b.characterName);
}

/** Sort Standby by rank priority (Raider > Recruit > Flex Raider > Member > Friend), then name. */
function byStandbyOrder(ranks: ReadonlyMap<string, GuildRank | null>) {
  return (a: Signup, b: Signup) => {
    const ra = ranks.get(a.memberId);
    const rb = ranks.get(b.memberId);
    const pa = ra ? RANK_PRIORITY[ra] : 0;
    const pb = rb ? RANK_PRIORITY[rb] : 0;
    return pb - pa || a.characterName.localeCompare(b.characterName);
  };
}

/**
 * Pack whole lines within `budget` characters, ending with `+N more…` if truncated.
 * Never slices mid-line or mid-emoji token.
 */
export function fitLines(
  lines: readonly string[],
  budget = FIELD_MAX,
  sep = '\n',
  prefix = '',
): { text: string; hidden: number } {
  if (lines.length === 0) return { text: prefix ? `${prefix}—` : '—', hidden: 0 };
  const full = `${prefix}${lines.join(sep)}`;
  if (full.length <= budget) return { text: full, hidden: 0 };

  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const remaining = lines.length - (i + 1);
    const suffix = remaining > 0 ? `${sep}+${remaining} more…` : '';
    const candidate = `${prefix}${[...kept, lines[i]!].join(sep)}${suffix}`;
    if (candidate.length > budget) {
      const hidden = lines.length - kept.length;
      const out = kept.length
        ? `${prefix}${kept.join(sep)}${sep}+${hidden} more…`
        : `${prefix}+${hidden} more…`;
      return { text: out, hidden };
    }
    kept.push(lines[i]!);
  }
  return { text: `${prefix}${kept.join(sep)}`, hidden: 0 };
}

const when = (ms: number) =>
  `${discordTimestamp(ms, TimestampStyle.LONG_DATE_TIME)} · ${discordTimestamp(ms, TimestampStyle.RELATIVE)}`;

const BUFF_SHORT: Record<string, string> = {
  'Mark of the Wild': 'MotW',
  'Power Word: Fortitude': 'Fort',
  'Arcane Intellect': 'Int',
};

/** "2 tanks · 7 healers · MotW · Fort". Buffs only count for raids. */
function missing(event: RaidEvent, gaps: CompGap[]): string {
  const raid = kindOf(event) === 'raid';
  return gaps
    .filter((g) => raid || g.kind !== 'requirement')
    .map((g) =>
      g.kind === 'requirement' ? (BUFF_SHORT[g.label] ?? g.label) : g.reason.replace(/^need /, ''),
    )
    .join(' · ');
}

/** Partition signups into comp-seated `going`, comp/explicit `standby`, and unseated `maybe`. */
function partitionSignups(
  tick: TickEvent,
  members: TickMember[],
  ranks: ReadonlyMap<string, GuildRank | null>,
): { going: Signup[]; standby: Signup[]; maybe: Signup[] } {
  const { going, bench } = finalRoster(tick, members);
  const standby = [...bench].sort(byStandbyOrder(ranks));
  const maybe = tick.signups
    .filter((s) => s.status === 'tentative' && s.roster !== 'rostered')
    .sort(byClassThenName);
  return { going, standby, maybe };
}

/** "<icon> **12** going  <icon> **2** late  …  <icon> **1** absent". */
function statusLine(
  going: readonly Signup[],
  standby: readonly Signup[],
  maybe: readonly Signup[],
  signups: readonly Signup[],
  awayCount = 0,
): string {
  const parts = [
    [emoji('status_going'), going.filter((s) => s.status !== 'late').length, 'going'],
    [emoji('status_late'), going.filter((s) => s.status === 'late').length, 'late'],
    [emoji('status_tentative'), maybe.length, 'tentative'],
    [emoji('status_standby'), standby.length, 'standby'],
    [
      emoji('status_out'),
      signups.filter((s) => s.status === 'declined').length + awayCount,
      'absent',
    ],
  ] as const;
  return parts.map(([icon, count, label]) => `${icon} **${count}** ${label}`.trim()).join(GAP);
}

const SIGNUP_BUTTONS = [
  ['accepted', 'Accept', ButtonStyle.SUCCESS],
  ['late', 'Late', ButtonStyle.PRIMARY],
  ['tentative', 'Tentative', ButtonStyle.SECONDARY],
  ['bench', 'Standby', ButtonStyle.SECONDARY],
  ['declined', 'Absent', ButtonStyle.DANGER],
] as const;

/**
 * The raid's notes as quotes, a block per paragraph (split on blank lines, as the website does),
 * after an empty line; nothing when it has none. Notes are at most 500 characters, so they fit.
 */
function notesLines(event: RaidEvent): string[] {
  const paragraphs = (event.notes ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.flatMap((p) => ['', ...p.split('\n').map((l) => `> ${l.trim()}`)]);
}

export interface CardOptions {
  /** Base site URL (e.g. `https://vintageguild.gg`) for short raid links and Edit in quarters buttons. */
  siteUrl?: string | null;
  /** Override locked display state (e.g. on the lock tick before `event.status` flips to `locked`). */
  locked?: boolean;
}

/** Strip trailing slashes in linear time (avoids polynomial regex backtracking on untrusted input). */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
  return value.slice(0, end);
}

/** Short site link for a raid (`vintageguild.gg/r/<code>`), or `/raids/<id>` on unbackfilled rows. */
export function raidSiteLink(
  siteUrl: string | null | undefined,
  event: Pick<RaidEvent, 'id' | 'shortCode'>,
): { url: string; label: string; markdown: string } | null {
  const base = siteUrl ? stripTrailingSlashes(siteUrl.trim()) : '';
  if (!base) return null;
  const path = event.shortCode
    ? `/r/${encodeURIComponent(event.shortCode)}`
    : `/raids/${encodeURIComponent(event.id)}`;
  const url = `${base}${path}`;
  const label = `${base.replace(/^https?:\/\//i, '')}${path}`;
  return { url, label, markdown: `[${label}](${url})` };
}

function rankMap(members: readonly TickMember[]): Map<string, GuildRank | null> {
  return new Map(members.map((m) => [m.memberId, m.rank]));
}

function buildRoleColumns(
  going: readonly Signup[],
  targets: RoleTargets,
  ranks: ReadonlyMap<string, GuildRank | null>,
  event: RaidEvent,
): { fields: EmbedField[]; hidden: number } {
  if (!hasRoleTargets(targets)) {
    const fitted = fitLines([...going].sort(byClassThenName).map((s) => line(s, ranks)));
    return {
      fields: [{ name: `Going ${countOf(going.length, event)}`, value: fitted.text }],
      hidden: fitted.hidden,
    };
  }
  const fields: EmbedField[] = [];
  let hidden = 0;
  for (const row of ROLE_ROWS) {
    for (const [role, label] of row) {
      const inRole = going.filter((s) => s.role === role).sort(byClassThenName);
      const fitted = fitLines(inRole.map((s) => line(s, ranks)));
      hidden += fitted.hidden;
      fields.push({
        name: header(role, label, inRole.length, targets),
        value: fitted.text,
        inline: true,
      });
    }
    // Empty inline spacer keeps Discord's 3-column grid to 2x2.
    fields.push({ name: BLANK, value: BLANK, inline: true });
  }
  return { fields, hidden };
}

function buildMissingValue(tick: TickEvent, members: TickMember[]): string {
  const compGoing = compFor(tick, members, { goingOnly: true });
  const mainText = compGoing.gaps.length
    ? `${emoji('info_missing')} **Missing** ${missing(tick.event, compGoing.gaps)}`
    : '**Comp** no gaps';
  if (!compGoing.gaps.length) return mainText;
  const hasMaybeOrStandby = tick.signups.some(
    (s) => s.status === 'tentative' || s.status === 'bench' || s.roster === 'benched',
  );
  if (!hasMaybeOrStandby) return mainText;
  const compAll = compFor(tick, members, { goingOnly: false });
  const goingStr = missing(tick.event, compGoing.gaps);
  const allStr = missing(tick.event, compAll.gaps);
  if (allStr === goingStr) return mainText;
  const sub = allStr
    ? `-# ${allStr} if tentative and standby come`
    : '-# no gaps if tentative and standby come';
  return `${mainText}\n${sub}`;
}

/** Plain names for everyone absent: declined signups and scheduled absences, sorted, no reasons. */
function absentNames(
  signups: readonly Signup[],
  away: readonly Pick<TickAway, 'displayName'>[] = [],
): string[] {
  const declined = signups.filter((s) => s.status === 'declined').map((s) => s.characterName);
  const covered = away.map((a) => a.displayName);
  return [...declined, ...covered].sort((a, b) => a.localeCompare(b));
}

/** Pack bottom summary lines into as few embed fields as fit (<= 1,024 chars) to avoid blank gaps. */
function packFooterFields(blocks: readonly string[]): EmbedField[] {
  const out: EmbedField[] = [];
  let current = '';
  for (const block of blocks) {
    if (!current) {
      current = block;
    } else if (current.length + 1 + block.length <= FIELD_MAX) {
      current = `${current}\n${block}`;
    } else {
      out.push({ name: BLANK, value: current });
      current = block;
    }
  }
  if (current) out.push({ name: BLANK, value: current });
  return out;
}

/**
 * The signup post (Card v2): 2x2 role columns (Tanks/Healers, Melee/Ranged), sorted by class then
 * name, spec icons, late minutes, recruit mark, Standby, Tentative (names only; reasons stay
 * leader-only), going-only Missing + tentative/standby subtext, Absent names below Missing,
 * answer buttons, and Row 2 Raid page + Roster (when anything overflows).
 */
export function renderSignupPost(
  tick: TickEvent,
  members: TickMember[],
  options: CardOptions = {},
): MessageData {
  const { event, signups, timings } = tick;
  const locked = event.status === 'locked';
  const targets = targetsOf(event);
  const ranks = rankMap(members);
  const { going, standby, maybe } = partitionSignups(tick, members, ranks);

  const lock = locked
    ? `${emoji('info_locked')} Signups locked`
    : `${emoji('info_open')} Signups open · lock ${timings.lockHours}h before`;

  const { fields, hidden: columnHidden } = buildRoleColumns(going, targets, ranks, event);
  let hidden = columnHidden;
  const footerBlocks: string[] = [];

  if (standby.length) {
    const fitted = fitLines(
      standby.map((s) => line(s, ranks)),
      FIELD_MAX,
      ' · ',
      `${emoji('status_standby')} **Standby** `,
    );
    hidden += fitted.hidden;
    footerBlocks.push(fitted.text);
  }
  if (maybe.length) {
    const fitted = fitLines(
      maybe.map((s) => line(s, ranks)),
      FIELD_MAX,
      ' · ',
      `${emoji('status_tentative')} **Tentative** `,
    );
    hidden += fitted.hidden;
    footerBlocks.push(fitted.text);
  }
  footerBlocks.push(buildMissingValue(tick, members));

  const absent = absentNames(signups, tick.away);
  if (absent.length) {
    const fitted = fitLines(absent, FIELD_MAX, ' · ', `${emoji('status_out')} **Absent** `);
    hidden += fitted.hidden;
    footerBlocks.push(fitted.text);
  }
  fields.push(...packFooterFields(footerBlocks));

  const awayCount = tick.away?.length ?? 0;
  const showRoster = hidden > 0;
  const siteLink = raidSiteLink(options.siteUrl, event);
  const row2 = [
    ...(siteLink ? [linkButton(siteLink.url, 'Raid page')] : []),
    ...(showRoster ? [button(`roster:${event.id}`, 'Roster', ButtonStyle.SECONDARY)] : []),
    // Move or cancel, for raid leaders and officers; everyone else gets a private "can't".
    button(`${MANAGE_PREFIX}:${event.id}`, 'Manage', ButtonStyle.SECONDARY),
  ];

  return {
    embeds: [
      embed({
        title: cardTitle(event),
        description: [
          `${emoji('info_calendar')} ${when(event.startsAt)}`,
          `-# ${lock} · ${sizeWords(event)}${siteLink ? ` · ${siteLink.markdown}` : ''}`,
          ...notesLines(event),
          '',
          statusLine(going, standby, maybe, signups, awayCount),
          BLANK,
        ].join('\n'),
        color: locked
          ? discordColor('color.border.strong')
          : discordColor('color.accent.secondary'),
        fields,
      }),
    ],
    components: [
      actionRow(
        ...SIGNUP_BUTTONS.map(([status, text, style]) =>
          button(`signup:${event.id}:${status}`, text, style, { disabled: locked }),
        ),
      ),
      actionRow(...row2),
    ],
    allowed_mentions: { parse: [] },
  };
}

/** The custom id prefix of the card's Manage button (`manage:<eventId>`). */
export const MANAGE_PREFIX = 'manage';

/** A cancelled raid's signup post: the title and time kept, no answer buttons. */
export function renderCancelledPost(event: TickEvent['event']): MessageData {
  return {
    embeds: [
      embed({
        title: `Cancelled · ${cardTitle(event)}`,
        description: `~~${when(event.startsAt)}~~
-# This ${noun(event)} was cancelled. Signups are kept for history.`,
        color: discordColor('color.border.strong'),
      }),
    ],
    components: [],
    allowed_mentions: { parse: [] },
  };
}

/** Does the card leave anyone out that the Roster reply would show? */
export function cardHidesSomeone(tick: TickEvent, members: TickMember[] = []): boolean {
  const targets = targetsOf(tick.event);
  const ranks = rankMap(members);
  const { going, standby, maybe } = partitionSignups(tick, members, ranks);
  const { hidden } = buildRoleColumns(going, targets, ranks, tick.event);
  if (hidden > 0) return true;
  if (
    standby.length &&
    fitLines(
      standby.map((s) => line(s, ranks)),
      FIELD_MAX,
      ' · ',
      `${emoji('status_standby')} **Standby** `,
    ).hidden > 0
  ) {
    return true;
  }
  if (
    maybe.length &&
    fitLines(
      maybe.map((s) => line(s, ranks)),
      FIELD_MAX,
      ' · ',
      `${emoji('status_tentative')} **Tentative** `,
    ).hidden > 0
  ) {
    return true;
  }
  const absent = absentNames(tick.signups, tick.away);
  return (
    absent.length > 0 &&
    fitLines(absent, FIELD_MAX, ' · ', `${emoji('status_out')} **Absent** `).hidden > 0
  );
}

/** Lines split into embed fields of at most 1024 characters, the first one titled. */
function chunkFields(title: string, lines: string[], inline: boolean): EmbedField[] {
  const fields: EmbedField[] = [];
  let current: string[] = [];
  for (const l of lines.length ? lines : ['—']) {
    if ([...current, l].join('\n').length > FIELD_MAX) {
      fields.push({ name: fields.length ? BLANK : title, value: current.join('\n'), inline });
      current = [];
    }
    current.push(l);
  }
  fields.push({ name: fields.length ? BLANK : title, value: current.join('\n'), inline });
  return fields;
}

/**
 * Everyone signed up, privately (the Roster button): 4 roles in full, then Standby, Tentative,
 * and Absent. Reasons stay officer-only (digest and quarters), never shown here.
 */
export function renderRosterReply(
  event: RaidEvent,
  signups: Signup[],
  members: TickMember[] = [],
  away: readonly Pick<TickAway, 'displayName'>[] = [],
): MessageData {
  const ranks = rankMap(members);
  const { going, standby, maybe } = partitionSignups(
    { event, timings: DEFAULT_TIMINGS, signups },
    members,
    ranks,
  );
  const fields = ALL_ROLES.flatMap(([role, label]) => {
    const inRole = going.filter((s) => s.role === role).sort(byClassThenName);
    return chunkFields(
      `${headerIcon(role)} ${label} (${inRole.length})`.trim(),
      inRole.map((s) => line(s, ranks)),
      true,
    );
  });
  const group = (title: string, list: Signup[]) =>
    list.length
      ? chunkFields(
          `${title} (${list.length})`,
          list.map((s) => line(s, ranks)),
          false,
        )
      : [];
  const declinedLines = signups
    .filter((s) => s.status === 'declined')
    .sort(byClassThenName)
    .map((s) => line(s, ranks));
  // Absence reasons stay officer-only; the Roster reply shows names only (absences.plan.md §4).
  const awayLines = [...away]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((a) => a.displayName);
  const absentLines = [...declinedLines, ...awayLines];
  fields.push(
    ...group('Standby', standby),
    ...group('Tentative', maybe),
    ...(absentLines.length
      ? chunkFields(`Absent (${absentLines.length})`, absentLines, false)
      : []),
  );
  return {
    embeds: [
      embed({
        title: `Roster · ${eventTitle(event)}`,
        description: `${emoji('info_calendar')} ${when(event.startsAt)}\n\n${statusLine(going, standby, maybe, signups, away.length)}\n${BLANK}`,
        fields: fields.slice(0, 25),
      }),
    ],
    allowed_mentions: { parse: [] },
  };
}

/** Build Group 1..N embed fields for a raid's drafted or approved parties. */
function partyFields(
  event: RaidEvent,
  going: readonly Signup[],
  bench: readonly Signup[],
  ranks: ReadonlyMap<string, GuildRank | null>,
  recommendedSit: readonly Signup[] = [],
): EmbedField[] {
  const raidSize = event.size ?? MAX_EVENT_SIZE;
  const draft = groupDraft(
    going.map((s) => ({ id: s.id, role: s.role, group: s.group })),
    { raidSize, groupSize: GROUP_SIZE },
  );
  const byId = new Map(going.map((s) => [s.id, s]));
  const fields: EmbedField[] = draft.groups.map((g) => {
    const lines = g.ids.map((id) => line(byId.get(id)!, ranks));
    const open = GROUP_SIZE - lines.length;
    for (let i = 0; i < open; i++) lines.push('— open —');
    return { name: `Group ${g.group}`, value: fitLines(lines).text, inline: true };
  });
  for (const g of draft.outOfRange) {
    const lines = g.ids.map((id) => line(byId.get(id)!, ranks));
    fields.push({
      name: `Group ${g.group} (over size)`,
      value: fitLines(lines).text,
      inline: true,
    });
  }
  if (draft.overflow.length) {
    fields.push({
      name: `Over size (move to Standby) (${draft.overflow.length})`,
      value: fitLines(
        draft.overflow.map((id) => line(byId.get(id)!, ranks)),
        FIELD_MAX,
        ' · ',
      ).text,
    });
  }
  if (recommendedSit.length) {
    const sortedSit = [...recommendedSit].sort(byStandbyOrder(ranks));
    fields.push({
      name: `Recommended to sit (${sortedSit.length})`,
      value: fitLines(
        sortedSit.map((s) => line(s, ranks)),
        FIELD_MAX,
        ' · ',
      ).text,
    });
  }
  if (bench.length) {
    const sortedBench = [...bench].sort(byStandbyOrder(ranks));
    fields.push({
      name: `Standby (${sortedBench.length})`,
      value: fitLines(
        sortedBench.map((s) => line(s, ranks)),
        FIELD_MAX,
        ' · ',
      ).text,
    });
  }
  return fields;
}

function partyDraftStatusLine(
  tick: TickEvent,
  goingCount: number,
  recommendedSitCount: number,
  {
    approved,
    locked,
    overcommitted,
  }: { approved: boolean; locked: boolean; overcommitted: boolean },
): string {
  const size = tick.event.size;
  if (overcommitted && size !== null) {
    const over = goingCount - size;
    const prefix = approved
      ? 'Approved · '
      : locked
        ? `${emoji('info_locked')} Signups locked · Final roster held · `
        : '';
    const suffix = approved ? '' : ' before approving';
    return `-# ${prefix}Over size: ${goingCount}/${size} seated — move ${over} to Standby${suffix}`;
  }
  if (approved) return `-# Approved · ${countOf(goingCount, tick.event)}`;
  const competing = competingGoingSignups(tick.signups).length;
  if (locked && recommendedSitCount > 0 && size !== null) {
    return `-# ${emoji('info_locked')} Signups locked · Final roster held for officer approval · ${competing} going for ${size} seats`;
  }
  if (recommendedSitCount > 0) {
    return `-# Waiting for approval · ${countOf(goingCount, tick.event)} · ${competing} going (${recommendedSitCount} recommended to sit)`;
  }
  return `-# Waiting for approval · ${countOf(goingCount, tick.event)}`;
}

/**
 * T-24h party draft in `#leads`: Group 1..N laid out by `groupDraft`, with Approve and post,
 * Redraft, and Edit in the quarters buttons. Edited in place as leaders move people until approved.
 */
export function renderPartyDraft(
  tick: TickEvent,
  members: TickMember[],
  options: CardOptions = {},
): MessageData {
  const ranks = rankMap(members);
  const { going, bench } = finalRoster(tick, members);
  const approved = tick.event.rosterApprovedAt !== null;
  const locked = options.locked ?? tick.event.status === 'locked';
  const overcommitted =
    tick.event.size !== null &&
    (isRosterOvercommitted(tick.event, tick.signups) || going.length > tick.event.size);
  const recSit = approved ? [] : recommendedSitsFromBench(tick.event, bench);
  const recSitIds = new Set(recSit.map((s) => s.id));
  const otherBench = bench.filter((s) => !recSitIds.has(s.id));
  const fields = partyFields(tick.event, going, otherBench, ranks, recSit);
  const buttons = [
    button(`party-approve:${tick.event.id}`, 'Approve and post', ButtonStyle.SUCCESS, {
      disabled: approved || overcommitted,
    }),
    button(`party-redraft:${tick.event.id}`, 'Redraft', ButtonStyle.SECONDARY, {
      disabled: approved,
    }),
    ...(options.siteUrl
      ? [
          linkButton(
            `${options.siteUrl.replace(/\/$/, '')}/officers/roster`,
            'Edit in the quarters',
          ),
        ]
      : []),
  ];
  return {
    embeds: [
      embed({
        title: `Party draft · ${eventTitle(tick.event)}`,
        description: [
          `${emoji('info_calendar')} ${when(tick.event.startsAt)}`,
          partyDraftStatusLine(tick, going.length, recSit.length, {
            approved,
            locked,
            overcommitted,
          }),
        ].join('\n'),
        color: approved
          ? discordColor('color.border.strong')
          : discordColor('color.accent.secondary'),
        fields: fields.slice(0, 25),
      }),
    ],
    components: [actionRow(...buttons)],
    allowed_mentions: { parse: [] },
  };
}

/**
 * Approved party post in the signup channel; edited in place when leaders move people or at lock
 * (where `locked: true` turns it into the Final Roster with Standby mentions).
 */
export function renderPartyPost(
  tick: TickEvent,
  members: TickMember[],
  { locked = false, siteUrl = null }: { locked?: boolean } & CardOptions = {},
): MessageData {
  const ranks = rankMap(members);
  const { going, bench } = finalRoster(tick, members);
  const fields = partyFields(tick.event, going, bench, ranks);
  const memberById = new Map(members.map((m) => [m.memberId, m]));
  const standbyUsers = locked
    ? bench
        .map((s) => memberById.get(s.memberId)?.discordId)
        .filter((id): id is string => Boolean(id))
    : [];
  const content =
    locked && standbyUsers.length
      ? `${standbyUsers.map((id) => `<@${id}>`).join(' ')} You're on standby tonight. Stay close in case a seat opens.`
      : undefined;
  const siteLink = raidSiteLink(siteUrl, tick.event);
  const linkSuffix = siteLink ? ` · ${siteLink.markdown}` : '';
  return {
    ...(content ? { content } : {}),
    embeds: [
      embed({
        title: locked
          ? `Final roster · ${eventTitle(tick.event)}`
          : `Parties · ${eventTitle(tick.event)}`,
        description: locked
          ? `${emoji('info_calendar')} ${when(tick.event.startsAt)}  ${emoji('info_locked')} Signups locked · ${countOf(going.length, tick.event)}${linkSuffix}`
          : `${emoji('info_calendar')} ${when(tick.event.startsAt)} · ${countOf(going.length, tick.event)}${linkSuffix}`,
        color: locked
          ? discordColor('color.border.strong')
          : discordColor('color.accent.secondary'),
        fields: fields.slice(0, 25),
      }),
    ],
    allowed_mentions: standbyUsers.length ? { users: standbyUsers } : { parse: [] },
  };
}

/**
 * Fallback Final Roster at lock when nobody approved the party draft (or for non-raid events):
 * 4 role columns, Standby, and Standby mentions.
 */
export function renderFinalRoster(
  tick: TickEvent,
  members: TickMember[],
  options: CardOptions = {},
): MessageData {
  const ranks = rankMap(members);
  const { going, bench } = finalRoster(tick, members);
  const { fields } = buildRoleColumns(going, targetsOf(tick.event), ranks, tick.event);
  const sortedBench = [...bench].sort(byStandbyOrder(ranks));
  fields.push({
    name: 'Standby',
    value: sortedBench.length
      ? fitLines(
          sortedBench.map((s) => line(s, ranks)),
          FIELD_MAX,
          ' · ',
        ).text
      : '—',
  });
  const memberById = new Map(members.map((m) => [m.memberId, m]));
  const standbyUsers = sortedBench
    .map((s) => memberById.get(s.memberId)?.discordId)
    .filter((id): id is string => Boolean(id));
  const content = standbyUsers.length
    ? `${standbyUsers.map((id) => `<@${id}>`).join(' ')} You're on standby tonight. Stay close in case a seat opens.`
    : undefined;
  const open = tick.event.size !== null ? Math.max(0, tick.event.size - going.length) : 0;
  const openSuffix = open > 0 ? ` · ${open} open` : '';
  const siteLink = raidSiteLink(options.siteUrl, tick.event);
  const linkSuffix = siteLink ? ` · ${siteLink.markdown}` : '';
  return {
    ...(content ? { content } : {}),
    embeds: [
      embed({
        title: `Final roster · ${eventTitle(tick.event)}`,
        description: `${emoji('info_calendar')} ${when(tick.event.startsAt)}  ${emoji('info_locked')} Signups locked · ${countOf(going.length, tick.event)}${openSuffix}${linkSuffix}`,
        color: discordColor('color.border.strong'),
        fields,
      }),
    ],
    allowed_mentions: standbyUsers.length ? { users: standbyUsers } : { parse: [] },
  };
}
