// What the home page says about raid nights and signup timings, from the guild's real schedules
// (`schedule-list`), not from copy: change a schedule and the sentence follows.
import {
  DEFAULT_TIMINGS,
  type Schedule,
  type ScheduleTimings,
  type Weekday,
} from '@vintage/raids/contract';
import { wallClock, zonedInstant } from '@vintage/ui-kit/zoned';

const DAY_MS = 86_400_000;

/** The next start of a schedule's night on `weekday`, after `now`. */
export function nextNight(weekday: Weekday, schedule: Schedule, now: number): number {
  const { time, timeZone } = schedule.recurrence;
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  for (let i = 0; i < 8; i++) {
    const day = wallClock(now + i * DAY_MS, timeZone);
    if (day.weekday !== weekday) continue;
    const at = zonedInstant(day.year, day.month, day.day, hour, minute, timeZone);
    if (at > now) return at;
  }
  return now;
}

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/**
 * "Raid nights are Wednesday and Thursday at 8:00 PM EST.", in the viewer's zone (the weekday
 * follows the zone too: 8 pm in New York is early Friday in London). Null without schedules.
 */
export function describeNights(
  schedules: readonly Schedule[],
  now: number,
  timeZone?: string,
): string | null {
  const nights = schedules
    .filter((s) => s.active)
    .flatMap((s) => s.recurrence.weekdays.map((w) => nextNight(w, s, now)))
    .sort((a, b) => a - b);
  if (nights.length === 0) return null;
  const zone = timeZone ? { timeZone } : {};
  const byTime = new Map<string, string[]>();
  for (const at of nights) {
    const time = new Date(at).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      ...zone,
    });
    const day = new Date(at).toLocaleDateString(undefined, { weekday: 'long', ...zone });
    const days = byTime.get(time) ?? [];
    if (!days.includes(day)) days.push(day);
    byTime.set(time, days);
  }
  const parts = [...byTime].map(([time, days]) => `${list(days)} at ${time}`);
  return `Raid nights are ${list(parts)}.`;
}

const timingsSentence = (t: ScheduleTimings) =>
  `signups post ${t.leadDays} day${t.leadDays === 1 ? '' : 's'} ahead and lock ` +
  `${t.lockHours} hour${t.lockHours === 1 ? '' : 's'} before the pull` +
  (t.reminderHours.length > 0
    ? `; anyone who hasn’t answered is reminded at ${t.reminderHours.map((h) => `${h}h`).join(' and ')}`
    : '');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * When signups post, lock, and remind, from the active schedules' timings. Schedules that share
 * timings share a sentence; with none, the timings one-off raids use.
 */
export function describeTimings(schedules: readonly Schedule[]): string {
  const active = schedules.filter((s) => s.active);
  if (active.length === 0) return `${capitalize(timingsSentence(DEFAULT_TIMINGS))}.`;
  const groups = new Map<string, { timings: ScheduleTimings; names: string[] }>();
  for (const s of active) {
    const key = JSON.stringify(s.timings);
    const group = groups.get(key) ?? { timings: s.timings, names: [] };
    group.names.push(s.name);
    groups.set(key, group);
  }
  if (groups.size === 1) {
    const [only] = groups.values();
    return `${capitalize(timingsSentence(only!.timings))}.`;
  }
  return [...groups.values()]
    .map((g) => `For ${list(g.names)}, ${timingsSentence(g.timings)}.`)
    .join(' ');
}

/**
 * The note after the next raid's time: "signups lock Sat 6:00 PM EST" (`raid-list`'s
 * `locksAt`), "signups close any minute" once that's passed but Random hasn't locked yet, and
 * "locked · roster posted" after. Empty without a lock time (an older server).
 */
export function lockLabel(
  status: string,
  locksAt: number | undefined,
  now: number,
  timeZone?: string,
): string {
  if (status === 'locked') return 'locked · roster posted';
  if (locksAt === undefined) return '';
  if (now >= locksAt) return 'signups close any minute';
  const zone = timeZone ? { timeZone } : {};
  const at = new Date(locksAt);
  const day = at.toLocaleDateString(undefined, { weekday: 'short', ...zone });
  const time = at.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...zone,
  });
  return `signups lock ${day} ${time}`;
}
