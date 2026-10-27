// Events from Discord (#151; `/random raid` until then). Pure over ports, so Convex
// (convex/discord.ts) and the JTBD host run the same flow:
//   /random event create …      → raid-create as the member; the coordinator then posts its card
//   /random event pick-night …  → raid-night-poll as the member; the poll goes up in the signup channel
// `kind` (default raid) and the optional tanks/healers/dps counts pass through. Times are typed in
// the guild's clock and echoed back as Discord timestamps. Commands decide everything else (raid
// leader tier, sizes per kind, time rules); this file only translates.
import {
  discordTimestamp,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  subcommandPath,
  TimestampStyle,
} from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import { type WallClock, wallClock, zonedTime } from '@vintage/raids/commands';
import {
  defaultRoleTargets,
  EVENT_KINDS,
  type EventKind,
  kindNoun,
  type RaidEvent,
  type RoleTargets,
  type Schedule,
  sizeLabel,
  targetsOf,
} from '@vintage/raids/contract';
import {
  commandOptions,
  discordCaller,
  ephemeral,
  failureText,
  type MemberPorts,
  type OptionValues,
  SLASH_COMMAND,
} from './discord-common';

export const EVENT_GROUP = 'event';
/** The guild's clock when no schedule names one; raid-night-poll uses the same default. */
export const FALLBACK_TIME_ZONE = 'America/New_York';
export const DEFAULT_RAID_HOURS = 3;
export const DEFAULT_VOTE_HOURS = 24;

const HOUR = 60 * 60 * 1000;

export interface EventPorts extends MemberPorts {
  /** Runs a command through the registry as this caller. */
  run(caller: Caller, name: string, input: unknown): Promise<CommandResult<unknown>>;
  /** A raid was made: start a coordinator tick so its signup card goes up now. */
  afterChange(): Promise<void>;
  now(): number;
}

const TIME_SHAPE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})[\sT]+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i;

/**
 * A start time typed in the guild's clock: `2026-11-10 20:00`, `2026-11-10 8pm`, or
 * `2026-11-10 8:30 pm`. Null when it can't be read, names a day that doesn't exist, or falls in
 * the hour daylight saving skips.
 */
export function parseLocalTime(text: string, timeZone: string): number | null {
  const m = TIME_SHAPE.exec(text);
  if (!m) return null;
  const [, y, mo, d, h, mi, ampm] = m;
  let hour = Number(h);
  const minute = mi ? Number(mi) : 0;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return null;
  const wanted: WallClock = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour,
    minute,
  };
  const at = zonedTime(wanted, timeZone);
  const got = wallClock(at, timeZone);
  const same =
    got.year === wanted.year &&
    got.month === wanted.month &&
    got.day === wanted.day &&
    got.hour === wanted.hour &&
    got.minute === wanted.minute;
  return same ? at : null;
}

/** "Tue, Nov 10 at 8:00 PM (in 2 weeks)" for every reader in their own zone. */
const when = (ms: number) =>
  `${discordTimestamp(ms, TimestampStyle.LONG_DATE_TIME)} (${discordTimestamp(ms, TimestampStyle.RELATIVE)})`;

const NEEDS_LEADER =
  'Making events from Discord needs the Raid Leader rank or higher. Ask a raid leader or officer.';

const unreadable = (text: string, zone: string) =>
  ephemeral(
    `I couldn't read “${text}” as a time. Use the guild's clock (${zone}), like ` +
      '`2026-11-10 20:00` or `2026-11-10 8pm`.',
  );

/**
 * The guild's clock, chosen as the site's calendar does: the first active schedule's zone, else
 * the first schedule's (all paused), else the fallback.
 */
async function guildTimeZone(ports: EventPorts, caller: Caller): Promise<string> {
  const result = await ports.run(caller, 'schedule-list', { includeInactive: true });
  const schedules = result.success ? ((result.data as Schedule[] | undefined) ?? []) : [];
  const schedule = schedules.find((s) => s.active) ?? schedules[0];
  return schedule?.recurrence.timeZone ?? FALLBACK_TIME_ZONE;
}

const durationMinutes = (values: OptionValues) =>
  Math.round((typeof values.hours === 'number' ? values.hours : DEFAULT_RAID_HOURS) * 60);

/** The kind option; raid when left out (or something Discord shouldn't have sent). */
const kindFrom = (values: OptionValues): EventKind =>
  (EVENT_KINDS as readonly unknown[]).includes(values.kind) ? (values.kind as EventKind) : 'raid';

/**
 * roleTargets when any of tanks, healers or dps was given. Tanks and healers left out come from
 * the kind's default; dps left out fills the rest, so `healers: 3` on a 10-player battleground
 * means 0/3/7. Undefined when none was given, so the command keeps the kind's default.
 */
function roleTargetsFrom(values: OptionValues, kind: EventKind): RoleTargets | undefined {
  const given = (name: string) => (typeof values[name] === 'number' ? Number(values[name]) : null);
  const [tanks, healers, dps] = [given('tanks'), given('healers'), given('dps')];
  if (tanks === null && healers === null && dps === null) return undefined;
  const size = typeof values.size === 'number' ? values.size : null;
  const base = defaultRoleTargets(kind, size);
  const tank = tanks ?? base.tank;
  const healer = healers ?? base.healer;
  // An open event has no size to fill, so dps left out is just the default (0 for other).
  const rest = size === null ? base.dps : Math.max(0, size - tank - healer);
  return { tank, healer, dps: dps ?? rest };
}

/** The kind, and roleTargets only when the member set some. */
function kindInput(values: OptionValues) {
  const kind = kindFrom(values);
  const roleTargets = roleTargetsFrom(values, kind);
  return { kind, ...(roleTargets ? { roleTargets } : {}) };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Westfall, open event" or "5-player dungeon": the instance (when given) and the size. */
const whatText = (e: Pick<RaidEvent, 'instance' | 'kind' | 'size'>) =>
  [e.instance, sizeLabel(e.kind, e.size)].filter(Boolean).join(', ');

/** "1 tank · 1 healer · 3 DPS", or a note that anyone fills any slot. */
function rolesText(targets: RoleTargets): string {
  if (targets.tank + targets.healer + targets.dps === 0) return 'any roles';
  return [
    plural(targets.tank, 'tank', 'tanks'),
    plural(targets.healer, 'healer', 'healers'),
    `${targets.dps} DPS`,
  ].join(' · ');
}

async function create(ports: EventPorts, caller: Caller, values: OptionValues) {
  const zone = await guildTimeZone(ports, caller);
  const text = String(values.start ?? '');
  const startsAt = parseLocalTime(text, zone);
  if (startsAt === null) return unreadable(text, zone);
  const result = await ports.run(caller, 'raid-create', {
    name: String(values.name ?? ''),
    instance: String(values.instance ?? ''),
    ...kindInput(values),
    size: values.size,
    startsAt,
    durationMinutes: durationMinutes(values),
  });
  if (!result.success) {
    return ephemeral(
      failureText(result, NEEDS_LEADER, `That ${kindNoun(kindFrom(values))} isn't valid.`),
    );
  }
  await ports.afterChange();
  const raid = result.data as RaidEvent;
  return ephemeral(
    `Made **${raid.name}** (${whatText(raid)}) for ` +
      `${when(raid.startsAt)}, looking for ${rolesText(targetsOf(raid))}. ` +
      'Its signup card goes up in the signup channel in a moment.',
  );
}

/** "a; b | c" or one per line → the parts, trimmed. */
const splitTimes = (text: string) =>
  text
    .split(/[;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

async function pickNight(ports: EventPorts, caller: Caller, values: OptionValues) {
  const zone = await guildTimeZone(ports, caller);
  const startTimes: number[] = [];
  for (const text of splitTimes(String(values.times ?? ''))) {
    const at = parseLocalTime(text, zone);
    if (at === null) return unreadable(text, zone);
    startTimes.push(at);
  }
  const voteHours = typeof values.vote_hours === 'number' ? values.vote_hours : DEFAULT_VOTE_HOURS;
  const result = await ports.run(caller, 'raid-night-poll', {
    name: String(values.name ?? ''),
    instance: String(values.instance ?? ''),
    ...kindInput(values),
    size: values.size,
    durationMinutes: durationMinutes(values),
    startTimes,
    closesAt: ports.now() + voteHours * HOUR,
    timeZone: zone,
    ...(typeof values.quorum === 'number' ? { quorum: values.quorum } : {}),
  });
  if (!result.success) {
    return ephemeral(failureText(result, NEEDS_LEADER, "That vote isn't valid."));
  }
  const { poll, raidNight } = result.data as {
    poll: { closesAt: number | null };
    raidNight: Pick<RaidEvent, 'kind' | 'size' | 'roleTargets'>;
  };
  const sorted = [...startTimes].sort((a, b) => a - b);
  const closes = poll.closesAt
    ? ` Voting closes ${discordTimestamp(poll.closesAt, TimestampStyle.RELATIVE)}.`
    : '';
  return ephemeral(
    `The vote on **${String(values.name)}**’s night is up in the signup channel.${closes}\n` +
      `${sorted.map((t) => `• ${when(t)}`).join('\n')}\n` +
      `The winning time becomes the ${sizeLabel(raidNight.kind, raidNight.size)}, looking for ` +
      `${rolesText(targetsOf(raidNight))}; a tie or too few votes goes to the officers instead.`,
  );
}

/** Is this `/random event …`? */
export function isEventInteraction(interaction: Interaction): boolean {
  return (
    interaction.type === InteractionType.APPLICATION_COMMAND &&
    interaction.data?.name === SLASH_COMMAND &&
    subcommandPath(interaction)[0] === EVENT_GROUP
  );
}

export async function handleEventInteraction(
  interaction: Interaction,
  ports: EventPorts,
): Promise<InteractionResponse | null> {
  if (!isEventInteraction(interaction)) return null;
  const who = await discordCaller(interaction, ports, 'raids');
  if ('refusal' in who) return who.refusal;
  const values = commandOptions(interaction);
  const [, sub] = subcommandPath(interaction);
  if (sub === 'create') return create(ports, who.caller, values);
  if (sub === 'pick-night') return pickNight(ports, who.caller, values);
  return null;
}
