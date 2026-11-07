import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

export const status = v.union(
  v.literal('pending'),
  v.literal('found'),
  v.literal('not-found'),
  v.literal('error'),
);

export const profile = v.object({
  blizzardId: v.number(),
  name: v.string(),
  surname: v.string(),
  level: v.number(),
  className: nullableString,
  raceName: nullableString,
  faction: nullableString,
  guildName: nullableString,
  guildSlug: nullableString,
  activeSpec: nullableString,
  equippedItemLevel: nullableNumber,
  averageItemLevel: nullableNumber,
  lastLoginAt: nullableNumber,
});

export const item = v.object({
  slot: v.string(),
  itemId: v.number(),
  name: nullableString,
  quality: nullableString,
  itemLevel: nullableNumber,
});

/** Every field but the link's id, guild, and character: what an update may change. */
export const linkPatchFields = {
  name: v.string(),
  surname: v.string(),
  slug: v.string(),
  status,
  profile: v.union(profile, v.null()),
  equipment: v.array(item),
  avatarUrl: nullableString,
  classMismatch: v.boolean(),
  error: nullableString,
  linkedBy: v.string(),
  linkedAt: v.number(),
  requestedAt: v.number(),
  checkedAt: nullableNumber,
  fetchedAt: nullableNumber,
};

export const linkFields = {
  guildId: v.string(),
  characterId: v.string(),
  ...linkPatchFields,
};

// Every table carries guildId and is read through a guild-scoped index.
export default defineSchema({
  links: defineTable(linkFields)
    .index('by_guild_name', ['guildId', 'name', 'surname'])
    .index('by_guild_character', ['guildId', 'characterId'])
    .index('by_guild_slug', ['guildId', 'slug']),
});
