// Component functions for recorded exports and attendance. Called only by apps/api through
// `components.raids`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { attendanceFields, recordFields } from './schema';

const toRecord = (doc: Doc<'raidRecords'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

const toAttendance = (doc: Doc<'attendance'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

const { guildId: _g, eventId: _e, ...personFields } = attendanceFields;

export const get = query({
  args: { guildId: v.string(), eventId: v.string() },
  handler: async (ctx, { guildId, eventId }) => {
    const doc = await ctx.db
      .query('raidRecords')
      .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
      .first();
    return doc ? toRecord(doc) : null;
  },
});

export const attendance = query({
  args: { guildId: v.string(), eventId: v.string() },
  handler: async (ctx, { guildId, eventId }) => {
    const docs = await ctx.db
      .query('attendance')
      .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
      .collect();
    return docs.sort((a, b) => a.name.localeCompare(b.name)).map(toAttendance);
  },
});

/** Records an export for a raid in one transaction, replacing any earlier record. */
export const put = mutation({
  args: { record: v.object(recordFields), attendance: v.array(v.object(personFields)) },
  handler: async (ctx, { record, attendance }) => {
    const { guildId, eventId } = record;
    const records = await ctx.db
      .query('raidRecords')
      .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
      .collect();
    const people = await ctx.db
      .query('attendance')
      .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
      .collect();
    for (const doc of [...records, ...people]) await ctx.db.delete(doc._id);
    for (const person of attendance) {
      await ctx.db.insert('attendance', { ...person, guildId, eventId });
    }
    const id = await ctx.db.insert('raidRecords', record);
    return toRecord((await ctx.db.get(id))!);
  },
});
