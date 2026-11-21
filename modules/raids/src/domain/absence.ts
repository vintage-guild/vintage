// Pure absence coverage math (absences.plan.md §1). Coverage is computed from a raid's
// start time in the absence's stored time zone, never stored per raid.
import {
  type Absence,
  type AbsenceCoverage,
  type LateMinutes,
  WEEKDAYS,
  type Weekday,
} from '../contract';
import { wallClock } from './recurrence';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
  /** Days since 1970-01-01 (UTC midnight). */
  epochDay: number;
}

/** Parse a strict calendar date `YYYY-MM-DD`, rejecting impossible dates like `2026-02-30`. */
export function parseCalendarDate(text: string): CalendarDate | null {
  const match = DATE_RE.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const d = new Date(utc);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day, epochDay: Math.floor(utc / MS_PER_DAY) };
}

/** Format an instant as `YYYY-MM-DD` in `timeZone`. */
export function localDateOf(instant: number, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  return `${String(w.year).padStart(4, '0')}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** Weekday (`sun`..`sat`) of an instant in `timeZone`. */
export function weekdayOf(instant: number, timeZone: string): Weekday {
  const w = wallClock(instant, timeZone);
  const utc = new Date(Date.UTC(w.year, w.month - 1, w.day));
  return WEEKDAYS[utc.getUTCDay()]!;
}

/** Pure coverage check ignoring `endedAt`, shared by live checks and lock-time history checks. */
function coversIgnoringEnded(absence: Absence, startsAt: number): AbsenceCoverage {
  if (absence.kind === 'dates') {
    if (!absence.from || !absence.to) return null;
    const date = localDateOf(startsAt, absence.timeZone);
    return date >= absence.from && date <= absence.to ? 'away' : null;
  }
  if (!absence.nights?.length) return null;
  const day = weekdayOf(startsAt, absence.timeZone);
  const night = absence.nights.find((n) => n.day === day);
  if (!night) return null;
  if (night.type === 'away') return 'away';
  return night.lateMinutes !== null
    ? { type: 'late', lateMinutes: night.lateMinutes as LateMinutes }
    : null;
}

/**
 * Whether an active absence covers a raid starting at `startsAt`.
 * Inactive (`endedAt !== null`) absences never cover live raids.
 */
export function absenceCovers(absence: Absence, startsAt: number): AbsenceCoverage {
  if (absence.endedAt !== null) return null;
  return coversIgnoringEnded(absence, startsAt);
}

/**
 * Combine all active absences for one member on one raid: `away` beats `late`
 * (Bloodfen, 2026-11-20), and a date-range `away` beats a weekly `away` so the specific
 * trip reason wins.
 */
export function resolveAbsenceCoverage(
  absences: readonly Absence[],
  startsAt: number,
): { coverage: AbsenceCoverage; absence: Absence | null } {
  let weeklyAway: Absence | null = null;
  let lateMatch: { coverage: { type: 'late'; lateMinutes: LateMinutes }; absence: Absence } | null =
    null;

  for (const absence of absences) {
    const cov = absenceCovers(absence, startsAt);
    if (cov === null) continue;
    if (cov === 'away') {
      if (absence.kind === 'dates') return { coverage: 'away', absence };
      weeklyAway ??= absence;
    } else if (!lateMatch) {
      lateMatch = { coverage: cov, absence };
    }
  }
  if (weeklyAway) return { coverage: 'away', absence: weeklyAway };
  if (lateMatch) return lateMatch;
  return { coverage: null, absence: null };
}

/**
 * Whether any absence (including soft-closed ones) excused the member before `locksAt`
 * (absences.plan.md row 12): added before lock, still active at lock, and covering as `away`.
 */
export function excusedAtLock(
  absences: readonly Absence[],
  startsAt: number,
  locksAt: number,
): boolean {
  return absences.some(
    (a) =>
      a.createdAt < locksAt &&
      (a.endedAt === null || a.endedAt >= locksAt) &&
      coversIgnoringEnded(a, startsAt) === 'away',
  );
}
