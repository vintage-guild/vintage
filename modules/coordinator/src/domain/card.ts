// The coordinator's raid cards (signup-improvements §1 & §1a):
// - Four role columns (Tanks / Healers on row 1, Melee / Ranged on row 2, padded with empty inline
//   spacers so Discord renders 2x2), sorted by class then name.
// - Spec icons (`spec_<class>_<spec>`, falling back to `square_<class>`), no spec text, no place
//   numbers, late minutes icon/text, and recruit sprout mark.
// - Line-safe character-budget packing (<= 1,024 chars/field, never slicing mid-token).
// - Tentative reasons inline (no Notes field or footer); Missing going-only + subtext if tentative
//   or standby would change it.
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
  hasRoleTargets,
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
import { cardTitle, countOf, eventTitle, sizeWords } from './kind-words';
import { compFor, finalRoster } from './render';

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

const GOING = new Set(['accepted', 'late']);
const inRaid = (s: Signup) => GOING.has(s.status) && s.roster !== 'benched';

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

/** "<icon> **12** going  <icon> **2** late  …  <icon> **1** absent". */
function statusLine(signups: Signup[], awayCount = 0): string {
  const n = (pred: (s: Signup) => boolean) => signups.filter(pred).length;
  const parts = [
    [emoji('status_going'), n((s) => s.status === 'accepted' && s.roster !== 'benched'), 'going'],
    [emoji('status_late'), n((s) => s.status === 'late' && s.roster !== 'benched'), 'late'],
    [emoji('status_tentative'), n((s) => s.status === 'tentative'), 'tentative'],
    [emoji('status_standby'), n((s) => s.status === 'bench' || s.roster === 'benched'), 'standby'],
    [emoji('status_out'), n((s) => s.status === 'declined') + awayCount, 'absent'],
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
  /** Base site URL (e.g. `https://vintage.guild`) for Raid page / Edit in quarters link buttons. */
  siteUrl?: string | null;
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

/**
 * The signup post (Card v2): 2x2 role columns (Tanks/Healers, Melee/Ranged), sorted by class then
 * name, spec icons, late minutes, recruit mark, inline Tentative reasons, Standby, going-only
 * Missing + tentative/standby subtext, answer buttons, and Row 2 Raid page + Roster.
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
  const going = signups.filter(inRaid);
  const standby = signups
    .filter((s) => s.status === 'bench' || s.roster === 'benched')
    .sort(byStandbyOrder(ranks));
  const maybe = signups.filter((s) => s.status === 'tentative').sort(byClassThenName);

  const lock = locked
    ? `${emoji('info_locked')} Signups locked`
    : `${emoji('info_open')} Signups open · lock ${timings.lockHours}h before`;

  const { fields, hidden: columnHidden } = buildRoleColumns(going, targets, ranks, event);
  let hidden = columnHidden;

  if (standby.length) {
    const fitted = fitLines(
      standby.map((s) => line(s, ranks)),
      FIELD_MAX,
      ' · ',
      `${emoji('status_standby')} **Standby** `,
    );
    hidden += fitted.hidden;
    fields.push({ name: BLANK, value: fitted.text });
  }
  if (maybe.length) {
    const fitted = fitLines(
      maybe.map((s) => `${line(s, ranks)}${s.note ? ` (${s.note})` : ''}`),
      FIELD_MAX,
      ' · ',
      `${emoji('status_tentative')} **Tentative** `,
    );
    hidden += fitted.hidden;
    fields.push({ name: BLANK, value: fitted.text });
  }
  fields.push({ name: BLANK, value: buildMissingValue(tick, members) });

  const awayCount = tick.away?.length ?? 0;
  const showRoster = hidden > 0 || awayCount > 0 || signups.some((s) => s.status === 'declined');
  const row2 = [
    ...(options.siteUrl
      ? [linkButton(`${options.siteUrl.replace(/\/$/, '')}/raids/${event.id}`, 'Raid page')]
      : []),
    ...(showRoster ? [button(`roster:${event.id}`, 'Roster', ButtonStyle.SECONDARY)] : []),
  ];

  return {
    embeds: [
      embed({
        title: cardTitle(event),
        description: [
          `${emoji('info_calendar')} ${when(event.startsAt)}`,
          `-# ${lock} · ${sizeWords(event)}`,
          ...notesLines(event),
          '',
          statusLine(signups, awayCount),
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
      ...(row2.length ? [actionRow(...row2)] : []),
    ],
    allowed_mentions: { parse: [] },
  };
}

/** Does the card leave anyone out that the Roster reply would show? */
export function cardHidesSomeone(tick: TickEvent, members: TickMember[] = []): boolean {
  const targets = targetsOf(tick.event);
  const ranks = rankMap(members);
  const going = tick.signups.filter(inRaid);
  const { hidden } = buildRoleColumns(going, targets, ranks, tick.event);
  if (hidden > 0) return true;
  const standby = tick.signups
    .filter((s) => s.status === 'bench' || s.roster === 'benched')
    .sort(byStandbyOrder(ranks));
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
  const maybe = tick.signups.filter((s) => s.status === 'tentative').sort(byClassThenName);
  if (
    maybe.length &&
    fitLines(
      maybe.map((s) => `${line(s, ranks)}${s.note ? ` (${s.note})` : ''}`),
      FIELD_MAX,
      ' · ',
      `${emoji('status_tentative')} **Tentative** `,
    ).hidden > 0
  ) {
    return true;
  }
  return (tick.away?.length ?? 0) > 0 || tick.signups.some((s) => s.status === 'declined');
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
 * Everyone signed up, privately (the Roster button): 4 roles in full, then Standby, Tentative
 * (with inline reasons), and Absent.
 */
export function renderRosterReply(
  event: RaidEvent,
  signups: Signup[],
  members: TickMember[] = [],
  away: readonly Pick<TickAway, 'displayName'>[] = [],
): MessageData {
  const ranks = rankMap(members);
  const going = signups.filter(inRaid);
  const fields = ALL_ROLES.flatMap(([role, label]) => {
    const inRole = going.filter((s) => s.role === role).sort(byClassThenName);
    return chunkFields(
      `${headerIcon(role)} ${label} (${inRole.length})`.trim(),
      inRole.map((s) => line(s, ranks)),
      true,
    );
  });
  const group = (title: string, list: Signup[], withNote = false) =>
    list.length
      ? chunkFields(
          `${title} (${list.length})`,
          list.map((s) => `${line(s, ranks)}${withNote && s.note ? ` (${s.note})` : ''}`),
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
    ...group(
      'Standby',
      signups
        .filter((s) => s.status === 'bench' || s.roster === 'benched')
        .sort(byStandbyOrder(ranks)),
    ),
    ...group(
      'Tentative',
      signups.filter((s) => s.status === 'tentative').sort(byClassThenName),
      true,
    ),
    ...(absentLines.length
      ? chunkFields(`Absent (${absentLines.length})`, absentLines, false)
      : []),
  );
  return {
    embeds: [
      embed({
        title: `Roster · ${eventTitle(event)}`,
        description: `${emoji('info_calendar')} ${when(event.startsAt)}\n\n${statusLine(signups, away.length)}\n${BLANK}`,
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
  const fields = partyFields(tick.event, going, bench, ranks);
  const buttons = [
    button(`party-approve:${tick.event.id}`, 'Approve and post', ButtonStyle.SUCCESS, {
      disabled: approved,
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
          approved
            ? `-# Approved · ${countOf(going.length, tick.event)}`
            : `-# Waiting for approval · ${countOf(going.length, tick.event)}`,
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
  { locked = false }: { locked?: boolean } = {},
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
  return {
    ...(content ? { content } : {}),
    embeds: [
      embed({
        title: locked
          ? `Final roster · ${eventTitle(tick.event)}`
          : `Parties · ${eventTitle(tick.event)}`,
        description: locked
          ? `${emoji('info_calendar')} ${when(tick.event.startsAt)}  ${emoji('info_locked')} Signups locked · ${countOf(going.length, tick.event)}`
          : `${emoji('info_calendar')} ${when(tick.event.startsAt)} · ${countOf(going.length, tick.event)}`,
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
export function renderFinalRoster(tick: TickEvent, members: TickMember[]): MessageData {
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
  return {
    ...(content ? { content } : {}),
    embeds: [
      embed({
        title: `Final roster · ${eventTitle(tick.event)}`,
        description: `${emoji('info_calendar')} ${when(tick.event.startsAt)}  ${emoji('info_locked')} Signups locked · ${countOf(going.length, tick.event)}`,
        color: discordColor('color.border.strong'),
        fields,
      }),
    ],
    allowed_mentions: standbyUsers.length ? { users: standbyUsers } : { parse: [] },
  };
}
