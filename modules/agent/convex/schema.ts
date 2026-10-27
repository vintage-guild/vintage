import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const effort = v.union(
  v.literal('none'),
  v.literal('minimal'),
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
);
export const runKind = v.union(v.literal('ask'), v.literal('wording'), v.literal('decision'));
export const runStatus = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('answered'),
  v.literal('failed'),
);
export const confirmationStatus = v.union(
  v.literal('pending'),
  v.literal('done'),
  v.literal('failed'),
  v.literal('declined'),
  v.literal('expired'),
);

export const configFields = {
  guildId: v.string(),
  paused: v.boolean(),
  model: v.string(),
  effort,
  memberDailyAsks: v.number(),
  guildMonthlyAsks: v.number(),
  guildMonthlyDecisions: v.number(),
  updatedAt: v.number(),
  updatedBy: v.union(v.string(), v.null()),
};

export const toolCall = v.object({
  name: v.string(),
  command: v.union(v.string(), v.null()),
  success: v.boolean(),
});

export const runFields = {
  guildId: v.string(),
  kind: runKind,
  memberId: v.union(v.string(), v.null()),
  surface: v.string(),
  threadKey: v.union(v.string(), v.null()),
  label: v.union(v.string(), v.null()),
  prompt: v.string(),
  status: runStatus,
  answer: v.union(v.string(), v.null()),
  error: v.union(v.string(), v.null()),
  model: v.union(v.string(), v.null()),
  sessionId: v.union(v.string(), v.null()),
  toolCalls: v.array(toolCall),
  confirmationIds: v.array(v.string()),
  inputTokens: v.union(v.number(), v.null()),
  createdAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
};

export const sessionFields = {
  guildId: v.string(),
  threadKey: v.string(),
  memberId: v.string(),
  sessionId: v.string(),
  createdAt: v.number(),
  lastUsedAt: v.number(),
};

export const confirmationFields = {
  guildId: v.string(),
  runId: v.string(),
  memberId: v.string(),
  command: v.string(),
  input: v.any(),
  confirmToken: v.union(v.string(), v.null()),
  preview: v.any(),
  summary: v.string(),
  status: confirmationStatus,
  createdAt: v.number(),
  expiresAt: v.number(),
  result: v.any(),
  finishedAt: v.union(v.number(), v.null()),
};

export const toolResultFields = {
  guildId: v.string(),
  runId: v.string(),
  callId: v.string(),
  success: v.boolean(),
  output: v.string(),
  error: v.union(v.string(), v.null()),
};

export const usageFields = { guildId: v.string(), key: v.string(), count: v.number() };

// Every table carries guildId and is read through a guild-scoped index.
export default defineSchema({
  config: defineTable(configFields).index('by_guild', ['guildId']),
  runs: defineTable(runFields)
    .index('by_guild_created', ['guildId', 'createdAt'])
    .index('by_guild_member_created', ['guildId', 'memberId', 'createdAt'])
    .index('by_guild_kind_created', ['guildId', 'kind', 'createdAt']),
  sessions: defineTable(sessionFields)
    .index('by_guild_thread', ['guildId', 'threadKey'])
    .index('by_guild_last_used', ['guildId', 'lastUsedAt']),
  confirmations: defineTable(confirmationFields)
    .index('by_guild_run', ['guildId', 'runId'])
    .index('by_guild_status_expires', ['guildId', 'status', 'expiresAt']),
  usage: defineTable(usageFields).index('by_guild_key', ['guildId', 'key']),
  toolResults: defineTable(toolResultFields).index('by_guild_run_call', [
    'guildId',
    'runId',
    'callId',
  ]),
});
