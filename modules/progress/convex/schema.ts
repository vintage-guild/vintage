import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const itemQuality = v.union(
  v.literal('poor'),
  v.literal('common'),
  v.literal('uncommon'),
  v.literal('rare'),
  v.literal('epic'),
  v.literal('legendary'),
);

export const raidId = v.union(
  v.literal('barrow-deeps'),
  v.literal('hyjal-summit'),
  v.literal('onyxias-lair'),
);

export const killFields = {
  guildId: v.string(),
  raidId,
  bossId: v.string(),
  killedAt: v.number(),
  loot: v.array(v.object({ name: v.string(), quality: itemQuality })),
  note: v.union(v.string(), v.null()),
  recordedBy: v.string(),
  recordedAt: v.number(),
};

// Every table carries guildId and is read through a guild-scoped index. The raids and bosses
// themselves are data in the contract, not rows.
export default defineSchema({
  kills: defineTable(killFields)
    .index('by_guild_killed', ['guildId', 'killedAt'])
    .index('by_guild_raid_killed', ['guildId', 'raidId', 'killedAt']),
});
