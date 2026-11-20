// Component functions for the recipe catalog. Called only by apps/api through `components.armory`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { catalogFields, recipeDetailFields } from './schema';

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

/** Every recipe with details and the item it makes, without the rest of the row. */
export const listRecipeItems = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) =>
    (
      await ctx.db
        .query('recipeDetails')
        .withIndex('by_guild_recipe', (q) => q.eq('guildId', guildId))
        .collect()
    ).map((d) => ({ recipeId: d.recipeId, itemId: d.itemId })),
});

export const getRecipeDetail = query({
  args: { guildId: v.string(), recipeId: v.number() },
  handler: async (ctx, { guildId, recipeId }) => {
    const doc = await ctx.db
      .query('recipeDetails')
      .withIndex('by_guild_recipe', (q) => q.eq('guildId', guildId).eq('recipeId', recipeId))
      .first();
    if (!doc) return null;
    const { _id, _creationTime, ...rest } = doc;
    return { id: _id as string, ...rest };
  },
});

/** Inserts or replaces each recipe's details. */
export const putRecipeDetails = mutation({
  args: { details: v.array(v.object(recipeDetailFields)) },
  handler: async (ctx, { details }) => {
    for (const detail of details) {
      const existing = await ctx.db
        .query('recipeDetails')
        .withIndex('by_guild_recipe', (q) =>
          q.eq('guildId', detail.guildId).eq('recipeId', detail.recipeId),
        )
        .first();
      if (existing) await ctx.db.replace(existing._id, detail);
      else await ctx.db.insert('recipeDetails', detail);
    }
  },
});
