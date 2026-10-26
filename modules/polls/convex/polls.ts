// Component functions for polls. Called only by apps/api through `components.polls`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { pollFields, pollStatus } from './schema';

const toPoll = (doc: Doc<'polls'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

const { guildId: _g, ...patchable } = pollFields;
const pollPatch = v.object(patchable).partial();

/** Same order as the memory store: soonest close first, open-ended last, then oldest. */
const byCloseThenCreated = (a: Doc<'polls'>, b: Doc<'polls'>) =>
  (a.closesAt ?? Number.POSITIVE_INFINITY) - (b.closesAt ?? Number.POSITIVE_INFINITY) ||
  a.createdAt - b.createdAt;

export const list = query({
  args: {
    guildId: v.string(),
    statuses: v.optional(v.array(pollStatus)),
    tag: v.optional(v.string()),
    closesBy: v.optional(v.number()),
  },
  handler: async (ctx, { guildId, statuses, tag, closesBy }) => {
    const docs = statuses
      ? (
          await Promise.all(
            [...new Set(statuses)].map((status) =>
              ctx.db
                .query('polls')
                .withIndex('by_guild_status', (q) => q.eq('guildId', guildId).eq('status', status))
                .collect(),
            ),
          )
        ).flat()
      : await ctx.db
          .query('polls')
          .withIndex('by_guild', (q) => q.eq('guildId', guildId))
          .collect();
    return docs
      .filter(
        (p) =>
          (tag === undefined || p.tags.includes(tag)) &&
          (closesBy === undefined || (p.closesAt !== null && p.closesAt <= closesBy)),
      )
      .sort(byCloseThenCreated)
      .map(toPoll);
  },
});

export const get = query({
  args: { guildId: v.string(), pollId: v.string() },
  handler: async (ctx, { guildId, pollId }) => {
    const id = ctx.db.normalizeId('polls', pollId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toPoll(doc) : null;
  },
});

export const insert = mutation({
  args: pollFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('polls', args);
    return toPoll((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: { guildId: v.string(), pollId: v.string(), patch: pollPatch },
  handler: async (ctx, { guildId, pollId, patch }) => {
    const id = ctx.db.normalizeId('polls', pollId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('poll not found');
    await ctx.db.patch(doc._id, patch);
    return toPoll({ ...doc, ...patch });
  },
});
