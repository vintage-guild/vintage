// The coordinator's raid cards: Discord embeds with three role columns (Components V2 can't do
// columns), our own outline status icons, and class-colored squares, all as the app's own emoji.
// Columns cap at a few names so a 40-person card keeps its height; the Roster button shows the full
// list privately. Pure: data in, MessageData out. Ideas from docs/research/raid-helper.md.
import { type CompGap, compRoleOf, defaultTemplate } from '@vintage/comp-solver';
import { discordColor } from '@vintage/design-tokens';
import {
  actionRow,
  ButtonStyle,
  button,
  discordTimestamp,
  type EmbedField,
  embed,
  type MessageData,
  TimestampStyle,
} from '@vintage/discord-kit';
import type { RaidEvent, Signup } from '@vintage/raids/contract';
import type { TickEvent, TickMember } from '../store';
import { EMOJI_IDS } from './emoji-ids';
import { compFor, finalRoster } from './render';

type CompRoleName = 'tank' | 'healer' | 'dps';
const ROLES: [CompRoleName, string][] = [
  ['tank', 'Tanks'],
  ['healer', 'Healers'],
  ['dps', 'DPS'],
];

/** Discord collapses repeated spaces, so the status counts are spaced with em spaces. */
const GAP = String.fromCharCode(0x2003);
/** An empty line: spacing at the end of a description, or an empty field name. */
const BLANK = String.fromCharCode(0x200b);

/** Names shown per column before "+N more"; the Roster button shows everyone. */
export const COLUMN_CAP = 8;
const FIELD_MAX = 1024;

const GOING = new Set(['accepted', 'late']);
const inRaid = (s: Signup) => GOING.has(s.status) && !s.queued;

/** `<:name:id>` for one of the app's emoji, or '' when it isn't uploaded. */
export function emoji(name: string): string {
  const id = EMOJI_IDS[name];
  return id ? `<:${name}:${id}>` : '';
}

/** A column header: the role's outline icon, its name, and a count. */
const header = (role: CompRoleName, label: string, count: string) =>
  `${emoji(`head_${role}`)} ${label} ${count}`.trim();

const SHORT_SPEC: Record<string, string> = {
  protection: 'prot',
  restoration: 'resto',
  'feral-tank': 'bear',
  'beast-mastery': 'bm',
  marksmanship: 'mm',
  assassination: 'assa',
  discipline: 'disc',
  enhancement: 'enh',
  elemental: 'ele',
  affliction: 'affli',
  demonology: 'demo',
  destruction: 'destro',
  retribution: 'ret',
};
const shortSpec = (spec: string) => SHORT_SPEC[spec] ?? spec;

/** Place in line among everyone going, 1-based, by first answer. */
function places(signups: Signup[]): Map<string, number> {
  const going = signups
    .filter((s) => GOING.has(s.status))
    .sort((a, b) => a.signedUpAt - b.signedUpAt || a.id.localeCompare(b.id));
  return new Map(going.map((s, i) => [s.id, i + 1]));
}

/** "<square> 3 Frostwyn *frost*" plus a clock when late. */
function line(s: Signup, place?: number): string {
  const late = s.status === 'late' ? ` ${emoji('status_late')}` : '';
  const n = place ? `${place} ` : '';
  return `${emoji(`square_${s.class}`)} ${n}${s.characterName} *${shortSpec(s.spec)}*${late}`.trim();
}

const capped = (lines: string[], cap = COLUMN_CAP) =>
  lines.length <= cap ? lines : [...lines.slice(0, cap), `+${lines.length - cap} more…`];

const value = (lines: string[]) => (lines.length ? lines.join('\n') : '—').slice(0, FIELD_MAX);

const when = (ms: number) =>
  `${discordTimestamp(ms, TimestampStyle.LONG_DATE_TIME)} · ${discordTimestamp(ms, TimestampStyle.RELATIVE)}`;

const targetsFor = (event: RaidEvent) => event.roleTargets ?? defaultTemplate(event.size).targets;

const BUFF_SHORT: Record<string, string> = {
  'Mark of the Wild': 'MotW',
  'Power Word: Fortitude': 'Fort',
  'Arcane Intellect': 'Int',
};

/** "2 tanks · 7 healers · MotW · Fort". */
function missing(gaps: CompGap[]): string {
  return gaps
    .map((g) =>
      g.kind === 'requirement' ? (BUFF_SHORT[g.label] ?? g.label) : g.reason.replace(/^need /, ''),
    )
    .join(' · ');
}

/** "<icon> **12** going  <icon> **2** late …", queued only when someone is waiting. */
function statusLine(signups: Signup[]): string {
  const n = (pred: (s: Signup) => boolean) => signups.filter(pred).length;
  const parts = [
    [emoji('status_going'), n((s) => s.status === 'accepted' && !s.queued), 'going'],
    [emoji('status_late'), n((s) => s.status === 'late' && !s.queued), 'late'],
    [emoji('status_tentative'), n((s) => s.status === 'tentative'), 'tentative'],
    [emoji('status_standby'), n((s) => s.status === 'bench'), 'standby'],
    [emoji('status_out'), n((s) => s.status === 'declined'), 'out'],
  ] as const;
  const queued = n((s) => s.queued);
  const all = queued ? [...parts, [emoji('status_queued'), queued, 'queued'] as const] : parts;
  return all.map(([icon, count, label]) => `${icon} **${count}** ${label}`.trim()).join(GAP);
}

/** "Late: Bramble (after work) · Tentative: Pip (maybe)" for the footer, or undefined. */
function reasons(signups: Signup[]): string | undefined {
  const groups: [Signup['status'], string][] = [
    ['late', 'Late'],
    ['tentative', 'Tentative'],
    ['bench', 'Standby'],
  ];
  const parts = groups.flatMap(([status, title]) => {
    const noted = signups.filter((s) => s.status === status && s.note);
    return noted.length
      ? [`${title}: ${noted.map((s) => `${s.characterName} (${s.note})`).join(', ')}`]
      : [];
  });
  return parts.length ? parts.join(' · ') : undefined;
}

const SIGNUP_BUTTONS = [
  ['accepted', 'Accept', ButtonStyle.SUCCESS],
  ['late', 'Late', ButtonStyle.PRIMARY],
  ['tentative', 'Tentative', ButtonStyle.SECONDARY],
  ['bench', 'Standby', ButtonStyle.SECONDARY],
  ['declined', 'Decline', ButtonStyle.DANGER],
] as const;

/**
 * The signup post: when and how it locks, status counts, three role columns against the comp
 * targets (class square, place in line, name, spec), the queue, standby and tentative, what the comp
 * is missing, reasons in the footer, the answer buttons, and a Roster button for the full list.
 */
export function renderSignupPost(tick: TickEvent, members: TickMember[]): MessageData {
  const { event, signups, timings } = tick;
  const locked = event.status === 'locked';
  const targets = targetsFor(event);
  const place = places(signups);
  const going = signups.filter(inRaid);
  const queue = signups.filter((s) => s.queued).sort((a, b) => a.signedUpAt - b.signedUpAt);
  const standby = signups.filter((s) => s.status === 'bench');
  const maybe = signups.filter((s) => s.status === 'tentative');
  const comp = compFor(tick, members);

  const lock = locked
    ? `${emoji('info_locked')} Signups locked`
    : `${emoji('info_open')} Signups open · lock ${timings.lockHours}h before`;
  const fields: EmbedField[] = ROLES.map(([role, label]) => {
    const inRole = going.filter((s) => compRoleOf(s.role) === role);
    return {
      name: header(role, label, `${inRole.length}/${targets[role]}`),
      value: value(capped(inRole.map((s) => line(s, place.get(s.id))))),
      inline: true,
    };
  });
  if (queue.length) {
    fields.push({
      name: `Queue ${queue.length}`,
      value: value([
        capped(
          queue.map((s, i) => `${i + 1}. ${line(s)}`),
          10,
        ).join(' · '),
      ]),
    });
  }
  const sitting = [
    standby.length
      ? `${emoji('status_standby')} **Standby** ${capped(
          standby.map((s) => line(s)),
          10,
        ).join(' · ')}`
      : null,
    maybe.length
      ? `${emoji('status_tentative')} **Tentative** ${capped(
          maybe.map((s) => line(s)),
          10,
        ).join(' · ')}`
      : null,
  ].filter((l): l is string => l !== null);
  if (sitting.length) fields.push({ name: BLANK, value: value(sitting) });
  fields.push({
    name: BLANK,
    value: comp.gaps.length
      ? `${emoji('info_missing')} **Missing** ${missing(comp.gaps)}`
      : '**Comp** no gaps',
  });

  const footer = reasons(signups);
  return {
    embeds: [
      embed({
        title: `${event.name} · ${event.instance}`,
        // When; the lock and size as quieter subtext; then the counts with room around them.
        description: [
          `${emoji('info_calendar')} ${when(event.startsAt)}`,
          `-# ${lock} · ${event.size}-person`,
          '',
          statusLine(signups),
          BLANK,
        ].join('\n'),
        color: locked
          ? discordColor('color.border.strong')
          : discordColor('color.accent.secondary'),
        fields,
        ...(footer ? { footer: { text: footer } } : {}),
      }),
    ],
    components: [
      actionRow(
        ...SIGNUP_BUTTONS.map(([status, text, style]) =>
          button(`signup:${event.id}:${status}`, text, style, { disabled: locked }),
        ),
      ),
      actionRow(button(`roster:${event.id}`, 'Roster', ButtonStyle.SECONDARY)),
    ],
    allowed_mentions: { parse: [] },
  };
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
 * Everyone signed up, privately (the Roster button): each role in full with places in line, then
 * the queue, standby, tentative, and declined, and the reasons.
 */
export function renderRosterReply(event: RaidEvent, signups: Signup[]): MessageData {
  const place = places(signups);
  const going = signups.filter(inRaid);
  const fields = ROLES.flatMap(([role, label]) => {
    const inRole = going.filter((s) => compRoleOf(s.role) === role);
    return chunkFields(
      header(role, label, `(${inRole.length})`),
      inRole.map((s) => line(s, place.get(s.id))),
      true,
    );
  });
  const group = (title: string, list: Signup[]) =>
    list.length
      ? chunkFields(
          `${title} (${list.length})`,
          list.map((s) => line(s)),
          false,
        )
      : [];
  fields.push(
    ...group(
      'Queue',
      signups.filter((s) => s.queued),
    ),
    ...group(
      'Standby',
      signups.filter((s) => s.status === 'bench'),
    ),
    ...group(
      'Tentative',
      signups.filter((s) => s.status === 'tentative'),
    ),
    ...group(
      'Declined',
      signups.filter((s) => s.status === 'declined'),
    ),
  );
  const footer = reasons(signups);
  return {
    embeds: [
      embed({
        title: `Roster · ${event.name}`,
        description: `${emoji('info_calendar')} ${when(event.startsAt)}\n\n${statusLine(signups)}\n${BLANK}`,
        fields: fields.slice(0, 25),
        ...(footer ? { footer: { text: footer } } : {}),
      }),
    ],
    allowed_mentions: { parse: [] },
  };
}

/** The final roster at lock: who's in per role (in columns), then who the leader benched. */
export function renderFinalRoster(tick: TickEvent, members: TickMember[]): MessageData {
  const { going, bench } = finalRoster(tick, members);
  const fields: EmbedField[] = ROLES.map(([role, label]) => {
    const inRole = going.filter((s) => compRoleOf(s.role) === role);
    return {
      name: header(role, label, String(inRole.length)),
      value: value(
        capped(
          inRole.map((s) => line(s)),
          15,
        ),
      ),
      inline: true,
    };
  });
  fields.push({ name: 'Benched', value: value([bench.map((s) => line(s)).join(' · ')]) });
  return {
    embeds: [
      embed({
        title: `Final roster · ${tick.event.name}`,
        description: `${emoji('info_calendar')} ${when(tick.event.startsAt)}  ${emoji('info_locked')} Signups locked · ${going.length}/${tick.event.size}`,
        color: discordColor('color.border.strong'),
        fields,
      }),
    ],
    allowed_mentions: { parse: [] },
  };
}
