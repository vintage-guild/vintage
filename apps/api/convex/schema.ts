import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// App-level tables only. Each module's tables live in its own component (PLAN §4.3).
export default defineSchema({
  /** Per-guild configuration: the Discord role → tier map (PLAN §3.4, Q1). */
  guildSettings: defineTable({
    guildId: v.string(),
    roleTierMap: v.record(v.string(), v.string()),
  }).index('by_guild', ['guildId']),

  /** Cross-module event bus (PLAN §4.3): modules emit, subscribers are fanned out by the scheduler. */
  events: defineTable({
    guildId: v.string(),
    type: v.string(),
    payload: v.any(),
    emittedAt: v.number(),
    processedAt: v.optional(v.number()),
  }).index('by_unprocessed', ['processedAt', 'emittedAt']),
});
