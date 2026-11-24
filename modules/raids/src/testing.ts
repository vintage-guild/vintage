import { type Caller, error, success } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import type { LootDropInput } from '@vintage/loot/contract';
import { RAIDS_OPEN_AT } from '@vintage/progress/contract';
import {
  type Absence,
  generateShortCode,
  normalizeShortCode,
  type RaidAttendance,
  type RaidEvent,
  type RaidRecord,
  type RaidsEvents,
  type Schedule,
  SHORT_CODE_MAX_RETRIES,
  type Signup,
} from './contract';
import type {
  RaidsDeps,
  RaidsEventSink,
  RaidsLoot,
  RaidsMembers,
  RaidsProgress,
  RaidsStore,
} from './store';

/** In-memory RaidsStore for tests and local agents. Same behavior contract as the Convex component. */
export function createMemoryRaidsStore(): RaidsStore & {
  schedules: Map<string, Schedule>;
  events: Map<string, RaidEvent>;
  signups: Map<string, Signup>;
  records: Map<string, RaidRecord>;
  attendance: Map<string, RaidAttendance>;
  absences: Map<string, Absence>;
} {
  const schedules = new Map<string, Schedule>();
  const events = new Map<string, RaidEvent>();
  const signups = new Map<string, Signup>();
  const records = new Map<string, RaidRecord>();
  const attendance = new Map<string, RaidAttendance>();
  const absences = new Map<string, Absence>();
  let seq = 0;
  const id = (prefix: string) => `${prefix}_${++seq}`;
  const inGuild = <T extends { guildId: string }>(value: T | undefined, guildId: string) =>
    value && value.guildId === guildId ? value : null;
  const must = <T>(value: T | null, what: string): T => {
    if (!value) throw new Error(`${what} not found`);
    return value;
  };

  return {
    schedules,
    events,
    signups,
    records,
    attendance,
    absences,
    async listSchedules(guildId, filter = {}) {
      return [...schedules.values()]
        .filter(
          (s) =>
            s.guildId === guildId && (filter.active === undefined || s.active === filter.active),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async getSchedule(guildId, scheduleId) {
      return inGuild(schedules.get(scheduleId), guildId);
    },
    async insertSchedule(input) {
      const schedule = { ...input, id: id('schedule') };
      schedules.set(schedule.id, schedule);
      return schedule;
    },
    async updateSchedule(guildId, scheduleId, patch) {
      const updated = {
        ...must(inGuild(schedules.get(scheduleId), guildId), 'schedule'),
        ...patch,
      };
      schedules.set(scheduleId, updated);
      return updated;
    },

    async listEvents(guildId, filter = {}) {
      return [...events.values()]
        .filter(
          (e) =>
            e.guildId === guildId &&
            (filter.from === undefined || e.startsAt >= filter.from) &&
            (filter.to === undefined || e.startsAt < filter.to) &&
            (filter.scheduleId === undefined || e.scheduleId === filter.scheduleId) &&
            (filter.statuses === undefined || filter.statuses.includes(e.status)),
        )
        .sort((a, b) => a.startsAt - b.startsAt);
    },
    async getEvent(guildId, eventId) {
      return inGuild(events.get(eventId), guildId);
    },
    async getEventByShortCode(guildId, shortCode) {
      const normalized = normalizeShortCode(shortCode);
      if (!normalized) return null;
      return (
        [...events.values()].find((e) => e.guildId === guildId && e.shortCode === normalized) ??
        null
      );
    },
    async insertEvent(input) {
      let shortCode: string;
      if (input.shortCode) {
        shortCode = normalizeShortCode(input.shortCode);
      } else {
        let candidate = '';
        for (let attempt = 0; attempt < SHORT_CODE_MAX_RETRIES; attempt++) {
          const next = generateShortCode();
          const taken = [...events.values()].some(
            (e) => e.guildId === input.guildId && e.shortCode === next,
          );
          if (!taken) {
            candidate = next;
            break;
          }
        }
        if (!candidate) throw new Error('could not allocate a unique shortCode');
        shortCode = candidate;
      }
      const event = { ...input, shortCode, id: id('raid') };
      events.set(event.id, event);
      return event;
    },
    async updateEvent(guildId, eventId, patch) {
      const updated = { ...must(inGuild(events.get(eventId), guildId), 'raid'), ...patch };
      events.set(eventId, updated);
      return updated;
    },

    async listSignups(guildId, eventId) {
      return [...signups.values()]
        .filter((s) => s.guildId === guildId && s.eventId === eventId)
        .sort((a, b) => a.signedUpAt - b.signedUpAt);
    },
    async getSignup(guildId, signupId) {
      return inGuild(signups.get(signupId), guildId);
    },
    async getSignupByMember(guildId, eventId, memberId) {
      return (
        [...signups.values()].find(
          (s) => s.guildId === guildId && s.eventId === eventId && s.memberId === memberId,
        ) ?? null
      );
    },
    async listSignupsByMember(guildId, memberId, limit) {
      return [...signups.values()]
        .filter((s) => s.guildId === guildId && s.memberId === memberId)
        .sort((a, b) => b.signedUpAt - a.signedUpAt)
        .slice(0, limit);
    },
    async insertSignup(input) {
      const signup = { ...input, id: id('signup') };
      signups.set(signup.id, signup);
      return signup;
    },
    async updateSignup(guildId, signupId, patch) {
      const updated = { ...must(inGuild(signups.get(signupId), guildId), 'signup'), ...patch };
      signups.set(signupId, updated);
      return updated;
    },
    async deleteSignup(guildId, signupId) {
      if (inGuild(signups.get(signupId), guildId)) signups.delete(signupId);
    },

    async getRecord(guildId, eventId) {
      return (
        [...records.values()].find((r) => r.guildId === guildId && r.eventId === eventId) ?? null
      );
    },
    async listAttendance(guildId, eventId) {
      return [...attendance.values()]
        .filter((a) => a.guildId === guildId && a.eventId === eventId)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async listAttendanceByMember(guildId, memberId, limit) {
      return [...attendance.values()]
        .filter((a) => a.guildId === guildId && a.memberId === memberId)
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        .slice(0, limit);
    },
    async putRecord(input, people) {
      const { guildId, eventId } = input;
      for (const r of records.values()) {
        if (r.guildId === guildId && r.eventId === eventId) records.delete(r.id);
      }
      for (const a of attendance.values()) {
        if (a.guildId === guildId && a.eventId === eventId) attendance.delete(a.id);
      }
      for (const person of people) {
        const row = { ...person, id: id('attendance'), guildId, eventId };
        attendance.set(row.id, row);
      }
      const record = { ...input, id: id('record') };
      records.set(record.id, record);
      return record;
    },

    async listAbsences(guildId, filter = {}) {
      const activeOnly = filter.activeOnly ?? true;
      return [...absences.values()].filter(
        (a) =>
          a.guildId === guildId &&
          (filter.memberId === undefined || a.memberId === filter.memberId) &&
          (!activeOnly || a.endedAt === null),
      );
    },
    async getAbsence(guildId, absenceId) {
      return inGuild(absences.get(absenceId), guildId);
    },
    async insertAbsence(input) {
      const absence = { ...input, id: id('absence') };
      absences.set(absence.id, absence);
      return absence;
    },
    async endAbsence(guildId, absenceId, endedAt) {
      const updated = { ...must(inGuild(absences.get(absenceId), guildId), 'absence'), endedAt };
      absences.set(absenceId, updated);
      return updated;
    },
  };
}

/** Members and characters for raids tests, keyed by id. */
export function createMemoryRaidsMembers(
  members: Member[] = [],
  characters: Character[] = [],
): RaidsMembers {
  return {
    getCharacter: async (guildId, characterId) =>
      characters.find((c) => c.guildId === guildId && c.id === characterId) ?? null,
    listCharacters: async (guildId, memberId) =>
      characters.filter((c) => c.guildId === guildId && c.memberId === memberId),
    getMember: async (guildId, memberId) =>
      members.find((m) => m.guildId === guildId && m.id === memberId) ?? null,
  };
}

export type EmittedEvent = {
  [K in keyof RaidsEvents]: { guildId: string; type: K; payload: RaidsEvents[K] };
}[keyof RaidsEvents];

/** Records emitted events so tests can assert on them. */
export function createRecordingEventSink(): RaidsEventSink & { emitted: EmittedEvent[] } {
  const emitted: EmittedEvent[] = [];
  return {
    emitted,
    async emit(guildId, type, payload) {
      emitted.push({ guildId, type, payload } as EmittedEvent);
    },
  };
}

/**
 * kill-record as far as raids sees it: keeps each kill, answers `first` for the earliest of a
 * boss, `duplicate` for the same boss and time again, and refuses one before the raids open.
 */
export function createMemoryRaidsProgress(): RaidsProgress & {
  kills: { caller: Caller; raidId: string; bossId: string; killedAt: number; note: string }[];
} {
  const kills: {
    caller: Caller;
    raidId: string;
    bossId: string;
    killedAt: number;
    note: string;
  }[] = [];
  return {
    kills,
    async recordKill(caller, kill) {
      if (kill.killedAt < RAIDS_OPEN_AT) {
        return error('INVALID_TIME', 'Raids open December 9, 2026', { retryable: false });
      }
      const same = (k: (typeof kills)[number]) =>
        k.raidId === kill.raidId && k.bossId === kill.bossId;
      const existing = kills.find((k) => same(k) && k.killedAt === kill.killedAt);
      if (!existing) kills.push({ caller, ...kill });
      const earliest = Math.min(...kills.filter(same).map((k) => k.killedAt));
      return success({
        kill: {
          id: `kill-${kill.bossId}-${kill.killedAt}`,
          guildId: caller.guildId,
          ...kill,
          loot: [],
          recordedBy: caller.memberId ?? caller.surface,
          recordedAt: kill.killedAt,
        },
        first: kill.killedAt === earliest,
        duplicate: existing !== undefined,
      });
    },
  };
}

/** Keeps the drops raids hands to loot, by raid, so tests can read them back. */
export function createMemoryRaidsLoot(): RaidsLoot & { drops: Map<string, LootDropInput[]> } {
  const drops = new Map<string, LootDropInput[]>();
  return {
    drops,
    async replaceDrops(guildId, eventId, list) {
      drops.set(`${guildId}/${eventId}`, list);
    },
  };
}

export function createMemoryRaidsDeps(
  members: Member[] = [],
  characters: Character[] = [],
): RaidsDeps & {
  raids: ReturnType<typeof createMemoryRaidsStore>;
  events: ReturnType<typeof createRecordingEventSink>;
  raidLoot: ReturnType<typeof createMemoryRaidsLoot>;
  raidProgress: ReturnType<typeof createMemoryRaidsProgress>;
} {
  return {
    raids: createMemoryRaidsStore(),
    members: createMemoryRaidsMembers(members, characters),
    events: createRecordingEventSink(),
    raidLoot: createMemoryRaidsLoot(),
    raidProgress: createMemoryRaidsProgress(),
  };
}
