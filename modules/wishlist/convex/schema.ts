import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const entryFields = {
  guildId: v.string(),
  characterId: v.string(),
  memberId: v.string(),
  itemId: v.number(),
  itemName: v.union(v.string(), v.null()),
  rank: v.number(),
  note: v.union(v.string(), v.null()),
  updatedAt: v.number(),
  updatedBy: v.string(),
};

// This module's tables. Every table carries guildId and is read through a guild-scoped index.
export default defineSchema({
  entries: defineTable(entryFields)
    .index('by_guild', ['guildId'])
    .index('by_guild_character', ['guildId', 'characterId', 'rank'])
    .index('by_guild_item', ['guildId', 'itemId', 'rank'])
    .index('by_guild_member', ['guildId', 'memberId']),
});
