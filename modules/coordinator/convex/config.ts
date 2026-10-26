// Component functions for coordinator config. Called only by apps/api through `components.coordinator`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { configFields } from './schema';

const toConfig = (doc: Doc<'config'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
};

const { guildId: _g, updatedAt: _u, ...patchable } = configFields;

/** The saved config, or null when the guild still uses the defaults. */
export const get = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const doc = await ctx.db
      .query('config')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .first();
    return doc ? toConfig(doc) : null;
  },
});

/** Write the whole config (apps/api merges the patch onto the current or default config). */
export const put = mutation({
  args: { guildId: v.string(), config: v.object(patchable), updatedAt: v.number() },
  handler: async (ctx, { guildId, config, updatedAt }) => {
    const existing = await ctx.db
      .query('config')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .first();
    const row = { ...config, guildId, updatedAt };
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert('config', row);
    return row;
  },
});
