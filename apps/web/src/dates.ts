/** The dates the guild is counting toward (Blizzard's Forever roadmap), midnight Eastern. */
export const NAMES_RESERVED_AT = '2026-10-27T00:00:00-04:00';
export const LAUNCH_AT = '2026-11-04T00:00:00-05:00';
export const RAIDS_OPEN_AT = '2026-12-09T00:00:00-05:00';

/** Whole days from `now` until `iso`, never negative. */
export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}
