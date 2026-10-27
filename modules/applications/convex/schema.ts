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
export const applyRole = v.union(v.literal('raider'), v.literal('flex-raider'));
export const status = v.union(
  v.literal('new'),
  v.literal('in-review'),
  v.literal('accepted'),
  v.literal('declined'),
  v.literal('withdrawn'),
);
export const labels = v.union(
  v.object({
    role: v.union(v.literal('raider'), v.literal('flex-raider'), v.literal('social'), v.null()),
    complete: v.union(v.boolean(), v.null()),
    fit: v.union(v.number(), v.null()),
    labeledAt: v.number(),
  }),
  v.null(),
);

export const applicationFields = {
  guildId: v.string(),
  discordId: v.string(),
  applicantName: v.string(),
  characterName: v.string(),
  wowClass,
  spec: v.string(),
  role: applyRole,
  about: v.string(),
  experience: v.string(),
  availability: v.string(),
  status,
  labels,
  reply: v.union(v.string(), v.null()),
  reviewedBy: v.union(v.string(), v.null()),
  reviewedAt: v.union(v.number(), v.null()),
  postChannelId: v.union(v.string(), v.null()),
  postMessageId: v.union(v.string(), v.null()),
  // Optional: rows from before onboarding-on-promotion (#135) have none; see toApplication.
  onboardedAt: v.optional(v.union(v.number(), v.null())),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const configFields = {
  guildId: v.string(),
  channelId: v.union(v.string(), v.null()),
  onboarding: v.string(),
  // The rolling limit (#145). Optional: config rows from before it have none, and read as the
  // defaults (apps/api merges them).
  limitCount: v.optional(v.number()),
  limitWindowMinutes: v.optional(v.number()),
  limitAlertedAt: v.optional(v.union(v.number(), v.null())),
  updatedAt: v.number(),
};

// Every table carries guildId and is read through a guild-scoped index.
export default defineSchema({
  applications: defineTable(applicationFields)
    .index('by_guild_created', ['guildId', 'createdAt'])
    .index('by_guild_discord_created', ['guildId', 'discordId', 'createdAt']),
  config: defineTable(configFields).index('by_guild', ['guildId']),
});
