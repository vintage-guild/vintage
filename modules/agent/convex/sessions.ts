// Component functions for saved Agents API sessions. Called only by apps/api.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { sessionFields } from './schema';

const toRecord = (doc: Doc<'sessions'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
};

export const get = query({
  args: { guildId: v.string(), threadKey: v.string() },
  handler: async (ctx, { guildId, threadKey }) => {
    const doc = await ctx.db
      .query('sessions')
      .withIndex('by_guild_thread', (q) => q.eq('guildId', guildId).eq('threadKey', threadKey))
      .unique();
    return doc ? toRecord(doc) : null;
  },
});

export const put = mutation({
  args: sessionFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('sessions')
      .withIndex('by_guild_thread', (q) =>
        q.eq('guildId', args.guildId).eq('threadKey', args.threadKey),
      )
      .unique();
    if (existing) await ctx.db.replace(existing._id, args);
    else await ctx.db.insert('sessions', args);
  },
});

export const remove = mutation({
  args: { guildId: v.string(), threadKey: v.string() },
  handler: async (ctx, { guildId, threadKey }) => {
    const existing = await ctx.db
      .query('sessions')
      .withIndex('by_guild_thread', (q) => q.eq('guildId', guildId).eq('threadKey', threadKey))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const idle = query({
  args: { guildId: v.string(), before: v.number() },
  handler: async (ctx, { guildId, before }) =>
    (
      await ctx.db
        .query('sessions')
        .withIndex('by_guild_last_used', (q) => q.eq('guildId', guildId).lt('lastUsedAt', before))
        .take(100)
    ).map(toRecord),
});
