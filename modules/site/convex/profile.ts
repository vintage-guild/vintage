// Component functions for the guild profile. Called only by apps/api through `components.site`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { profileFields } from './schema';

const toRecord = (doc: Doc<'profile'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
};

export const get = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const doc = await ctx.db
      .query('profile')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .unique();
    return doc ? toRecord(doc) : null;
  },
});

export const put = mutation({
  args: profileFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('profile')
      .withIndex('by_guild', (q) => q.eq('guildId', args.guildId))
      .unique();
    if (existing) await ctx.db.replace(existing._id, args);
    else await ctx.db.insert('profile', args);
    return args;
  },
});
