// Component functions for characters. Called only by apps/api through `components.identity`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { role } from './schema';

const toCharacter = (doc: Doc<'characters'>) => {
  const { _id, _creationTime, rolePicked, ...rest } = doc;
  return { id: _id as string, rolePicked: rolePicked ?? false, ...rest };
};

const byMainThenName = (a: Doc<'characters'>, b: Doc<'characters'>) =>
  Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name);

export const list = query({
  args: { guildId: v.string(), memberId: v.optional(v.string()) },
  handler: async (ctx, { guildId, memberId }) => {
    const docs = memberId
      ? await ctx.db
          .query('characters')
          .withIndex('by_guild_member', (q) => q.eq('guildId', guildId).eq('memberId', memberId))
          .collect()
      : await ctx.db
          .query('characters')
          .withIndex('by_guild', (q) => q.eq('guildId', guildId))
          .collect();
    return docs.sort(byMainThenName).map(toCharacter);
  },
});

export const get = query({
  args: { guildId: v.string(), characterId: v.string() },
  handler: async (ctx, { guildId, characterId }) => {
    const id = ctx.db.normalizeId('characters', characterId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toCharacter(doc) : null;
  },
});

export const insert = mutation({
  args: {
    guildId: v.string(),
    memberId: v.string(),
    name: v.string(),
    class: v.string(),
    spec: v.string(),
    role,
    rolePicked: v.optional(v.boolean()),
    isMain: v.boolean(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('characters', args);
    return toCharacter((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    guildId: v.string(),
    characterId: v.string(),
    patch: v.object({
      name: v.optional(v.string()),
      class: v.optional(v.string()),
      spec: v.optional(v.string()),
      role: v.optional(role),
      rolePicked: v.optional(v.boolean()),
      isMain: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { guildId, characterId, patch }) => {
    const id = ctx.db.normalizeId('characters', characterId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('character not found');
    await ctx.db.patch(doc._id, patch);
    return toCharacter({ ...doc, ...patch });
  },
});

export const remove = mutation({
  args: { guildId: v.string(), characterId: v.string() },
  handler: async (ctx, { guildId, characterId }) => {
    const id = ctx.db.normalizeId('characters', characterId);
    const doc = id ? await ctx.db.get(id) : null;
    if (doc && doc.guildId === guildId) await ctx.db.delete(doc._id);
  },
});
