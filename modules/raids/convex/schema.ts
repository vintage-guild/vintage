import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Any size from 1 to 40, or null for an open `other` event; which sizes a kind allows is checked
// by the commands (comp-solver kinds.ts).
// Widened from the 10/20/40 literals, so every existing row still matches.
export const eventSize = v.union(v.number(), v.null());

export const eventKind = v.union(
  v.literal('raid'),
  v.literal('dungeon'),
  v.literal('battleground'),
  v.literal('other'),
);

export const weekday = v.union(
  v.literal('sun'),
  v.literal('mon'),
  v.literal('tue'),
  v.literal('wed'),
  v.literal('thu'),
  v.literal('fri'),
  v.literal('sat'),
);

export const roleTargets = v.union(
  v.object({ tank: v.number(), healer: v.number(), dps: v.number() }),
  v.null(),
);

export const raidStatus = v.union(
  v.literal('open'),
  v.literal('locked'),
  v.literal('cancelled'),
  v.literal('completed'),
);

export const signupStatus = v.union(
  v.literal('accepted'),
  v.literal('late'),
  v.literal('tentative'),
  v.literal('bench'),
  v.literal('declined'),
);

export const rosterState = v.union(
  v.literal('pending'),
  v.literal('rostered'),
  v.literal('benched'),
);

export const role = v.union(
  v.literal('tank'),
  v.literal('healer'),
  v.literal('melee'),
  v.literal('ranged'),
);

// Optional so rows written before notes existed stay valid; the mappers read a missing one as null.
export const notes = v.optional(v.union(v.string(), v.null()));

export const scheduleFields = {
  guildId: v.string(),
  name: v.string(),
  instance: v.string(),
  // Optional so rows written before kinds existed stay valid; read as 'raid'.
  kind: v.optional(eventKind),
  size: eventSize,
  recurrence: v.object({ weekdays: v.array(weekday), time: v.string(), timeZone: v.string() }),
  durationMinutes: v.number(),
  timings: v.object({
    leadDays: v.number(),
    reminderHours: v.array(v.number()),
    lockHours: v.number(),
  }),
  roleTargets,
  lootMethodId: v.union(v.string(), v.null()),
  notes,
  active: v.boolean(),
  configVersion: v.number(),
};

export const eventFields = {
  guildId: v.string(),
  scheduleId: v.union(v.string(), v.null()),
  name: v.string(),
  instance: v.string(),
  // Optional so rows written before kinds existed stay valid; read as 'raid'.
  kind: v.optional(eventKind),
  size: eventSize,
  startsAt: v.number(),
  durationMinutes: v.number(),
  status: raidStatus,
  roleTargets,
  lootMethodId: v.union(v.string(), v.null()),
  notes,
  configVersion: v.number(),
};

export const signupFields = {
  guildId: v.string(),
  eventId: v.string(),
  memberId: v.string(),
  characterId: v.string(),
  characterName: v.string(),
  class: v.string(),
  spec: v.string(),
  role,
  // True when a role was picked for this raid (#149); optional so older rows stay valid.
  rolePicked: v.optional(v.boolean()),
  status: signupStatus,
  note: v.union(v.string(), v.null()),
  signedUpAt: v.number(),
  updatedAt: v.number(),
  roster: rosterState,
  group: v.union(v.number(), v.null()),
  // Optional so rows written before the queue existed stay valid; read as false / null.
  queued: v.optional(v.boolean()),
  promotedAt: v.optional(v.union(v.number(), v.null())),
};

export const recordFields = {
  guildId: v.string(),
  eventId: v.string(),
  exportKey: v.string(),
  exporter: v.string(),
  exportedAt: v.number(),
  addonVersion: v.string(),
  snapshots: v.number(),
  attended: v.number(),
  drops: v.number(),
  recordedAt: v.number(),
  recordedBy: v.string(),
  /** Optional: records from before boss attempts (#221) read as null. */
  bosses: v.optional(
    v.union(
      v.null(),
      v.object({
        killed: v.number(),
        total: v.union(v.number(), v.null()),
        wipes: v.number(),
        firstPullAt: v.number(),
        lastEndAt: v.number(),
      }),
    ),
  ),
};

export const attendanceFields = {
  guildId: v.string(),
  eventId: v.string(),
  name: v.string(),
  class: v.union(v.string(), v.null()),
  characterId: v.union(v.string(), v.null()),
  memberId: v.union(v.string(), v.null()),
  snapshots: v.number(),
  labels: v.array(v.string()),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  /** Credited for standing by on the bench (#222); in no snapshot. Absent on older rows. */
  stoodBy: v.optional(v.boolean()),
};

// Every table carries guildId and is read through a guild-scoped index.
export default defineSchema({
  schedules: defineTable(scheduleFields).index('by_guild', ['guildId']),
  raidEvents: defineTable(eventFields)
    .index('by_guild_start', ['guildId', 'startsAt'])
    .index('by_guild_schedule_start', ['guildId', 'scheduleId', 'startsAt']),
  signups: defineTable(signupFields)
    .index('by_guild_event', ['guildId', 'eventId'])
    .index('by_guild_event_member', ['guildId', 'eventId', 'memberId'])
    // A member's history across raids, for signup-suggest's series guess.
    .index('by_guild_member', ['guildId', 'memberId', 'signedUpAt']),
  // The export a raid was recorded from (raid-export-record): one per raid.
  raidRecords: defineTable(recordFields).index('by_guild_event', ['guildId', 'eventId']),
  attendance: defineTable(attendanceFields).index('by_guild_event', ['guildId', 'eventId']),
});
