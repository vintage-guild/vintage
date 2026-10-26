import { currentSession } from './session';

/** The dates the guild is counting toward (Blizzard's Forever roadmap), midnight Eastern. */
export const NAMES_RESERVED_AT = '2026-10-27T00:00:00-04:00';
export const LAUNCH_AT = '2026-11-04T00:00:00-05:00';
export const RAIDS_OPEN_AT = '2026-12-09T00:00:00-05:00';

/** Whole days from `now` until `iso`, never negative. */
export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}

/**
 * The zone times are shown in: the member's preference (`member-prefs-set timezone`) when they
 * have one, else the browser's. Undefined means "the browser's" to `Intl`.
 */
export function preferredTimeZone(): string | undefined {
  const zone = currentSession()?.timezone;
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

const withZone = (options: Intl.DateTimeFormatOptions, timeZone?: string) =>
  timeZone ? { ...options, timeZone } : options;

/** "8:00 PM EST": always with the zone, so a time never reads as the wrong evening. */
export function formatTime(ms: number, timeZone = preferredTimeZone()): string {
  return new Date(ms).toLocaleTimeString(
    undefined,
    withZone({ hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }, timeZone),
  );
}

/** "Wed, Nov 4, 8:00 PM EST". */
export function formatDateTime(ms: number, timeZone = preferredTimeZone()): string {
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

export function formatWeekday(ms: number, timeZone = preferredTimeZone()): string {
  return new Date(ms).toLocaleDateString(undefined, withZone({ weekday: 'short' }, timeZone));
}

export function formatMonthDay(ms: number, timeZone = preferredTimeZone()): string {
  return new Date(ms).toLocaleDateString(
    undefined,
    withZone({ month: 'short', day: 'numeric' }, timeZone),
  );
}
