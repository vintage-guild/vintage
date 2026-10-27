// Component functions for schedules. Called only by apps/api through `components.raids`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { scheduleFields } from './schema';

const toSchedule = (doc: Doc<'schedules'>) => {
  const { _id, _creationTime, kind, ...rest } = doc;
  return { id: _id as string, ...rest, kind: kind ?? ('raid' as const) };
};

const { guildId: _guildId, ...patchable } = scheduleFields;
const schedulePatch = v.object(patchable).partial();

export const list = query({
  args: { guildId: v.string(), active: v.optional(v.boolean()) },
  handler: async (ctx, { guildId, active }) => {
    const docs = await ctx.db
      .query('schedules')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .collect();
    return docs
      .filter((d) => active === undefined || d.active === active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toSchedule);
  },
});

export const get = query({
  args: { guildId: v.string(), scheduleId: v.string() },
  handler: async (ctx, { guildId, scheduleId }) => {
    const id = ctx.db.normalizeId('schedules', scheduleId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toSchedule(doc) : null;
  },
});

export const insert = mutation({
  args: scheduleFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('schedules', args);
    return toSchedule((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: { guildId: v.string(), scheduleId: v.string(), patch: schedulePatch },
  handler: async (ctx, { guildId, scheduleId, patch }) => {
    const id = ctx.db.normalizeId('schedules', scheduleId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('schedule not found');
    await ctx.db.patch(doc._id, patch);
    return toSchedule({ ...doc, ...patch });
  },
});
