import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const wowClass = v.union(
  v.literal('warrior'),
  v.literal('paladin'),
  v.literal('hunter'),
  v.literal('rogue'),
  v.literal('priest'),
  v.literal('shaman'),
  v.literal('mage'),
  v.literal('warlock'),
  v.literal('druid'),
);

export const recruitingFields = {
  guildId: v.string(),
  headline: v.string(),
  pitch: v.string(),
  needs: v.array(
    v.object({
      wowClass,
      specs: v.string(),
      need: v.union(v.literal('high'), v.literal('medium'), v.literal('closed')),
    }),
  ),
  updatedAt: v.number(),
  updatedBy: v.string(),
};

export const profileFields = {
  guildId: v.string(),
  pills: v.array(v.string()),
  intro: v.string(),
  aboutLead: v.string(),
  aboutSections: v.array(v.object({ heading: v.string(), body: v.string() })),
  discordInvite: v.union(v.string(), v.null()),
  contactEmail: v.union(v.string(), v.null()),
  updatedAt: v.number(),
  updatedBy: v.string(),
};

// Every table carries guildId and is read through a guild-scoped index. One recruiting row and one
// profile row per guild; until one exists the commands answer the starter text from the contract.
export default defineSchema({
  recruiting: defineTable(recruitingFields).index('by_guild', ['guildId']),
  profile: defineTable(profileFields).index('by_guild', ['guildId']),
});
