// The guild's clock and usual raid time: the first active schedule's zone and start time,
// else the first schedule's (when all are paused), else the fallbacks. Pure, shared across
// raids commands, apps/api (Discord), and apps/web.
import type { Schedule } from '../contract';

/** The guild's clock when no schedule names one. */
export const FALLBACK_TIME_ZONE = 'America/Chicago';
/** The usual start time when no schedule names one. */
export const FALLBACK_RAID_TIME = '20:00';

const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface GuildClock {
  /** IANA zone, e.g. `America/New_York`. */
  zone: string;
  /** The guild's usual start time, `HH:MM` (24h). */
  time: string;
}

/**
 * Resolve the guild's clock from its schedules: first active schedule, else first schedule,
 * else fallbacks (`America/Chicago`, `20:00`).
 */
export function resolveGuildClock(
  schedules: readonly Pick<Schedule, 'active' | 'recurrence'>[],
): GuildClock {
  const schedule = schedules.find((s) => s.active) ?? schedules[0];
  const time = schedule?.recurrence.time ?? '';
  return {
    zone: schedule?.recurrence.timeZone ?? FALLBACK_TIME_ZONE,
    time: TIME_24H.test(time) ? time : FALLBACK_RAID_TIME,
  };
}
