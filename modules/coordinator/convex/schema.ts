import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const guildRank = v.union(
  v.literal('officer'),
  v.literal('raid-leader'),
  v.literal('raider'),
  v.literal('flex-raider'),
  v.literal('recruit'),
  v.literal('member'),
  v.literal('friend'),
);

export const actionStatus = v.union(
  v.literal('pending'),
  v.literal('sent'),
  v.literal('skipped'),
  v.literal('failed'),
);

export const configFields = {
  guildId: v.string(),
  signupChannelId: v.union(v.string(), v.null()),
  opsChannelId: v.union(v.string(), v.null()),
  expectedRanks: v.array(guildRank),
  dmReminders: v.boolean(),
  paused: v.boolean(),
  updatedAt: v.number(),
};

export default defineSchema({
  /** One row per guild; missing means the defaults. */
  config: defineTable(configFields).index('by_guild', ['guildId']),
  /** Every coordinator action and why (PLAN §6.2). The key is (guild, event, rule, target). */
  actions: defineTable({
    guildId: v.string(),
    eventId: v.string(),
    rule: v.string(),
    target: v.string(),
    status: actionStatus,
    discordMessageId: v.union(v.string(), v.null()),
    detail: v.union(v.string(), v.null()),
    renderHash: v.union(v.string(), v.null()),
    claimedAt: v.number(),
    finishedAt: v.union(v.number(), v.null()),
  })
    .index('by_guild_event', ['guildId', 'eventId'])
    .index('by_key', ['guildId', 'eventId', 'rule', 'target'])
    .index('by_guild_claimed', ['guildId', 'claimedAt']),
});
