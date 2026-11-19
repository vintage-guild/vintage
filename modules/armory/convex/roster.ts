// Component functions for the guild roster. Called only by apps/api through `components.armory`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { rosterEntryFields, rosterEntryPatchFields } from './schema';

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
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

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

export const remove = mutation({
  args: { guildId: v.string(), entryId: v.string() },
  handler: async (ctx, { guildId, entryId }) => {
    const id = ctx.db.normalizeId('rosterEntries', entryId);
    const doc = id && (await ctx.db.get(id));
    if (id && doc && doc.guildId === guildId) await ctx.db.delete(id);
  },
});
