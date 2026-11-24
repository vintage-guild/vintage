// Component functions for loot awards. Called only by apps/api via components.loot.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { awardFields } from './schema';

const toAward = (doc: Doc<'awards'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const list = query({
  args: {
    guildId: v.string(),
    eventId: v.optional(v.string()),
    characterId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { guildId, eventId, characterId, limit }) => {
    const cap = limit ?? 50;
    if (eventId) {
      const docs = await ctx.db
        .query('awards')
        .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
        .order('desc')
        .collect();
      const filtered = characterId ? docs.filter((d) => d.characterId === characterId) : docs;
      return filtered.slice(0, cap).map(toAward);
    }
    if (characterId) {
      const docs = await ctx.db
        .query('awards')
        .withIndex('by_guild_character', (q) =>
          q.eq('guildId', guildId).eq('characterId', characterId),
        )
        .order('desc')
        .take(cap);
      return docs.map(toAward);
    }
    const docs = await ctx.db
      .query('awards')
      .withIndex('by_guild_awarded', (q) => q.eq('guildId', guildId))
      .order('desc')
      .take(cap);
    return docs.map(toAward);
  },
});

export const insert = mutation({
  args: awardFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('awards', args);
    const created = await ctx.db.get(id);
    if (!created) throw new Error('award disappeared after insert');
    return toAward(created);
  },
});
