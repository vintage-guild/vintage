// Wall-clock arithmetic in IANA time zones, DST-safe, on Intl alone. Raids are stored as instants
// and schedules as a local time in the guild's zone; these turn one into the other and group
// instants by the day a viewer sees them on.

export type WallWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface WallClock {
  year: number;
  /** 0–11, like `Date`. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: WallWeekday;
}

/** Year, month, day, hour, minute, and weekday of an instant as a zone's wall clock shows it. */
export function wallClock(ms: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')) - 1,
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday').toLowerCase() as WallWeekday,
  };
}

/** Minutes the zone is ahead of UTC at an instant (-240 for New York in summer). */
export function offsetMinutes(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone);
  return Math.round((Date.UTC(w.year, w.month, w.day, w.hour, w.minute) - ms) / 60_000);
}

/** The instant a zone's wall clock reads the given date and time (DST-safe). */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const wanted = Date.UTC(year, month, day, hour, minute);
  const first = wanted - offsetMinutes(wanted, timeZone) * 60_000;
  return wanted - offsetMinutes(first, timeZone) * 60_000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-04`: the day an instant falls on in a zone, for grouping and `<time datetime>`. */
export function dayKey(ms: number, timeZone: string): string {
  const w = wallClock(ms, timeZone);
  return `${w.year}-${pad(w.month + 1)}-${pad(w.day)}`;
}

/** `20:00`: an instant's wall-clock time in a zone, as `<input type="time">` reads it. */
export function timeOfDay(ms: number, timeZone: string): string {
  const w = wallClock(ms, timeZone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** The instant for a `YYYY-MM-DD` date and `HH:MM` time in a zone, or null if either is malformed. */
export function instantFromInputs(date: string, time: string, timeZone: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  return zonedInstant(
    Number(d[1]),
    Number(d[2]) - 1,
    Number(d[3]),
    Number(t[1]),
    Number(t[2]),
    timeZone,
  );
}

/** The zone the browser runs in. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** True when `timeZone` is an IANA zone `Intl` knows. */
export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
