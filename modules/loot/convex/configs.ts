// Component functions for loot method configs and state. Called only by apps/api via components.loot.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { methodConfigFields } from './schema';

const toConfig = (doc: Doc<'methodConfigs'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const get = query({
  args: { guildId: v.string(), methodId: v.string() },
  handler: async (ctx, { guildId, methodId }) => {
    const doc = await ctx.db
      .query('methodConfigs')
      .withIndex('by_guild_method', (q) => q.eq('guildId', guildId).eq('methodId', methodId))
      .first();
    return doc ? toConfig(doc) : null;
  },
});

export const list = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const docs = await ctx.db
      .query('methodConfigs')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .collect();
    return docs.map(toConfig);
  },
});

export const upsert = mutation({
  args: methodConfigFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('methodConfigs')
      .withIndex('by_guild_method', (q) =>
        q.eq('guildId', args.guildId).eq('methodId', args.methodId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      const updated = await ctx.db.get(existing._id);
      if (!updated) throw new Error('methodConfig disappeared after patch');
      return toConfig(updated);
    }
    const id = await ctx.db.insert('methodConfigs', args);
    const created = await ctx.db.get(id);
    if (!created) throw new Error('methodConfig disappeared after insert');
    return toConfig(created);
  },
});
