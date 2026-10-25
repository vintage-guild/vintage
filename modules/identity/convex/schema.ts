import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const tier = v.union(
  v.literal('public'),
  v.literal('member'),
  v.literal('recruit'),
  v.literal('raider'),
  v.literal('leader'),
  v.literal('officer'),
);

/** Guild rank from Discord roles (null when the member has none). */
export const rank = v.union(
  v.literal('officer'),
  v.literal('raid-leader'),
  v.literal('raider'),
  v.literal('flex-raider'),
  v.literal('recruit'),
  v.literal('member'),
  v.literal('friend'),
  v.null(),
);

export const role = v.union(
  v.literal('tank'),
  v.literal('healer'),
  v.literal('melee'),
  v.literal('ranged'),
);

export const prefs = v.object({
  dmOptOut: v.boolean(),
  defaultCharacterId: v.optional(v.string()),
  timezone: v.optional(v.string()),
});

export default defineSchema({
  members: defineTable({
    guildId: v.string(),
    discordId: v.string(),
    displayName: v.string(),
    roleIds: v.array(v.string()),
    // Optional so rows written before ranks existed stay valid; read as null until the next sync.
    rank: v.optional(rank),
    tier,
    prefs,
    syncedAt: v.number(),
  })
    .index('by_guild', ['guildId'])
    .index('by_guild_discord', ['guildId', 'discordId']),

  characters: defineTable({
    guildId: v.string(),
    memberId: v.string(),
    name: v.string(),
    class: v.string(),
    spec: v.string(),
    role,
    isMain: v.boolean(),
  })
    .index('by_guild', ['guildId'])
    .index('by_guild_member', ['guildId', 'memberId'])
    .index('by_guild_name', ['guildId', 'name']),
});
