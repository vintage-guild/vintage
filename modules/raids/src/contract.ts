// Public surface of the raids module. Other modules import only this file.

import type { RoleTargets, SignupStatus } from '@vintage/comp-solver';
import type { GuildRank } from '@vintage/identity/contract';
import type { Role, WowClass } from '@vintage/wow-data';
import type { EventKind } from './domain/kinds';

export type { RaidSize, RoleTargets, SignupStatus } from '@vintage/comp-solver';
export {
  type CompRole,
  compRole,
  rolesNeeded,
  SERIES_WINDOW,
  type SignupGuess,
} from './domain/guess';
export {
  AKind,
  aKind,
  compSize,
  defaultRoleTargets,
  EVENT_KINDS,
  type EventKind,
  eventTemplate,
  hasRoleTargets,
  instanceOptional,
  KIND_LABELS,
  KIND_SIZES,
  kindNoun,
  kindOf,
  kindRules,
  MAX_EVENT_SIZE,
  sizeFits,
  sizeLabel,
  sizeOptional,
  sizesText,
  targetsOf,
} from './domain/kinds';

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
  /** Instance or activity, e.g. "Molten Core"; empty for an `other` event that names none. */
  instance: string;
  /** What kind of event; rows from before kinds existed read as `raid`. */
  kind: EventKind;
  /** Players; allowed sizes depend on the kind (`sizeFits`). Null: an open `other` event. */
  size: number | null;
  recurrence: Recurrence;
  durationMinutes: number;
  timings: ScheduleTimings;
  /** Comp targets; null means the default for the kind and size (`defaultRoleTargets`). */
  roleTargets: RoleTargets | null;
  lootMethodId: string | null;
  /** Default notes each new raid copies when it is created; null for none. */
  notes: string | null;
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
  /** Where or what, e.g. "Molten Core"; empty for an `other` event that names none. */
  instance: string;
  /** What kind of event; rows from before kinds existed read as `raid`. */
  kind: EventKind;
  /** Players; allowed sizes depend on the kind (`sizeFits`). Null: an open `other` event. */
  size: number | null;
  /** Epoch ms. */
  startsAt: number;
  durationMinutes: number;
  status: RaidStatus;
  roleTargets: RoleTargets | null;
  lootMethodId: string | null;
  /**
   * What to bring and when to be on ("Fire resist and flasks. On at 7:45."), at most
   * `RAID_NOTES_MAX` characters; blank lines split paragraphs. Null for none; rows from before
   * notes existed read as null.
   */
  notes: string | null;
  configVersion: number;
}

/** The longest raid or schedule notes, in characters. */
export const RAID_NOTES_MAX = 500;

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
  /**
   * True when a role was picked for this raid (signup-set `role`): a spec change keeps it.
   * Absent or false: the role follows the spec. Switching character clears it.
   */
  rolePicked?: boolean;
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

/** One attendance snapshot from an addon export, counted (raid-export-check). */
export interface ExportSnapshot {
  /** Unix seconds. */
  at: number;
  /** `start`, a boss name, `end`, or `manual`; null when the addon gave none. */
  label: string | null;
  present: number;
  online: number;
}

/** Someone the export saw, matched to a signup for the raid when one fits. */
export interface ExportAttendee {
  /** As the game showed it: `Name`, or `Name-Realm`. */
  name: string;
  class?: string;
  /** How many snapshots they were in. */
  snapshots: number;
  characterId: string | null;
  memberId: string | null;
  /** Their answer for the raid, when they matched a signup. */
  status: SignupStatus | null;
  /** Matched by name alone: the export showed a realm the signup doesn't have. */
  matchedWithoutRealm: boolean;
}

export interface ExportLoot {
  itemId: number;
  /** From the item data the client revealed, when the export carries it. */
  itemName: string | null;
  looter: string;
  characterId: string | null;
  /** Unix seconds. */
  at: number;
  count: number;
  source: string | null;
}

/** Something about the export that makes the match doubtful, said plainly. */
export interface ExportWarning {
  /** OTHER_GUILD: the export names another guild. OTHER_RAID: the addon made it for another
   * raid than the one picked. TIMES_APART: no snapshot falls near the raid's start. */
  code: 'OTHER_GUILD' | 'OTHER_RAID' | 'TIMES_APART';
  message: string;
}

/** What raid-export-check reports: the export read and matched, nothing recorded. */
export interface ExportCheck {
  event: { id: string; name: string; startsAt: number; status: RaidStatus } | null;
  /** Where the raid came from: the caller's eventId, the export's own, or none. */
  eventSource: 'input' | 'export' | null;
  /** The export names another guild. */
  otherGuild: boolean;
  exporter: string;
  /** Unix seconds. */
  exportedAt: number;
  addonVersion: string;
  snapshots: ExportSnapshot[];
  attendees: ExportAttendee[];
  loot: ExportLoot[];
  itemsSeen: number;
  /** Seen in the raid but not signed up for it (empty when no raid matched). */
  unknownNames: string[];
  /** Expected (the roster, else everyone going with a spot) but in no snapshot. */
  absent: { characterId: string; characterName: string; status: SignupStatus }[];
  /** Said no to the raid but were seen in it. */
  declinedButSeen: string[];
  /** Reasons to doubt the match, most serious first; empty when it looks right. */
  warnings: ExportWarning[];
}

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
  'signup-suggest',
  'signup-get',
  'signup-list',
  'roster-lock',
  'roster-unlock',
  'roster-bench',
  'roster-move',
  'roster-remove',
  'comp-suggest',
  'raid-export-check',
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
