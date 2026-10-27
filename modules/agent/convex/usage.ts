// Component functions for usage counters. Called only by apps/api through `components.agent`.
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const get = query({
  args: { guildId: v.string(), key: v.string() },
  handler: async (ctx, { guildId, key }) => {
    const doc = await ctx.db
      .query('usage')
      .withIndex('by_guild_key', (q) => q.eq('guildId', guildId).eq('key', key))
      .unique();
    return doc?.count ?? 0;
  },
});

export const bump = mutation({
  args: { guildId: v.string(), key: v.string() },
  handler: async (ctx, { guildId, key }) => {
    const doc = await ctx.db
      .query('usage')
      .withIndex('by_guild_key', (q) => q.eq('guildId', guildId).eq('key', key))
      .unique();
    if (doc) {
      await ctx.db.patch(doc._id, { count: doc.count + 1 });
      return doc.count + 1;
    }
    await ctx.db.insert('usage', { guildId, key, count: 1 });
    return 1;
  },
});
