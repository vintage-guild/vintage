// When a raid's signups lock. Pure: the raid's schedule (or the one-off defaults) decides.
import { DEFAULT_TIMINGS, type RaidEvent, type Schedule, type ScheduleTimings } from '../contract';

const HOUR_MS = 60 * 60 * 1000;

/** The timings that apply to a raid: its schedule's, or the defaults for a one-off. */
export function timingsFor(schedule: Schedule | null): ScheduleTimings {
  return schedule?.timings ?? DEFAULT_TIMINGS;
}

/** When signups lock: `lockHours` before the start. The coordinator locks the roster then. */
export function locksAt(event: Pick<RaidEvent, 'startsAt'>, timings: ScheduleTimings): number {
  return event.startsAt - timings.lockHours * HOUR_MS;
}
