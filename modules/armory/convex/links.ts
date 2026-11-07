// Component functions for armory links. Called only by apps/api through `components.armory`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { linkFields, linkPatchFields } from './schema';

/** Any subset of the patchable fields. */
const patchValidator = v.object(
  Object.fromEntries(
    Object.entries(linkPatchFields).map(([key, validator]) => [key, v.optional(validator)]),
  ) as {
    [K in keyof typeof linkPatchFields]: ReturnType<typeof v.optional<(typeof linkPatchFields)[K]>>;
  },
);

const toLink = (doc: Doc<'links'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const list = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) =>
    (
      await ctx.db
        .query('links')
        .withIndex('by_guild_name', (q) => q.eq('guildId', guildId))
        .collect()
    ).map(toLink),
});

export const get = query({
  args: { guildId: v.string(), linkId: v.string() },
  handler: async (ctx, { guildId, linkId }) => {
    const id = ctx.db.normalizeId('links', linkId);
    const doc = id && (await ctx.db.get(id));
    return doc && doc.guildId === guildId ? toLink(doc) : null;
  },
});

export const byCharacter = query({
  args: { guildId: v.string(), characterId: v.string() },
  handler: async (ctx, { guildId, characterId }) => {
    const doc = await ctx.db
      .query('links')
      .withIndex('by_guild_character', (q) =>
        q.eq('guildId', guildId).eq('characterId', characterId),
      )
      .first();
    return doc && toLink(doc);
  },
});

export const bySlug = query({
  args: { guildId: v.string(), slug: v.string() },
  handler: async (ctx, { guildId, slug }) => {
    const doc = await ctx.db
      .query('links')
      .withIndex('by_guild_slug', (q) => q.eq('guildId', guildId).eq('slug', slug))
      .first();
    return doc && toLink(doc);
  },
});

export const insert = mutation({
  args: linkFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('links', args);
    return toLink((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: { guildId: v.string(), linkId: v.string(), patch: patchValidator },
  handler: async (ctx, { guildId, linkId, patch }) => {
    const id = ctx.db.normalizeId('links', linkId);
    const doc = id && (await ctx.db.get(id));
    if (!id || !doc || doc.guildId !== guildId) throw new Error(`No armory link ${linkId}`);
    await ctx.db.patch(id, patch);
    return toLink((await ctx.db.get(id))!);
  },
});

export const remove = mutation({
  args: { guildId: v.string(), linkId: v.string() },
  handler: async (ctx, { guildId, linkId }) => {
    const id = ctx.db.normalizeId('links', linkId);
    const doc = id && (await ctx.db.get(id));
    if (id && doc && doc.guildId === guildId) await ctx.db.delete(id);
  },
});
