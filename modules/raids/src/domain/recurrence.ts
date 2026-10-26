// Turns a weekly schedule into concrete start times. Pure; uses Intl for time zones so a
// "Tuesday 20:00 America/New_York" raid stays at 20:00 local across daylight-saving changes.
import { type Recurrence, WEEKDAYS } from '../contract';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(time: string): boolean {
  return TIME.test(time);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The local date and time of an instant in a zone. */
export function wallClock(instant: number, timeZone: string): WallClock {
  const parts = formatter(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? Number.NaN);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
  };
}

/** How far the zone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(instant: number, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  return (
    Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(instant / 60000) * 60000
  );
}

/**
 * The instant a local wall-clock time happens in a zone. In the spring-forward gap (a time that
 * doesn't exist) this lands just after the gap; in the fall-back overlap it picks the first one.
 */
export function zonedTime(w: WallClock, timeZone: string): number {
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  // Zone offsets a day either side cover any transition near this time.
  const candidates = [
    asUtc - offsetAt(asUtc - DAY_MS, timeZone),
    asUtc - offsetAt(asUtc + DAY_MS, timeZone),
  ];
  const exact = candidates.filter((at) => sameClock(wallClock(at, timeZone), w));
  // Overlap: both match, take the first. Gap: neither does, take the later (after the jump).
  return exact.length ? Math.min(...exact) : Math.max(...candidates);
}

const sameClock = (a: WallClock, b: WallClock) =>
  a.year === b.year &&
  a.month === b.month &&
  a.day === b.day &&
  a.hour === b.hour &&
  a.minute === b.minute;

/** Start times for a recurrence in [from, to), ascending. */
export function occurrences(recurrence: Recurrence, from: number, to: number): number[] {
  const match = TIME.exec(recurrence.time);
  if (!match || from >= to) return [];
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  const days = new Set(recurrence.weekdays);
  const start = wallClock(from, recurrence.timeZone);
  const out: number[] = [];
  // Walk local calendar days, one before `from` to one after `to`, so zone offsets can't skip any.
  const span = Math.ceil((to - from) / DAY_MS) + 2;
  for (let i = -1; i <= span; i++) {
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
    const weekday = WEEKDAYS[date.getUTCDay()];
    if (!weekday || !days.has(weekday)) continue;
    const at = zonedTime(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour,
        minute,
      },
      recurrence.timeZone,
    );
    if (at >= from && at < to) out.push(at);
  }
  return out;
}
