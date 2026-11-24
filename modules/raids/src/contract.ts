// Public surface of the raids module. Other modules import only this file.

import type { RoleTargets, SignupStatus } from '@vintage/comp-solver';
import type { RaidId } from '@vintage/progress/contract';
import type { Role, WowClass } from '@vintage/wow-data';
import type { EventKind } from './domain/kinds';

export {
  type CompResult,
  dpsTargetOf,
  type GroupDraftResult,
  type GroupMember,
  groupDraft,
  hasSplitDpsTargets,
  type LegacyRoleTargets,
  type PartyGroup,
  type RaidSize,
  type RoleTargets,
  type SignupStatus,
  type SplitRoleTargets,
  type TargetRole,
  totalRoleTargets,
} from '@vintage/comp-solver';
export {
  absenceCovers,
  type CalendarDate,
  excusedAtLock,
  localDateOf,
  parseCalendarDate,
  resolveAbsenceCoverage,
  weekdayOf,
} from './domain/absence';
export {
  FALLBACK_RAID_TIME,
  FALLBACK_TIME_ZONE,
  type GuildClock,
  resolveGuildClock,
} from './domain/clock';
export { RANK_PRIORITY, solveEventComp } from './domain/comp';
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
export { nextOccurrence } from './domain/recurrence';
export {
  generateShortCode,
  isValidShortCode,
  normalizeShortCode,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  SHORT_CODE_MAX_RETRIES,
} from './domain/short-code';

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

export const RAID_ACCESS = ['guild', 'open'] as const;
/** `guild` is the guild's own nights (Recruit+, Flex Standby-only, reminders); `open` welcomes pugs/Friends. */
export type RaidAccess = (typeof RAID_ACCESS)[number];

/** Access of a stored schedule or raid; older rows without `access` read as `guild`. */
export const accessOf = (row: { access?: RaidAccess | null }): RaidAccess => row.access ?? 'guild';

/** Coordinator timings (PLAN §6.2). Per schedule, so each raid night can differ. */
export interface ScheduleTimings {
  /** How many days ahead events are created and posted. */
  leadDays: number;
  /** Reminder offsets before start, in hours (e.g. 72 and 30). */
  reminderHours: number[];
  /** Officer/leads digest and party draft offset before start, in hours (default 24). */
  digestHours: number;
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
  /** Guild raid or open (pugs welcome); rows from before access existed read as `guild`. */
  access: RaidAccess;
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
  /** Guild raid or open (pugs welcome); rows from before access existed read as `guild`. */
  access: RaidAccess;
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
  /** When a raid leader approved and posted the party roster (epoch ms); null before approval. */
  rosterApprovedAt: number | null;
  /** Member or discord id of the leader who approved the party roster; null before approval. */
  rosterApprovedBy: string | null;
  /** Last time a leader edited this raid via `raid-update` (epoch ms); absent/null on older rows. */
  updatedAt?: number | null;
  /** Member or discord id of the leader who last edited this raid; absent/null on older rows. */
  updatedBy?: string | null;
  /** Six-character lowercase short link code (e.g. `k3m9qz`), unique per guild; absent/null on unbackfilled rows. */
  shortCode?: string | null;
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
  /** Other roles this character can play for this raid; copied from the character at signup time. */
  alsoRoles: Role[];
  status: SignupStatus;
  /** How many minutes late (5, 15, or 30) when status is `late`; null for other statuses or older rows. */
  lateMinutes: LateMinutes | null;
  note: string | null;
  /** First answer, epoch ms; kept as a record only (signups are comp-based, not first-come). */
  signedUpAt: number;
  updatedAt: number;
  /** Member or discord id of whoever last changed this signup (the player or a raid leader). */
  updatedBy: string | null;
  roster: RosterState;
  /** Raid group 1–8 when rostered, otherwise null. */
  group: number | null;
  /** Legacy queue flag (kept for stored rows; new signups always write false). */
  queued: boolean;
  /** Legacy queue promotion timestamp (kept for stored rows; new signups always write null). */
  promotedAt: number | null;
}

/** Coordinator timings for one-off raids that have no schedule. */
export const DEFAULT_TIMINGS: ScheduleTimings = {
  leadDays: 7,
  reminderHours: [72, 30],
  digestHours: 24,
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
/** One boss the export has attempts for (#221): how the night went against it. */
export interface ExportBoss {
  /** The game's encounter id; null when the game kept it secret. */
  encounterId: number | null;
  name: string;
  attempts: number;
  kills: number;
  wipes: number;
  /** Unix seconds of the first kill, or null. */
  firstKilledAt: number | null;
  /** Seconds spent in the fight across all attempts. */
  seconds: number;
}

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
  /**
   * Bench people the leader confirmed stood by (#222), from the import's bench; empty for an
   * export without the list. Whether standing by counts as attendance is decided with #29.
   */
  standby: { characterId: string; name: string; reason: 'standby' | 'queued' | 'benched' }[];
  /** Each boss attempted, in the order first pulled; empty for an export without attempts. */
  bosses: ExportBoss[];
  /** Reasons to doubt the match, most serious first; empty when it looks right. */
  warnings: ExportWarning[];
}

/**
 * Someone the recorded export saw in the raid (raid-export-record). Being in any snapshot counts
 * as attending (decided with #29, 2026-10-29); `snapshots` and `labels` keep how much of the
 * night they were there for, so a loot method can weigh it.
 */
export interface RaidAttendance {
  id: string;
  guildId: string;
  eventId: string;
  /** As the game showed it: `Name`, or `Name-Realm`. */
  name: string;
  class: string | null;
  /** The raid signup the name matched; null for someone not signed up. */
  characterId: string | null;
  memberId: string | null;
  /** How many of the export's snapshots they were in. */
  snapshots: number;
  /** The labels of those snapshots (`start`, a boss, `end`, `manual`), unlabelled ones left out. */
  labels: string[];
  /** UTC epoch ms of the first and last snapshot they were in (the export's time for standby). */
  firstSeenAt: number;
  lastSeenAt: number;
  /**
   * Stood by on the bench and counted as attending (full credit, decided 2026-10-30 for #222 and
   * #29): in no snapshot, so `snapshots` is 0. Absent for everyone else.
   */
  stoodBy?: boolean;
}

/** One person's attendance before it is stored. */
export type RaidAttendanceInput = Omit<RaidAttendance, 'id' | 'guildId' | 'eventId'>;

/** The export a raid's attendance and loot were recorded from; one per raid. */
export interface RaidRecord {
  id: string;
  guildId: string;
  eventId: string;
  /** Who exported and when: the same export pasted again changes nothing. */
  exportKey: string;
  exporter: string;
  /** UTC epoch ms. */
  exportedAt: number;
  addonVersion: string;
  snapshots: number;
  attended: number;
  drops: number;
  recordedAt: number;
  recordedBy: string;
  /** The night's boss attempts in sum, for the raid summary; null for an export without them. */
  bosses: RecordBosses | null;
}

/** A raid record's boss attempts in sum (#221): the summary's "Bosses: 6/8, 14 wipes, 2h 41m". */
export interface RecordBosses {
  /** Bosses killed at least once; with a launch raid matched, only that raid's bosses. */
  killed: number;
  /**
   * Bosses in the launch raid the attempts matched (8 for Barrow Deeps). Null when none matched:
   * a dungeon, or boss names the game spells differently.
   */
  total: number | null;
  wipes: number;
  /** UTC epoch ms: the first pull, and the end of the last attempt. */
  firstPullAt: number;
  lastEndAt: number;
}

/** A boss the export killed, and the progress boss it matched (#221). */
export interface ExportKill {
  /** As the game named it. */
  name: string;
  encounterId: number | null;
  /** UTC epoch ms of the night's first kill of it. */
  killedAt: number;
  /** The launch raid and boss it matched by id or name; both null when it matched none. */
  raidId: RaidId | null;
  bossId: string | null;
}

/**
 * What recording did with a kill: `first` is now the ledger entry, `again` was logged behind an
 * earlier first kill, `duplicate` was already recorded, `unmatched` matched no launch boss,
 * `refused` was turned down by kill-record (`detail` says why, e.g. before the raids opened).
 */
export type LedgerOutcome = 'first' | 'again' | 'duplicate' | 'unmatched' | 'refused';

export interface LedgerKill extends ExportKill {
  outcome: LedgerOutcome;
  detail: string | null;
}

export const ABSENCE_KINDS = ['dates', 'weekly'] as const;
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];

/** Allowed minutes late for a late signup or weekly late night; later than 30 is absent. */
export const LATE_MINUTES = [5, 15, 30] as const;
export type LateMinutes = (typeof LATE_MINUTES)[number];

export const ABSENCE_REASON_MAX = 200;
export const ABSENCE_OPEN_MAX = 10;
export const ABSENCE_MAX_DAYS = 60;
export const ABSENCE_MAX_AHEAD_DAYS = 180;

export interface WeeklyNight {
  day: Weekday;
  type: 'away' | 'late';
  /** Late minutes for `late` nights; null for `away`. */
  lateMinutes: LateMinutes | null;
}

/**
 * A member's advance absence (date range) or weekly availability rule (absences.plan.md §1).
 * Removed or replaced rows set `endedAt` instead of being hard-deleted, preserving history
 * for excused attendance checks.
 */
export interface Absence {
  id: string;
  guildId: string;
  memberId: string;
  kind: AbsenceKind;
  /** dates: guild-clock calendar days, inclusive, `YYYY-MM-DD`. null for weekly. */
  from: string | null;
  to: string | null;
  /** weekly: one entry per weekday the rule covers. null for dates. */
  nights: WeeklyNight[] | null;
  /** The guild clock when it was added; coverage reads the raid's start in this zone. */
  timeZone: string;
  /** At most ABSENCE_REASON_MAX (200) characters; null for none. Officer/leader-only on reads of others. */
  reason: string | null;
  /** Who added it: the member, or a leader adding it for them. */
  createdBy: string;
  createdAt: number;
  /** When it was removed or replaced; null while active. */
  endedAt: number | null;
}

export type AbsenceCoverage = 'away' | { type: 'late'; lateMinutes: LateMinutes } | null;

export const RAIDS_COMMANDS = [
  'schedule-create',
  'schedule-update',
  'schedule-list',
  'schedule-materialize',
  'raid-create',
  'raid-update',
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
  'roster-approve',
  'roster-bench',
  'roster-move',
  'roster-remove',
  'comp-suggest',
  'raid-export-check',
  'raid-export-record',
  'attendance-list',
  'absence-add',
  'absence-weekly-set',
  'absence-remove',
  'absence-list',
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
  /**
   * An officer recorded the addon's export for a raid (raid-export-record): attendance and loot
   * are stored. Comes after `raid-completed` when the record also completed the raid. The raid
   * summary post doesn't wait for it: the coordinator's tick reads the record itself (#221).
   */
  'raid-recorded': {
    eventId: string;
    /** Signed-up people the export saw; pick-ups aren't members of the raid. */
    attendees: { memberId: string; characterId: string }[];
    drops: number;
    /** A different export was recorded for this raid before. */
    replaced: boolean;
  };
  /** An advance absence or weekly rule was added, replaced, or ended. */
  'absence-changed': {
    absenceId: string;
    memberId: string;
    kind: AbsenceKind;
    action: 'added' | 'weekly-set' | 'removed';
  };
  /** A raid leader approved and posted the party roster. */
  'roster-approved': {
    eventId: string;
    approvedBy: string;
    approvedAt: number;
  };
}
