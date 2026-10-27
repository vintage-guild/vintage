// Component functions for raid events. Called only by apps/api through `components.raids`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { eventFields, raidStatus } from './schema';

const toEvent = (doc: Doc<'raidEvents'>) => {
  const { _id, _creationTime, kind, ...rest } = doc;
  return { id: _id as string, ...rest, kind: kind ?? ('raid' as const) };
};

const { guildId: _guildId, ...patchable } = eventFields;
const eventPatch = v.object(patchable).partial();

export const list = query({
  args: {
    guildId: v.string(),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    scheduleId: v.optional(v.string()),
    statuses: v.optional(v.array(raidStatus)),
  },
  handler: async (ctx, { guildId, from, to, scheduleId, statuses }) => {
    const docs =
      scheduleId === undefined
        ? await ctx.db
            .query('raidEvents')
            .withIndex('by_guild_start', (q) => {
              const g = q.eq('guildId', guildId);
              const lower = from === undefined ? g : g.gte('startsAt', from);
              return to === undefined ? lower : lower.lt('startsAt', to);
            })
            .collect()
        : await ctx.db
            .query('raidEvents')
            .withIndex('by_guild_schedule_start', (q) => {
              const g = q.eq('guildId', guildId).eq('scheduleId', scheduleId);
              const lower = from === undefined ? g : g.gte('startsAt', from);
              return to === undefined ? lower : lower.lt('startsAt', to);
            })
            .collect();
    return docs.filter((d) => !statuses || statuses.includes(d.status)).map(toEvent);
  },
});

export const get = query({
  args: { guildId: v.string(), eventId: v.string() },
  handler: async (ctx, { guildId, eventId }) => {
    const id = ctx.db.normalizeId('raidEvents', eventId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toEvent(doc) : null;
  },
});

export const insert = mutation({
  args: eventFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('raidEvents', args);
    return toEvent((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: { guildId: v.string(), eventId: v.string(), patch: eventPatch },
  handler: async (ctx, { guildId, eventId, patch }) => {
    const id = ctx.db.normalizeId('raidEvents', eventId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('raid not found');
    await ctx.db.patch(doc._id, patch);
    return toEvent({ ...doc, ...patch });
  },
});
