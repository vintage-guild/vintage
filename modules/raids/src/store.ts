import { type Caller, type CommandResult, commandsFor } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import type { LootDropInput } from '@vintage/loot/contract';
import type { KillRecorded, RaidId } from '@vintage/progress/contract';
import type {
  RaidAttendance,
  RaidAttendanceInput,
  RaidEvent,
  RaidRecord,
  RaidStatus,
  RaidsEvents,
  Schedule,
  Signup,
} from './contract';

/**
 * The raids module's data port. Commands depend on this, not on Convex: production wires it
 * to the module's Convex component, tests use the memory store in `./testing`.
 */
export interface RaidsStore {
  /** Sorted by name. */
  listSchedules(guildId: string, filter?: { active?: boolean }): Promise<Schedule[]>;
  getSchedule(guildId: string, scheduleId: string): Promise<Schedule | null>;
  insertSchedule(schedule: Omit<Schedule, 'id'>): Promise<Schedule>;
  updateSchedule(
    guildId: string,
    scheduleId: string,
    patch: Partial<Omit<Schedule, 'id' | 'guildId'>>,
  ): Promise<Schedule>;

  /** Sorted by start time. `from` is inclusive, `to` exclusive. */
  listEvents(
    guildId: string,
    filter?: { from?: number; to?: number; scheduleId?: string; statuses?: RaidStatus[] },
  ): Promise<RaidEvent[]>;
  getEvent(guildId: string, eventId: string): Promise<RaidEvent | null>;
  insertEvent(event: Omit<RaidEvent, 'id'>): Promise<RaidEvent>;
  updateEvent(
    guildId: string,
    eventId: string,
    patch: Partial<Omit<RaidEvent, 'id' | 'guildId'>>,
  ): Promise<RaidEvent>;

  /** Sorted by first signup time. */
  listSignups(guildId: string, eventId: string): Promise<Signup[]>;
  getSignup(guildId: string, signupId: string): Promise<Signup | null>;
  getSignupByMember(guildId: string, eventId: string, memberId: string): Promise<Signup | null>;
  /** One member's signups across raids, latest `signedUpAt` first, at most `limit`. */
  listSignupsByMember(guildId: string, memberId: string, limit: number): Promise<Signup[]>;
  insertSignup(signup: Omit<Signup, 'id'>): Promise<Signup>;
  updateSignup(
    guildId: string,
    signupId: string,
    patch: Partial<Omit<Signup, 'id' | 'guildId' | 'eventId' | 'memberId'>>,
  ): Promise<Signup>;
  deleteSignup(guildId: string, signupId: string): Promise<void>;

  /** The export recorded for a raid, if any. */
  getRecord(guildId: string, eventId: string): Promise<RaidRecord | null>;
  /** A raid's recorded attendance, sorted by name. */
  listAttendance(guildId: string, eventId: string): Promise<RaidAttendance[]>;
  /** Records an export for a raid, replacing any earlier record and its attendance. */
  putRecord(record: Omit<RaidRecord, 'id'>, attendance: RaidAttendanceInput[]): Promise<RaidRecord>;
}

/**
 * What raids reads from identity. apps/api adapts identity's store to this; raids never
 * touches identity's tables (PLAN §4.3).
 */
export interface RaidsMembers {
  getCharacter(guildId: string, characterId: string): Promise<Character | null>;
  /** One member's characters, in identity's order. */
  listCharacters(guildId: string, memberId: string): Promise<Character[]>;
  getMember(guildId: string, memberId: string): Promise<Member | null>;
}

/** Publishes raids events on the core bus. */
export interface RaidsEventSink {
  emit<K extends keyof RaidsEvents>(
    guildId: string,
    type: K,
    payload: RaidsEvents[K],
  ): Promise<void>;
}

/**
 * Where raids puts the loot an export recorded. apps/api adapts the loot module's store to
 * this; raids never touches loot's tables (PLAN §4.3, §5.1).
 */
export interface RaidsLoot {
  /** Replaces every drop recorded for a raid. */
  replaceDrops(guildId: string, eventId: string, drops: LootDropInput[]): Promise<unknown>;
}

/**
 * Where raids puts the bosses an export killed (#221). apps/api runs the progress module's
 * kill-record through the registry as the same caller, so its checks apply; raids never touches
 * progress's tables (invariant 3).
 */
export interface RaidsProgress {
  recordKill(
    caller: Caller,
    kill: { raidId: RaidId; bossId: string; killedAt: number; note: string },
  ): Promise<CommandResult<KillRecorded>>;
}

export interface RaidsDeps {
  raids: RaidsStore;
  members: RaidsMembers;
  events: RaidsEventSink;
  raidLoot: RaidsLoot;
  raidProgress: RaidsProgress;
}

export const command = commandsFor<RaidsDeps>();
