// Component functions for Discord posts of a poll. Called only by apps/api through `components.polls`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { postFields } from './schema';

const toPost = (doc: Doc<'pollPosts'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const list = query({
  args: { guildId: v.string(), pollId: v.string() },
  handler: async (ctx, { guildId, pollId }) =>
    (
      await ctx.db
        .query('pollPosts')
        .withIndex('by_guild_poll', (q) => q.eq('guildId', guildId).eq('pollId', pollId))
        .collect()
    ).map(toPost),
});

export const insert = mutation({
  args: postFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('pollPosts', args);
    return toPost((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    guildId: v.string(),
    postId: v.string(),
    patch: v.object({ renderedKey: v.optional(postFields.renderedKey) }),
  },
  handler: async (ctx, { guildId, postId, patch }) => {
    const id = ctx.db.normalizeId('pollPosts', postId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('post not found');
    await ctx.db.patch(doc._id, patch);
    return toPost({ ...doc, ...patch });
  },
});
