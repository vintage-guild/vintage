import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Mirrors src/contract.ts. The commands only ever write valid values; the component checks shape.

export const tier = v.union(
  v.literal('public'),
  v.literal('member'),
  v.literal('recruit'),
  v.literal('raider'),
  v.literal('leader'),
  v.literal('officer'),
);

export const pollMethod = v.union(v.literal('single'), v.literal('multi'), v.literal('ranked'));

export const pollStatus = v.union(
  v.literal('draft'),
  v.literal('open'),
  v.literal('closed'),
  v.literal('cancelled'),
);

export const resultsVisibility = v.union(
  v.literal('live'),
  v.literal('after-close'),
  v.literal('officers'),
);

const optionTally = v.object({ optionId: v.string(), votes: v.number() });

export const pollResults = v.object({
  method: pollMethod,
  ballots: v.number(),
  quorumMet: v.boolean(),
  options: v.array(optionTally),
  winners: v.array(v.string()),
  rounds: v.union(
    v.null(),
    v.array(v.object({ counts: v.array(optionTally), eliminated: v.array(v.string()) })),
  ),
});

export const pollFields = {
  guildId: v.string(),
  question: v.string(),
  description: v.union(v.string(), v.null()),
  options: v.array(
    v.object({
      id: v.string(),
      label: v.string(),
      emoji: v.union(v.string(), v.null()),
      value: v.union(v.string(), v.null()),
    }),
  ),
  method: pollMethod,
  maxChoices: v.union(v.number(), v.null()),
  eligibleTier: tier,
  anonymous: v.boolean(),
  resultsVisible: resultsVisibility,
  quorum: v.union(v.number(), v.null()),
  status: pollStatus,
  opensAt: v.union(v.number(), v.null()),
  closesAt: v.union(v.number(), v.null()),
  createdBy: v.string(),
  closedBy: v.union(v.string(), v.null()),
  createdAt: v.number(),
  closedAt: v.union(v.number(), v.null()),
  tags: v.array(v.string()),
  configVersion: v.number(),
  results: v.union(pollResults, v.null()),
};

export const voteFields = {
  guildId: v.string(),
  pollId: v.string(),
  memberId: v.string(),
  choices: v.array(v.string()),
  weight: v.number(),
  castAt: v.number(),
  updatedAt: v.number(),
};

export const postFields = {
  guildId: v.string(),
  pollId: v.string(),
  channelId: v.string(),
  messageId: v.string(),
  renderedKey: v.string(),
};

// Every table carries guildId and is read through a guild-scoped index.
export default defineSchema({
  polls: defineTable(pollFields)
    .index('by_guild', ['guildId'])
    .index('by_guild_status', ['guildId', 'status']),
  votes: defineTable(voteFields)
    .index('by_guild_poll', ['guildId', 'pollId'])
    .index('by_guild_poll_member', ['guildId', 'pollId', 'memberId']),
  pollPosts: defineTable(postFields).index('by_guild_poll', ['guildId', 'pollId']),
});
