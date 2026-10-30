// Events from Discord (#151; `/random raid` until then). Pure over ports, so Convex
// (convex/discord.ts) and the JTBD host run the same flow:
//   /random event create …      → raid-create as the member; the coordinator then posts its card
//   /random event pick-night …  → raid-night-poll as the member; the poll goes up in the signup channel
//   /random event check-export … → raid-export-check as the member; a private summary, nothing recorded
// `kind` (default raid) and the optional tanks/healers/dps counts pass through. Times are typed in
// the guild's clock and echoed back as Discord timestamps. Commands decide everything else (raid
// leader tier, sizes per kind, time rules); this file only translates.
import {
  autocompleteResult,
  discordTimestamp,
  focusedOption,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  subcommandPath,
  TimestampStyle,
} from '@vintage/discord-kit';
import { type Caller, type CommandResult, tierAllows } from '@vintage/guild-kit';
import { type WallClock, wallClock, zonedTime } from '@vintage/raids/commands';
import {
  defaultRoleTargets,
  EVENT_KINDS,
  type EventKind,
  type ExportCheck,
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
export const when = (ms: number) =>
  `${discordTimestamp(ms, TimestampStyle.LONG_DATE_TIME)} (${discordTimestamp(ms, TimestampStyle.RELATIVE)})`;

export const NEEDS_LEADER =
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
export async function guildTimeZone(ports: EventPorts, caller: Caller): Promise<string> {
  return (await guildClock(ports, caller)).zone;
}

export interface GuildClock {
  /** IANA zone, e.g. `America/New_York`. */
  zone: string;
  /** The guild's usual start time, `HH:MM` (24h). */
  time: string;
}

/**
 * The guild's clock and usual raid time, from the same schedule `guildTimeZone` reads: the first
 * active schedule, else the first one, else the fallbacks (New York, 20:00).
 */
export async function guildClock(ports: EventPorts, caller: Caller): Promise<GuildClock> {
  const result = await ports.run(caller, 'schedule-list', { includeInactive: true });
  const schedules = result.success ? ((result.data as Schedule[] | undefined) ?? []) : [];
  const schedule = schedules.find((s) => s.active) ?? schedules[0];
  const time = schedule?.recurrence.time ?? '';
  return {
    zone: schedule?.recurrence.timeZone ?? FALLBACK_TIME_ZONE,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : FALLBACK_RAID_TIME,
  };
}

/** The start time the New event form picks when no schedule has one. */
export const FALLBACK_RAID_TIME = '20:00';

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
export function roleTargetsFrom(values: OptionValues, kind: EventKind): RoleTargets | undefined {
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
export const whatText = (e: Pick<RaidEvent, 'instance' | 'kind' | 'size'>) =>
  [e.instance, sizeLabel(e.kind, e.size)].filter(Boolean).join(', ');

/** "1 tank · 1 healer · 3 DPS", or a note that anyone fills any slot. */
export function rolesText(targets: RoleTargets): string {
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
  return ephemeral(madeText(result.data as RaidEvent));
}

/** What a raid leader sees once raid-create made the event, from the options or the form. */
export const madeText = (raid: RaidEvent) =>
  `Made **${raid.name}** (${whatText(raid)}) for ` +
  `${when(raid.startsAt)}, looking for ${rolesText(targetsOf(raid))}. ` +
  'Its signup card goes up in the signup channel in a moment.';

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

// ── /random event check-export ────────────────────────────────────────────────────────────────

const NEEDS_LEADER_CHECK =
  'Checking a raid export needs the Raid Leader rank or higher. Ask a raid leader or officer.';

/** Discord's limit for a message's text, less room for the footer. */
const MAX_REPLY = 1900;
/** Names listed per line before "and N more". */
const MAX_NAMES = 12;
/** Snapshots listed before "and N more" (a long night can take dozens). */
const MAX_SNAPSHOTS = 8;

const capped = (list: string[], max: number, sep: string) =>
  list.length <= max
    ? list.join(sep)
    : `${list.slice(0, max).join(sep)} and ${list.length - max} more`;
const names = (list: string[]) => capped(list, MAX_NAMES, ', ');

/**
 * The check as a private reply. What a leader acts on comes first (warnings, who wasn't signed
 * up, who didn't come), so a long reply loses the attendance and loot detail, not those.
 */
export function exportCheckText(check: ExportCheck): string {
  const lines: string[] = [];
  lines.push(
    check.event
      ? `**${check.event.name}** · ${when(check.event.startsAt)}`
      : '**No raid matched.** Add `event:` to check it against one.',
  );
  for (const w of check.warnings) lines.push(`⚠️ ${w.message}`);
  if (check.event && check.unknownNames.length) {
    lines.push(`Not signed up: ${names(check.unknownNames)}`);
  }
  if (check.absent.length) {
    lines.push(`Signed up but not seen: ${names(check.absent.map((a) => a.characterName))}`);
  }
  if (check.declinedButSeen.length) {
    lines.push(`Declined but came: ${names(check.declinedButSeen)}`);
  }
  if (check.standby.length) {
    lines.push(`Stood by: ${names(check.standby.map((s) => s.name))}`);
  }
  const loose = check.attendees.filter((a) => a.matchedWithoutRealm).map((a) => a.name);
  if (loose.length) lines.push(`Matched by name only: ${names(loose)}`);
  const snapshots = capped(
    check.snapshots.map(
      (s) =>
        `${s.label ?? 'snapshot'} ${s.present}${s.online < s.present ? ` (${s.present - s.online} offline)` : ''}`,
    ),
    MAX_SNAPSHOTS,
    ' · ',
  );
  lines.push(
    `Export by ${check.exporter} (addon ${check.addonVersion}), ` +
      `${plural(check.snapshots.length, 'snapshot', 'snapshots')}${snapshots ? `: ${snapshots}` : ''}`,
  );
  if (check.attendees.length) {
    const total = check.snapshots.length;
    lines.push(`Seen: ${names(check.attendees.map((a) => `${a.name} (${a.snapshots}/${total})`))}`);
  }
  if (check.loot.length) {
    const drops = check.loot.map(
      (l) =>
        `${l.itemName ?? `item ${l.itemId}`}${l.count > 1 ? ` ×${l.count}` : ''} → ${l.looter}` +
        (l.source ? ` (${l.source})` : ''),
    );
    lines.push(`Loot: ${names(drops)}`);
  }
  let text = lines.join('\n');
  if (text.length > MAX_REPLY) text = `${text.slice(0, MAX_REPLY - 1)}…`;
  return `${text}\n-# Nothing was recorded.`;
}

/** A typed raid name isn't an id: the suggestions are how to name one. */
const PICK_A_RAID =
  'I can’t find that raid. Pick it from the suggestions in `event:` (they list the last ' +
  'week’s raids), or leave `event:` out to use the raid the export names.';

async function checkExport(ports: EventPorts, caller: Caller, values: OptionValues) {
  const eventId =
    typeof values.event === 'string' && values.event.trim() ? values.event.trim() : undefined;
  const result = await ports.run(caller, 'raid-export-check', {
    exportString: String(values.export ?? ''),
    ...(eventId ? { eventId } : {}),
  });
  if (!result.success) {
    if (result.error?.code === 'RAID_NOT_FOUND') return ephemeral(PICK_A_RAID);
    return ephemeral(failureText(result, NEEDS_LEADER_CHECK, 'That export isn’t valid.'));
  }
  return ephemeral(exportCheckText(result.data as ExportCheck));
}

export interface EventAutocompletePorts extends MemberPorts {
  /** Raids in a window: one indexed read, so suggestions stay well inside 3 seconds. */
  events(window: { from: number; to: number }): Promise<RaidEvent[]>;
  /** The guild's clock, for the dates in the suggestions. */
  timeZone(): Promise<string>;
  now(): number;
}

/** How far back and ahead `event:` suggests raids. */
const SUGGEST_BACK = 7 * 24 * HOUR;
const SUGGEST_AHEAD = 24 * HOUR;

/** "Molten Core · Wed, Oct 28, 8:00 PM" in the guild's clock. */
const suggestionName = (event: RaidEvent, zone: string) =>
  `${event.name} · ${new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(event.startsAt)}`;

/** Suggestions for `event:` in `/random event check-export`: last week's raids, latest first, then tomorrow's. */
export async function handleEventAutocomplete(
  interaction: Interaction,
  ports: EventAutocompletePorts,
): Promise<InteractionResponse | null> {
  if (
    interaction.type !== InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE ||
    !isEventGroup(interaction)
  ) {
    return null;
  }
  const none = autocompleteResult([]);
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) return none;
  const focused = focusedOption(interaction);
  if (focused?.name !== 'event') return none;
  // The suggestions serve a raid-leader command and read raids directly, outside the registry,
  // so they check the same tier: nothing for raiders, Discord-only friends, or strangers.
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member || !tierAllows(member.tier, 'leader')) return none;
  const now = ports.now();
  const q = focused.value.trim().toLowerCase();
  const [events, zone] = await Promise.all([
    ports.events({ from: now - SUGGEST_BACK, to: now + SUGGEST_AHEAD }),
    ports.timeZone(),
  ]);
  const wanted = events.filter(
    (e) => e.status !== 'cancelled' && (!q || e.name.toLowerCase().includes(q)),
  );
  // An export comes after a raid: the raids that started go first, the latest at the top, then
  // the ones still to come, soonest first.
  const started = wanted.filter((e) => e.startsAt <= now).sort((a, b) => b.startsAt - a.startsAt);
  const coming = wanted.filter((e) => e.startsAt > now).sort((a, b) => a.startsAt - b.startsAt);
  const choices = [...started, ...coming].map((e) => ({
    name: suggestionName(e, zone),
    value: e.id,
  }));
  return autocompleteResult(choices);
}

const isEventGroup = (interaction: Interaction) =>
  interaction.data?.name === SLASH_COMMAND && subcommandPath(interaction)[0] === EVENT_GROUP;

/** Is this `/random event …`? */
export function isEventInteraction(interaction: Interaction): boolean {
  return interaction.type === InteractionType.APPLICATION_COMMAND && isEventGroup(interaction);
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
  if (sub === 'check-export') return checkExport(ports, who.caller, values);
  return null;
}
