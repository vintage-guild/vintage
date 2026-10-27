// Component functions for the agent config. Called only by apps/api through `components.agent`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { configFields } from './schema';

const toRecord = (doc: Doc<'config'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
};

/** The saved config, or null; apps/api answers the module's defaults for null. */
export const get = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const doc = await ctx.db
      .query('config')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .unique();
    return doc ? toRecord(doc) : null;
  },
});

export const put = mutation({
  args: configFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('config')
      .withIndex('by_guild', (q) => q.eq('guildId', args.guildId))
      .unique();
    if (existing) await ctx.db.replace(existing._id, args);
    else await ctx.db.insert('config', args);
    return args;
  },
});
