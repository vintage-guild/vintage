// Component functions for the recruiting band. Called only by apps/api through `components.site`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { recruitingFields } from './schema';

const toRecord = (doc: Doc<'recruiting'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
};

export const get = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const doc = await ctx.db
      .query('recruiting')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .unique();
    return doc ? toRecord(doc) : null;
  },
});

export const put = mutation({
  args: recruitingFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('recruiting')
      .withIndex('by_guild', (q) => q.eq('guildId', args.guildId))
      .unique();
    if (existing) await ctx.db.replace(existing._id, args);
    else await ctx.db.insert('recruiting', args);
    return args;
  },
});
