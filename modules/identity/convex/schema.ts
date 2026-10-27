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

/** A guild rank (PLAN §3.4). */
export const guildRank = v.union(
  v.literal('officer'),
  v.literal('raid-leader'),
  v.literal('raider'),
  v.literal('flex-raider'),
  v.literal('recruit'),
  v.literal('member'),
  v.literal('friend'),
);

/** Guild rank from Discord roles (null when the member has none). */
export const rank = v.union(guildRank, v.null());

export const role = v.union(
  v.literal('tank'),
  v.literal('healer'),
  v.literal('melee'),
  v.literal('ranged'),
);

/** Member preferences as commands write them. */
export const prefs = v.object({
  dmOptOut: v.boolean(),
  timezone: v.optional(v.string()),
});

/**
 * Stored preferences. `defaultCharacterId` was dropped (#149: the main is the default) but stays
 * optional here so rows written before then still validate; nothing reads it, the members mapper
 * strips it, and the next prefs write leaves it out.
 */
const storedPrefs = v.object({
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
    prefs: storedPrefs,
    syncedAt: v.number(),
    // When the rank last changed. Optional so rows from before it was recorded stay valid;
    // read as null ("before tracking began") until the rank changes.
    rankSince: v.optional(v.union(v.number(), v.null())),
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
    // True when the member picked the role; otherwise it follows the spec. Optional so rows
    // from before #149 stay valid; read as false (guessed).
    rolePicked: v.optional(v.boolean()),
    isMain: v.boolean(),
  })
    .index('by_guild', ['guildId'])
    .index('by_guild_member', ['guildId', 'memberId'])
    .index('by_guild_name', ['guildId', 'name']),

  /** Officer-editable map from a Discord role id to the guild rank it grants (PLAN §3.4). */
  roleRanks: defineTable({
    guildId: v.string(),
    discordRoleId: v.string(),
    rank: guildRank,
  }).index('by_guild', ['guildId']),
});
