import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const dropFields = {
  guildId: v.string(),
  eventId: v.string(),
  itemId: v.number(),
  itemName: v.union(v.string(), v.null()),
  count: v.number(),
  looter: v.string(),
  characterId: v.union(v.string(), v.null()),
  memberId: v.union(v.string(), v.null()),
  at: v.number(),
  source: v.union(v.string(), v.null()),
  lootMethodId: v.union(v.string(), v.null()),
  recordedAt: v.number(),
};

// This module's tables. Every table carries guildId and is read through a guild-scoped index.
export default defineSchema({
  drops: defineTable(dropFields).index('by_guild_event', ['guildId', 'eventId', 'at']),
});
