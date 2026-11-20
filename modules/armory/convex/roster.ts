// Component functions for the guild roster. Called only by apps/api through `components.armory`.
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
import { rosterEntryFields, rosterEntryPatchFields, rosterRecipe } from './schema';

/** Any subset of the patchable fields. */
const patchValidator = v.object(
  Object.fromEntries(
    Object.entries(rosterEntryPatchFields).map(([key, validator]) => [key, v.optional(validator)]),
  ) as {
    [K in keyof typeof rosterEntryPatchFields]: ReturnType<
      typeof v.optional<(typeof rosterEntryPatchFields)[K]>
    >;
  },
);

const toEntry = (doc: Doc<'rosterEntries'>) => {
  const { _id, _creationTime, preferredRole, secondaryRole, ...rest } = doc;
  return {
    id: _id as string,
    preferredRole: preferredRole ?? null,
    secondaryRole: secondaryRole ?? null,
    ...rest,
  };
};

const recipesOf = (ctx: MutationCtx, guildId: string, entryId: Id<'rosterEntries'>) =>
  ctx.db
    .query('rosterRecipes')
    .withIndex('by_guild_entry', (q) => q.eq('guildId', guildId).eq('entryId', entryId))
    .first();

export const list = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) =>
    (
      await ctx.db
        .query('rosterEntries')
        .withIndex('by_guild_rank', (q) => q.eq('guildId', guildId))
        .collect()
    ).map(toEntry),
});

export const bySlug = query({
  args: { guildId: v.string(), slug: v.string() },
  handler: async (ctx, { guildId, slug }) => {
    const doc = await ctx.db
      .query('rosterEntries')
      .withIndex('by_guild_slug', (q) => q.eq('guildId', guildId).eq('slug', slug))
      .first();
    return doc && toEntry(doc);
  },
});

export const insert = mutation({
  args: rosterEntryFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('rosterEntries', args);
    return toEntry((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: { guildId: v.string(), entryId: v.string(), patch: patchValidator },
  handler: async (ctx, { guildId, entryId, patch }) => {
    const id = ctx.db.normalizeId('rosterEntries', entryId);
    const doc = id && (await ctx.db.get(id));
    if (!id || !doc || doc.guildId !== guildId) throw new Error(`No roster entry ${entryId}`);
    await ctx.db.patch(id, patch);
    return toEntry((await ctx.db.get(id))!);
  },
});

/** Deletes the entry and its recipes. */
export const remove = mutation({
  args: { guildId: v.string(), entryId: v.string() },
  handler: async (ctx, { guildId, entryId }) => {
    const id = ctx.db.normalizeId('rosterEntries', entryId);
    const doc = id && (await ctx.db.get(id));
    if (!id || !doc || doc.guildId !== guildId) return;
    const recipes = await recipesOf(ctx, guildId, id);
    if (recipes) await ctx.db.delete(recipes._id);
    await ctx.db.delete(id);
  },
});

/** Every entry's recipes in the guild; entries with none are left out. */
export const listRecipes = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const rows = await ctx.db
      .query('rosterRecipes')
      .withIndex('by_guild_entry', (q) => q.eq('guildId', guildId))
      .collect();
    return rows
      .filter(({ recipes }) => recipes.length > 0)
      .map(({ entryId, recipes }) => ({ entryId: entryId as string, recipes }));
  },
});

/** Replace one entry's recipes. */
export const setRecipes = mutation({
  args: { guildId: v.string(), entryId: v.string(), recipes: v.array(rosterRecipe) },
  handler: async (ctx, { guildId, entryId, recipes }) => {
    const id = ctx.db.normalizeId('rosterEntries', entryId);
    const doc = id && (await ctx.db.get(id));
    if (!id || !doc || doc.guildId !== guildId) throw new Error(`No roster entry ${entryId}`);
    const existing = await recipesOf(ctx, guildId, id);
    if (existing) await ctx.db.patch(existing._id, { recipes });
    else await ctx.db.insert('rosterRecipes', { guildId, entryId: id, recipes });
  },
});
