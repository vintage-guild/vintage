import { commandsFor } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import type { RaidEvent, RaidStatus, RaidsEvents, Schedule, Signup } from './contract';

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
  insertSignup(signup: Omit<Signup, 'id'>): Promise<Signup>;
  updateSignup(
    guildId: string,
    signupId: string,
    patch: Partial<Omit<Signup, 'id' | 'guildId' | 'eventId' | 'memberId'>>,
  ): Promise<Signup>;
  deleteSignup(guildId: string, signupId: string): Promise<void>;
}

/**
 * What raids reads from identity. apps/api adapts identity's store to this; raids never
 * touches identity's tables (PLAN §4.3).
 */
export interface RaidsMembers {
  getCharacter(guildId: string, characterId: string): Promise<Character | null>;
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

export interface RaidsDeps {
  raids: RaidsStore;
  members: RaidsMembers;
  events: RaidsEventSink;
}

export const command = commandsFor<RaidsDeps>();
