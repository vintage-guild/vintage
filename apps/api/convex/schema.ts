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
});
