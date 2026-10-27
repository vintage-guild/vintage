import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const findingKind = v.union(
  v.literal('deaths'),
  v.literal('killed-by'),
  v.literal('kicks'),
  v.literal('damage-taken'),
);

export const runFields = {
  guildId: v.string(),
  runKey: v.string(),
  zoneName: v.string(),
  startedAt: v.number(),
  durationSeconds: v.number(),
  roster: v.array(v.string()),
  importedBy: v.string(),
  createdAt: v.number(),
  sentAt: v.union(v.number(), v.null()),
};

export const findingFields = {
  guildId: v.string(),
  runId: v.string(),
  character: v.string(),
  memberId: v.union(v.string(), v.null()),
  kind: findingKind,
  text: v.string(),
  evidence: v.string(),
  weight: v.number(),
};

export const optInFields = {
  guildId: v.string(),
  memberId: v.string(),
  dms: v.boolean(),
  updatedAt: v.number(),
};

// Every table carries guildId and is read through a guild-scoped index.
export default defineSchema({
  runs: defineTable(runFields)
    .index('by_guild_key', ['guildId', 'runKey'])
    .index('by_guild_created', ['guildId', 'createdAt']),
  findings: defineTable(findingFields).index('by_guild_run', ['guildId', 'runId']),
  optins: defineTable(optInFields)
    .index('by_guild_member', ['guildId', 'memberId'])
    .index('by_guild_dms', ['guildId', 'dms']),
});
