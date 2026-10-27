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
  /** Optional: rows saved before server events existed read as off. */
  serverEvents: v.optional(v.boolean()),
  paused: v.boolean(),
  updatedAt: v.number(),
};

export const raidNightOutcome = v.union(
  v.literal('pending'),
  v.literal('created'),
  v.literal('unresolved'),
  v.literal('cancelled'),
);

export const raidNightFields = {
  guildId: v.string(),
  pollId: v.string(),
  name: v.string(),
  instance: v.string(),
  size: v.union(v.literal(10), v.literal(20), v.literal(40)),
  durationMinutes: v.number(),
  createdBy: v.string(),
  createdAt: v.number(),
  outcome: raidNightOutcome,
  raidEventId: v.union(v.string(), v.null()),
  detail: v.union(v.string(), v.null()),
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
  /** Raid-night polls (#64): the raid to create when its poll picks a time. */
  raidNights: defineTable(raidNightFields).index('by_guild_outcome', ['guildId', 'outcome']),
});
