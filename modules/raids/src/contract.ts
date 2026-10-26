// Public surface of the raids module. Other modules import only this file.

import type { RaidSize, RoleTargets, SignupStatus } from '@vintage/comp-solver';
import type { GuildRank } from '@vintage/identity/contract';
import type { Role, WowClass } from '@vintage/wow-data';

export type { RaidSize, RoleTargets, SignupStatus } from '@vintage/comp-solver';

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** When a schedule's raids happen, in the schedule's own time zone (so DST is handled). */
export interface Recurrence {
  weekdays: Weekday[];
  /** Local start time, `HH:MM` (24h). */
  time: string;
  /** IANA zone, e.g. `America/New_York`. */
  timeZone: string;
}

/** Coordinator timings (PLAN §6.2). Per schedule, so each raid night can differ. */
export interface ScheduleTimings {
  /** How many days ahead events are created and posted. */
  leadDays: number;
  /** Reminder offsets before start, in hours (e.g. 72 and 24). */
  reminderHours: number[];
  /** Signups lock this many hours before start. */
  lockHours: number;
}

export interface Schedule {
  id: string;
  guildId: string;
  name: string;
  /** Instance or activity, e.g. "Molten Core". */
  instance: string;
  size: RaidSize;
  recurrence: Recurrence;
  durationMinutes: number;
  timings: ScheduleTimings;
  /** Comp targets; null means the comp-solver default for the size. */
  roleTargets: RoleTargets | null;
  lootMethodId: string | null;
  /** Inactive schedules create no new events. */
  active: boolean;
  /** Bumped on every update; events record the version they were created from. */
  configVersion: number;
}

export const RAID_STATUSES = ['open', 'locked', 'cancelled', 'completed'] as const;
/** `open` takes signups; `locked` only takes leader changes; the last two are final. */
export type RaidStatus = (typeof RAID_STATUSES)[number];

export interface RaidEvent {
  id: string;
  guildId: string;
  /** The schedule this raid came from; null for one-off raids. */
  scheduleId: string | null;
  name: string;
  instance: string;
  size: RaidSize;
  /** Epoch ms. */
  startsAt: number;
  durationMinutes: number;
  status: RaidStatus;
  roleTargets: RoleTargets | null;
  lootMethodId: string | null;
  configVersion: number;
}

export const ROSTER_STATES = ['pending', 'rostered', 'benched'] as const;
/** A leader's roster decision for a signup: not decided yet, in a group, or benched. */
export type RosterState = (typeof ROSTER_STATES)[number];

/** One member's answer for one raid, with the character they bring (one signup per member). */
export interface Signup {
  id: string;
  guildId: string;
  eventId: string;
  memberId: string;
  characterId: string;
  /** Character snapshot at signup time, so posts and comp don't need identity lookups. */
  characterName: string;
  class: WowClass;
  spec: string;
  role: Role;
  status: SignupStatus;
  note: string | null;
  /** First answer, epoch ms; keeps their place in line when they change their answer. */
  signedUpAt: number;
  updatedAt: number;
  roster: RosterState;
  /** Raid group 1–8 when rostered, otherwise null. */
  group: number | null;
  /** Going, but past the raid size: waiting in line for a spot (see domain/queue.ts). */
  queued: boolean;
  /** When a spot opened and they moved from the queue into the raid; null if never. */
  promotedAt: number | null;
}

/**
 * Comp priority by guild rank (PLAN §3.4): raiders and above get first dibs, then flex raiders,
 * then recruits. Shared so comp-suggest and the coordinator rank people the same way.
 */
export const RANK_PRIORITY: Record<GuildRank, number> = {
  officer: 3,
  'raid-leader': 3,
  raider: 3,
  'flex-raider': 2,
  recruit: 1,
  member: 0,
  friend: 0,
};

/** Coordinator timings for one-off raids that have no schedule. */
export const DEFAULT_TIMINGS: ScheduleTimings = {
  leadDays: 7,
  reminderHours: [72, 24],
  lockHours: 2,
};

export const RAIDS_COMMANDS = [
  'schedule-create',
  'schedule-update',
  'schedule-list',
  'schedule-materialize',
  'raid-create',
  'raid-reschedule',
  'raid-cancel',
  'raid-complete',
  'raid-get',
  'raid-list',
  'signup-set',
  'signup-get',
  'signup-list',
  'roster-lock',
  'roster-unlock',
  'roster-bench',
  'roster-move',
  'roster-remove',
  'comp-suggest',
] as const;
export type RaidsCommandName = (typeof RAIDS_COMMANDS)[number];

/** Events raids emits on the core event bus (PLAN §4.3). */
export interface RaidsEvents {
  /** A signup was created, changed, or removed (`to: null`). The coordinator refreshes posts. */
  'signup-changed': {
    eventId: string;
    memberId: string;
    characterId: string;
    from: SignupStatus | null;
    to: SignupStatus | null;
  };
  /** A queued member got a spot because someone ahead dropped out. The coordinator tells them. */
  'signup-promoted': { eventId: string; memberId: string; characterId: string };
  /** A raid finished. Loot and attendance (#29) start from here. */
  'raid-completed': {
    eventId: string;
    scheduleId: string | null;
    startsAt: number;
    attendees: { memberId: string; characterId: string }[];
  };
}
