import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// App-level tables only. Each module's tables live in its own component (PLAN §4.3); the
// Discord role → rank map, for one, is identity's `roleRanks` table.
export default defineSchema({
  /** Cross-module event bus (PLAN §4.3): modules emit, subscribers are fanned out by the scheduler. */
  events: defineTable({
    guildId: v.string(),
    type: v.string(),
    payload: v.any(),
    emittedAt: v.number(),
    processedAt: v.optional(v.number()),
  }).index('by_unprocessed', ['processedAt', 'emittedAt']),
  /** Coalesced immediate coordinator tick window per guild (signup-improvements row 9). */
  tickSchedules: defineTable({
    guildId: v.string(),
    scheduledFor: v.number(),
  }).index('by_guild', ['guildId']),
  /** Last ops-channel alert sent per failure kind, for hourly deduplication (#262). */
  opsAlerts: defineTable({
    guildId: v.string(),
    key: v.string(),
    lastSentAt: v.number(),
    lastError: v.string(),
  }).index('by_guild_key', ['guildId', 'key']),
});
