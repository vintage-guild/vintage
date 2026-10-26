import type { Character, Member } from '@vintage/identity/contract';
import type { RaidEvent, RaidsEvents, Schedule, Signup } from './contract';
import type { RaidsDeps, RaidsEventSink, RaidsMembers, RaidsStore } from './store';

/** In-memory RaidsStore for tests and local agents. Same behavior contract as the Convex component. */
export function createMemoryRaidsStore(): RaidsStore & {
  schedules: Map<string, Schedule>;
  events: Map<string, RaidEvent>;
  signups: Map<string, Signup>;
} {
  const schedules = new Map<string, Schedule>();
  const events = new Map<string, RaidEvent>();
  const signups = new Map<string, Signup>();
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
    async insertEvent(input) {
      const event = { ...input, id: id('raid') };
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

export function createMemoryRaidsDeps(
  members: Member[] = [],
  characters: Character[] = [],
): RaidsDeps & {
  raids: ReturnType<typeof createMemoryRaidsStore>;
  events: ReturnType<typeof createRecordingEventSink>;
} {
  return {
    raids: createMemoryRaidsStore(),
    members: createMemoryRaidsMembers(members, characters),
    events: createRecordingEventSink(),
  };
}
