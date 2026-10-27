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
  /** Optional so rows saved before #130 still load; read as false (officers turn it on). */
  weeklyAssessment: v.optional(v.boolean()),
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
  // Optional so nights from before event kinds (#151) stay valid; read as 'raid' and null.
  kind: v.optional(
    v.union(v.literal('raid'), v.literal('dungeon'), v.literal('battleground'), v.literal('other')),
  ),
  // Any size from 1 to 40, checked per kind by raid-night-poll. Widened from 10/20/40.
  size: v.union(v.number(), v.null()),
  roleTargets: v.optional(
    v.union(v.object({ tank: v.number(), healer: v.number(), dps: v.number() }), v.null()),
  ),
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
