import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Mirrors src/contract.ts. The commands only ever write valid values; the component checks shape.

export const tier = v.union(
  v.literal('public'),
  v.literal('friend'),
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

export const surveyQuestionKind = v.union(
  v.literal('single'),
  v.literal('multi'),
  v.literal('ranked'),
  v.literal('text'),
);

export const surveyQuestion = v.object({
  id: v.string(),
  prompt: v.string(),
  kind: surveyQuestionKind,
  required: v.boolean(),
  options: v.array(
    v.object({
      id: v.string(),
      label: v.string(),
      emoji: v.union(v.string(), v.null()),
      value: v.union(v.string(), v.null()),
    }),
  ),
  maxChoices: v.union(v.number(), v.null()),
});

export const surveyQuestionResults = v.union(
  v.object({
    questionId: v.string(),
    prompt: v.string(),
    kind: pollMethod,
    tally: pollResults,
  }),
  v.object({
    questionId: v.string(),
    prompt: v.string(),
    kind: v.literal('text'),
    responses: v.number(),
    answers: v.array(
      v.object({
        text: v.string(),
        memberId: v.union(v.string(), v.null()),
        displayName: v.union(v.string(), v.null()),
      }),
    ),
  }),
);

export const surveyResults = v.object({
  responses: v.number(),
  questions: v.array(surveyQuestionResults),
});

export const surveyFields = {
  guildId: v.string(),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  questions: v.array(surveyQuestion),
  eligibleTier: tier,
  anonymous: v.boolean(),
  resultsVisible: resultsVisibility,
  status: pollStatus,
  opensAt: v.union(v.number(), v.null()),
  closesAt: v.union(v.number(), v.null()),
  createdBy: v.string(),
  closedBy: v.union(v.string(), v.null()),
  createdAt: v.number(),
  closedAt: v.union(v.number(), v.null()),
  tags: v.array(v.string()),
  configVersion: v.number(),
  results: v.union(surveyResults, v.null()),
};

export const surveyAnswer = v.object({
  questionId: v.string(),
  choices: v.array(v.string()),
  text: v.union(v.string(), v.null()),
});

export const surveyResponseFields = {
  guildId: v.string(),
  surveyId: v.string(),
  memberId: v.string(),
  answers: v.array(surveyAnswer),
  submittedAt: v.number(),
  updatedAt: v.number(),
};

export const surveyPostFields = {
  guildId: v.string(),
  surveyId: v.string(),
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
  surveys: defineTable(surveyFields)
    .index('by_guild', ['guildId'])
    .index('by_guild_status', ['guildId', 'status']),
  surveyResponses: defineTable(surveyResponseFields)
    .index('by_guild_survey', ['guildId', 'surveyId'])
    .index('by_guild_survey_member', ['guildId', 'surveyId', 'memberId']),
  surveyPosts: defineTable(surveyPostFields).index('by_guild_survey', ['guildId', 'surveyId']),
});
