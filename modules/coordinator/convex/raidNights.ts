// Component functions for raid-night polls (#64). Called only by apps/api through
// `components.coordinator`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { raidNightFields, raidNightOutcome } from './schema';

const toRaidNight = (doc: Doc<'raidNights'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

/** Oldest first, like the memory store. */
export const list = query({
  args: { guildId: v.string(), outcome: v.optional(raidNightOutcome) },
  handler: async (ctx, { guildId, outcome }) => {
    const docs = outcome
      ? await ctx.db
          .query('raidNights')
          .withIndex('by_guild_outcome', (q) => q.eq('guildId', guildId).eq('outcome', outcome))
          .collect()
      : await ctx.db
          .query('raidNights')
          .withIndex('by_guild_outcome', (q) => q.eq('guildId', guildId))
          .collect();
    return docs.sort((a, b) => a.createdAt - b.createdAt).map(toRaidNight);
  },
});

export const insert = mutation({
  args: raidNightFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('raidNights', args);
    return toRaidNight((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    guildId: v.string(),
    raidNightId: v.string(),
    patch: v.object({
      outcome: v.optional(raidNightOutcome),
      raidEventId: v.optional(raidNightFields.raidEventId),
      detail: v.optional(raidNightFields.detail),
    }),
  },
  handler: async (ctx, { guildId, raidNightId, patch }) => {
    const id = ctx.db.normalizeId('raidNights', raidNightId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('raid night not found');
    await ctx.db.patch(doc._id, patch);
    return toRaidNight({ ...doc, ...patch });
  },
});
