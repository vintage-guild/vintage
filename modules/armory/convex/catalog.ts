// Component functions for the recipe catalog. Called only by apps/api through `components.armory`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { catalogFields } from './schema';

const toCatalog = (doc: Doc<'professionCatalog'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const list = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) =>
    (
      await ctx.db
        .query('professionCatalog')
        .withIndex('by_guild_profession', (q) => q.eq('guildId', guildId))
        .collect()
    ).map(toCatalog),
});

/** Inserts or replaces one profession's catalog. */
export const put = mutation({
  args: catalogFields,
  handler: async (ctx, catalog) => {
    const existing = await ctx.db
      .query('professionCatalog')
      .withIndex('by_guild_profession', (q) =>
        q.eq('guildId', catalog.guildId).eq('profession', catalog.profession),
      )
      .first();
    if (existing) await ctx.db.replace(existing._id, catalog);
    else await ctx.db.insert('professionCatalog', catalog);
  },
});
