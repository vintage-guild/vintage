// Component functions for the coordinator's announcedState table (signup-improvements §4, row 9).
// Seeded when the T-24h digest posts; diffed on each tick to detect seat/Standby/signup changes.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

const roleValidator = v.union(
  v.literal('tank'),
  v.literal('healer'),
  v.literal('melee'),
  v.literal('ranged'),
  v.null(),
);

const statusValidator = v.union(
  v.literal('accepted'),
  v.literal('late'),
  v.literal('tentative'),
  v.literal('bench'),
  v.literal('declined'),
  v.null(),
);

const rosterValidator = v.union(
  v.literal('pending'),
  v.literal('rostered'),
  v.literal('benched'),
  v.null(),
);

const announcedRowValidator = v.object({
  guildId: v.string(),
  eventId: v.string(),
  memberId: v.string(),
  signupId: v.union(v.string(), v.null()),
  characterName: v.union(v.string(), v.null()),
  class: v.union(v.string(), v.null()),
  spec: v.union(v.string(), v.null()),
  role: roleValidator,
  status: statusValidator,
  lateMinutes: v.union(v.literal(5), v.literal(15), v.literal(30), v.null()),
  note: v.union(v.string(), v.null()),
  seated: v.boolean(),
  group: v.union(v.number(), v.null()),
  roster: rosterValidator,
  updatedAt: v.number(),
  updatedBy: v.union(v.string(), v.null()),
  absenceSummary: v.union(v.string(), v.null()),
  eventSize: v.optional(v.union(v.number(), v.null())),
  eventRoleTargets: v.optional(
    v.union(
      v.object({ tank: v.number(), healer: v.number(), melee: v.number(), ranged: v.number() }),
      v.object({ tank: v.number(), healer: v.number(), dps: v.number() }),
      v.null(),
    ),
  ),
  announcedAt: v.number(),
});

const toRow = (doc: Doc<'announcedState'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
};

export const listByEvents = query({
  args: {
    guildId: v.string(),
    eventIds: v.array(v.string()),
  },
  handler: async (ctx, { guildId, eventIds }) => {
    const docs = (
      await Promise.all(
        eventIds.map((eventId) =>
          ctx.db
            .query('announcedState')
            .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
            .collect(),
        ),
      )
    ).flat();
    return docs.map(toRow);
  },
});

export const upsertMany = mutation({
  args: {
    rows: v.array(announcedRowValidator),
  },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query('announcedState')
        .withIndex('by_key', (q) =>
          q.eq('guildId', row.guildId).eq('eventId', row.eventId).eq('memberId', row.memberId),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert('announcedState', row);
      }
    }
  },
});
