// Component functions for drops. Called only by apps/api through `components.loot`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { dropFields } from './schema';

const toDrop = (doc: Doc<'drops'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

const { guildId: _g, eventId: _e, ...inputFields } = dropFields;

export const list = query({
  args: { guildId: v.string(), eventId: v.string() },
  handler: async (ctx, { guildId, eventId }) => {
    const docs = await ctx.db
      .query('drops')
      .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
      .collect();
    return docs.map(toDrop);
  },
});

/** Replaces a raid's drops in one transaction, so a re-recorded export never doubles them. */
export const replace = mutation({
  args: { guildId: v.string(), eventId: v.string(), drops: v.array(v.object(inputFields)) },
  handler: async (ctx, { guildId, eventId, drops }) => {
    const old = await ctx.db
      .query('drops')
      .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
      .collect();
    for (const doc of old) await ctx.db.delete(doc._id);
    for (const drop of drops) await ctx.db.insert('drops', { ...drop, guildId, eventId });
    const docs = await ctx.db
      .query('drops')
      .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
      .collect();
    return docs.map(toDrop);
  },
});
