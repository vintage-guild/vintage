// What the officers' calendar reads (the raids module's `RaidEvent` and `Schedule`, the slices
// the elements use) and the wording they share. ui-kit can't import modules, so the shapes are
// restated here; the page maps `raid-list` and `schedule-list` onto them.
import { type EventKind, KIND_LABELS, RAID_SIZES, type RoleTargets } from '@vintage/comp-solver';
import { offsetMinutes, type WallWeekday, wallClock } from '../zoned';

export type CalendarRaidStatus = 'open' | 'locked' | 'cancelled' | 'completed';
/** Players in an event: 1 to 40, allowed per kind (`sizeFits` in comp-solver). */
export type CalendarRaidSize = number;
/** A raid's sizes; other kinds have their own (`KIND_SIZES`). */
export const CALENDAR_SIZES: readonly number[] = RAID_SIZES;

/** One raid (or dungeon, battleground, other event) on the calendar, with its signup counts. */
export interface CalendarRaid {
  id: string;
  /** The schedule it came from; null for a one-off. */
  scheduleId: string | null;
  name: string;
  instance: string;
  kind: EventKind;
  size: CalendarRaidSize;
  /** Epoch ms. */
  startsAt: number;
  durationMinutes: number;
  status: CalendarRaidStatus;
  counts: { accepted: number; late: number; tentative: number; bench: number } | null;
}

/** One recurring raid night. */
export interface CalendarSchedule {
  id: string;
  name: string;
  instance: string;
  kind: EventKind;
  size: CalendarRaidSize;
  /** The schedule's own comp; null means the kind's default for the size. */
  roleTargets: RoleTargets | null;
  recurrence: { weekdays: WallWeekday[]; time: string; timeZone: string };
  durationMinutes: number;
  timings: { leadDays: number; reminderHours: number[]; lockHours: number };
  /** Paused schedules create no new raids. */
  active: boolean;
}

/** Sunday first, as the guild's calendar reads in the US. */
export const WEEK: readonly { day: WallWeekday; short: string; long: string }[] = [
  { day: 'sun', short: 'Sun', long: 'Sunday' },
  { day: 'mon', short: 'Mon', long: 'Monday' },
  { day: 'tue', short: 'Tue', long: 'Tuesday' },
  { day: 'wed', short: 'Wed', long: 'Wednesday' },
  { day: 'thu', short: 'Thu', long: 'Thursday' },
  { day: 'fri', short: 'Fri', long: 'Friday' },
  { day: 'sat', short: 'Sat', long: 'Saturday' },
];

export const STATUS_LABEL: Record<CalendarRaidStatus, string> = {
  open: 'Open',
  locked: 'Locked',
  cancelled: 'Cancelled',
  completed: 'Done',
};

/** Open and locked raids can still change; cancelled and completed ones are history. */
export const isLive = (r: CalendarRaid) => r.status === 'open' || r.status === 'locked';

const withZone = (options: Intl.DateTimeFormatOptions, timeZone: string) =>
  timeZone ? { ...options, timeZone } : options;

/** "8:00 PM EST". */
export function formatClock(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleTimeString(
    undefined,
    withZone({ hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }, timeZone),
  );
}

/** "Wednesday, November 4". */
export function formatDay(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleDateString(
    undefined,
    withZone({ weekday: 'long', month: 'long', day: 'numeric' }, timeZone),
  );
}

/** "Wed, Nov 4, 8:00 PM EST". */
export function formatWhen(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleString(
    undefined,
    withZone(
      {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      },
      timeZone,
    ),
  );
}

/** "3h", "2h 30m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
}

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** "Wednesday and Thursday at 20:00 New York time". */
export function describeRecurrence(s: CalendarSchedule): string {
  const days = WEEK.filter((w) => s.recurrence.weekdays.includes(w.day)).map((w) => w.long);
  const city = s.recurrence.timeZone.split('/').at(-1)?.replaceAll('_', ' ') ?? '';
  return `${list(days)} at ${s.recurrence.time} ${city} time`;
}

/** "Signups post 7 days ahead and lock 2h before; reminders at 72h and 24h". */
export function describeScheduleTimings(s: CalendarSchedule): string {
  const t = s.timings;
  const reminders = t.reminderHours.length
    ? `; reminders at ${list(t.reminderHours.map((h) => `${h}h`))}`
    : '; no reminders';
  return `Signups post ${t.leadDays} day${t.leadDays === 1 ? '' : 's'} ahead and lock ${t.lockHours}h before${reminders}`;
}

/**
 * "40-player Onyxia's Lair" for a raid; other kinds lead with theirs: "Dungeon · 5-player
 * Scarlet Monastery". Raids are the default, so they stay as they read before kinds.
 */
export function describeWhat(r: { kind: EventKind; size: number; instance: string }): string {
  const what = `${r.size}-player ${r.instance}`;
  return r.kind === 'raid' ? what : `${KIND_LABELS[r.kind]} · ${what}`;
}

/** "12 going · 3 tentative · 1 bench", or "No signups yet". */
export function describeCounts(r: CalendarRaid): string {
  const c = r.counts;
  if (!c) return '';
  const going = c.accepted + c.late;
  const parts = [`${going} of ${r.size} going`];
  if (c.tentative) parts.push(`${c.tentative} tentative`);
  if (c.bench) parts.push(`${c.bench} bench`);
  return going + c.tentative + c.bench === 0 ? 'No signups yet' : parts.join(' · ');
}

/**
 * When the viewer's clock and the guild's change on different weekends (Europe goes back a week
 * before the US, and forward three weeks after), a raid lands an hour off from usual for the
 * viewer. "Usual" is the gap between the zones in the same season: mid-July from April to
 * October, mid-January otherwise. Names the shift, or null.
 */
export function clockShift(startsAt: number, viewerZone: string, guildZone: string): string | null {
  if (!viewerZone || !guildZone || viewerZone === guildZone) return null;
  const gap = (ms: number) => offsetMinutes(ms, viewerZone) - offsetMinutes(ms, guildZone);
  const { year, month } = wallClock(startsAt, guildZone);
  const usual = gap(Date.UTC(year, month >= 3 && month <= 9 ? 6 : 0, 15, 12));
  const change = gap(startsAt) - usual;
  if (change === 0) return null;
  const hours = Math.abs(change) / 60;
  const amount = hours === 1 ? 'An hour' : `${hours} hours`;
  return `${amount} ${change > 0 ? 'later' : 'earlier'} than usual for you: the clocks change on different dates`;
}

/** The other live raids whose time overlaps this one. */
export function overlapping(raid: CalendarRaid, raids: readonly CalendarRaid[]): CalendarRaid[] {
  if (!isLive(raid)) return [];
  const end = raid.startsAt + raid.durationMinutes * 60_000;
  return raids.filter(
    (o) =>
      o.id !== raid.id &&
      isLive(o) &&
      o.startsAt < end &&
      raid.startsAt < o.startsAt + o.durationMinutes * 60_000,
  );
}
