import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { entryFields } from './schema';

const toEntry = (doc: Doc<'entries'>) => ({
  id: String(doc._id),
  guildId: doc.guildId,
  characterId: doc.characterId,
  memberId: doc.memberId,
  itemId: doc.itemId,
  itemName: doc.itemName,
  rank: doc.rank,
  note: doc.note,
  updatedAt: doc.updatedAt,
  updatedBy: doc.updatedBy,
});

const byRankThenUpdated = (
  a: { rank: number; updatedAt: number; itemId: number },
  b: { rank: number; updatedAt: number; itemId: number },
) => a.rank - b.rank || a.updatedAt - b.updatedAt || a.itemId - b.itemId;

export const listByCharacter = query({
  args: { guildId: v.string(), characterId: v.string() },
  handler: async (ctx, { guildId, characterId }) => {
    const docs = await ctx.db
      .query('entries')
      .withIndex('by_guild_character', (q) =>
        q.eq('guildId', guildId).eq('characterId', characterId),
      )
      .collect();
    return docs.map(toEntry).sort(byRankThenUpdated);
  },
});

export const listByItem = query({
  args: { guildId: v.string(), itemId: v.number() },
  handler: async (ctx, { guildId, itemId }) => {
    const docs = await ctx.db
      .query('entries')
      .withIndex('by_guild_item', (q) => q.eq('guildId', guildId).eq('itemId', itemId))
      .collect();
    return docs.map(toEntry).sort(byRankThenUpdated);
  },
});

export const listAll = query({
  args: {
    guildId: v.string(),
    characterId: v.optional(v.string()),
    memberId: v.optional(v.string()),
    itemId: v.optional(v.number()),
  },
  handler: async (ctx, { guildId, characterId, memberId, itemId }) => {
    let docs: Doc<'entries'>[];
    if (characterId) {
      docs = await ctx.db
        .query('entries')
        .withIndex('by_guild_character', (q) =>
          q.eq('guildId', guildId).eq('characterId', characterId),
        )
        .collect();
    } else if (itemId !== undefined) {
      docs = await ctx.db
        .query('entries')
        .withIndex('by_guild_item', (q) => q.eq('guildId', guildId).eq('itemId', itemId))
        .collect();
    } else if (memberId) {
      docs = await ctx.db
        .query('entries')
        .withIndex('by_guild_member', (q) => q.eq('guildId', guildId).eq('memberId', memberId))
        .collect();
    } else {
      docs = await ctx.db
        .query('entries')
        .withIndex('by_guild', (q) => q.eq('guildId', guildId))
        .collect();
    }
    return docs
      .filter((d) => {
        if (characterId && d.characterId !== characterId) return false;
        if (memberId && d.memberId !== memberId) return false;
        if (itemId !== undefined && d.itemId !== itemId) return false;
        return true;
      })
      .map(toEntry)
      .sort(byRankThenUpdated);
  },
});

export const replaceForCharacter = mutation({
  args: {
    guildId: v.string(),
    characterId: v.string(),
    entries: v.array(v.object(entryFields)),
  },
  handler: async (ctx, { guildId, characterId, entries }) => {
    const existing = await ctx.db
      .query('entries')
      .withIndex('by_guild_character', (q) =>
        q.eq('guildId', guildId).eq('characterId', characterId),
      )
      .collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }
    const inserted = [];
    for (const entry of entries) {
      const id = await ctx.db.insert('entries', { ...entry, guildId, characterId });
      const doc = await ctx.db.get(id);
      if (doc) inserted.push(toEntry(doc));
    }
    return inserted.sort(byRankThenUpdated);
  },
});
