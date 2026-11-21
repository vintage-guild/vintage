// Component functions for absences. Called only by apps/api through `components.raids`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { absenceFields } from './schema';

const toAbsence = (doc: Doc<'absences'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const list = query({
  args: {
    guildId: v.string(),
    memberId: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, { guildId, memberId, activeOnly = true }) => {
    const docs = memberId
      ? await ctx.db
          .query('absences')
          .withIndex('by_guild_member', (q) => q.eq('guildId', guildId).eq('memberId', memberId))
          .collect()
      : await ctx.db
          .query('absences')
          .withIndex('by_guild', (q) => q.eq('guildId', guildId))
          .collect();
    const filtered = activeOnly ? docs.filter((d) => d.endedAt === null) : docs;
    return filtered.map(toAbsence);
  },
});

export const get = query({
  args: { guildId: v.string(), absenceId: v.string() },
  handler: async (ctx, { guildId, absenceId }) => {
    const id = ctx.db.normalizeId('absences', absenceId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toAbsence(doc) : null;
  },
});

export const insert = mutation({
  args: absenceFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('absences', args);
    return toAbsence((await ctx.db.get(id))!);
  },
});

export const end = mutation({
  args: { guildId: v.string(), absenceId: v.string(), endedAt: v.number() },
  handler: async (ctx, { guildId, absenceId, endedAt }) => {
    const id = ctx.db.normalizeId('absences', absenceId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('absence not found');
    await ctx.db.patch(doc._id, { endedAt });
    return toAbsence({ ...doc, endedAt });
  },
});
