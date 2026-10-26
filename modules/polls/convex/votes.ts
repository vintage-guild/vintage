// Component functions for votes. Called only by apps/api through `components.polls`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { voteFields } from './schema';

const toVote = (doc: Doc<'votes'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

const forPoll = (ctx: QueryCtx, guildId: string, pollId: string) =>
  ctx.db
    .query('votes')
    .withIndex('by_guild_poll', (q) => q.eq('guildId', guildId).eq('pollId', pollId))
    .collect();

const memberVote = (ctx: QueryCtx, guildId: string, pollId: string, memberId: string) =>
  ctx.db
    .query('votes')
    .withIndex('by_guild_poll_member', (q) =>
      q.eq('guildId', guildId).eq('pollId', pollId).eq('memberId', memberId),
    )
    .first();

export const list = query({
  args: { guildId: v.string(), pollId: v.string() },
  handler: async (ctx, { guildId, pollId }) =>
    (await forPoll(ctx, guildId, pollId)).sort((a, b) => a.castAt - b.castAt).map(toVote),
});

export const count = query({
  args: { guildId: v.string(), pollId: v.string() },
  handler: async (ctx, { guildId, pollId }) => (await forPoll(ctx, guildId, pollId)).length,
});

export const byMember = query({
  args: { guildId: v.string(), pollId: v.string(), memberId: v.string() },
  handler: async (ctx, { guildId, pollId, memberId }) => {
    const doc = await memberVote(ctx, guildId, pollId, memberId);
    return doc ? toVote(doc) : null;
  },
});

/** One ballot per member per poll: refuses a second insert, like the memory store. */
export const insert = mutation({
  args: voteFields,
  handler: async (ctx, args) => {
    if (await memberVote(ctx, args.guildId, args.pollId, args.memberId)) {
      throw new Error('member already voted on this poll');
    }
    const id = await ctx.db.insert('votes', args);
    return toVote((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    guildId: v.string(),
    voteId: v.string(),
    patch: v.object({
      choices: v.optional(voteFields.choices),
      weight: v.optional(voteFields.weight),
      updatedAt: v.optional(voteFields.updatedAt),
    }),
  },
  handler: async (ctx, { guildId, voteId, patch }) => {
    const id = ctx.db.normalizeId('votes', voteId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('vote not found');
    await ctx.db.patch(doc._id, patch);
    return toVote({ ...doc, ...patch });
  },
});

export const remove = mutation({
  args: { guildId: v.string(), voteId: v.string() },
  handler: async (ctx, { guildId, voteId }) => {
    const id = ctx.db.normalizeId('votes', voteId);
    const doc = id ? await ctx.db.get(id) : null;
    if (doc && doc.guildId === guildId) await ctx.db.delete(doc._id);
  },
});
