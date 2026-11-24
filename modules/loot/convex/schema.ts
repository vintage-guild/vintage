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

export const methodConfigFields = {
  guildId: v.string(),
  methodId: v.string(),
  methodVersion: v.number(),
  configVersion: v.number(),
  config: v.any(),
  state: v.any(),
  updatedAt: v.number(),
  updatedBy: v.string(),
};

export const awardIntentValidator = v.union(
  v.literal('mainspec'),
  v.literal('offspec'),
  v.literal('transmog'),
  v.literal('disenchant'),
  v.literal('other'),
);

export const awardFields = {
  guildId: v.string(),
  eventId: v.string(),
  itemId: v.number(),
  itemName: v.union(v.string(), v.null()),
  characterId: v.string(),
  characterName: v.string(),
  memberId: v.union(v.string(), v.null()),
  intent: awardIntentValidator,
  methodId: v.string(),
  methodVersion: v.number(),
  configVersion: v.number(),
  roll: v.union(v.number(), v.null()),
  note: v.union(v.string(), v.null()),
  awardedAt: v.number(),
  awardedBy: v.string(),
};

// This module's tables. Every table carries guildId and is read through a guild-scoped index.
export default defineSchema({
  drops: defineTable(dropFields).index('by_guild_event', ['guildId', 'eventId', 'at']),
  methodConfigs: defineTable(methodConfigFields)
    .index('by_guild', ['guildId'])
    .index('by_guild_method', ['guildId', 'methodId']),
  awards: defineTable(awardFields)
    .index('by_guild_awarded', ['guildId', 'awardedAt'])
    .index('by_guild_event', ['guildId', 'eventId', 'awardedAt'])
    .index('by_guild_character', ['guildId', 'characterId', 'awardedAt']),
});
