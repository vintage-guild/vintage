// Component functions for kills. Called only by apps/api through `components.progress`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { killFields, raidId } from './schema';

const toKill = (doc: Doc<'kills'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const list = query({
  args: { guildId: v.string(), raidId: v.optional(raidId) },
  handler: async (ctx, { guildId, raidId }) => {
    const docs =
      raidId === undefined
        ? await ctx.db
            .query('kills')
            .withIndex('by_guild_killed', (q) => q.eq('guildId', guildId))
            .collect()
        : await ctx.db
            .query('kills')
            .withIndex('by_guild_raid_killed', (q) => q.eq('guildId', guildId).eq('raidId', raidId))
            .collect();
    // The index orders by killedAt; ties go to the earlier record.
    return docs.sort((a, b) => a.killedAt - b.killedAt || a.recordedAt - b.recordedAt).map(toKill);
  },
});

export const insert = mutation({
  args: killFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('kills', args);
    return toKill((await ctx.db.get(id))!);
  },
});
