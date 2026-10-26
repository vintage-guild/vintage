// Poll posts in Discord (#62): put a poll's post up, and re-render it when what it shows changes.
// Rendering lives in @vintage/polls (renderPollPost, renderKey); this file loads the data, calls
// the Discord REST API, and records where each post is. Without DISCORD_BOT_TOKEN it does nothing.
//   npx convex run pollPosts:refresh '{"pollId":"…"}'

import { createDiscordRest } from '@vintage/discord-kit';
import { buildPollCard, renderKey, renderPollPost } from '@vintage/polls/commands';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { GUILD_ID } from './commands';
import { identityStore, pollsStore } from './stores';

/** Debounce: votes in quick succession share one edit. */
export const REFRESH_DELAY_MS = 3000;

/** The website's poll page, once the site has one (#63). */
const pollUrl = (pollId: string) => {
  const site = process.env.VINTAGE_SITE_URL;
  return site ? `${site.replace(/\/$/, '')}/polls/${pollId}` : null;
};

/** What the post should show now, with its key and where it is posted. */
export const card = internalQuery({
  args: { pollId: v.string() },
  handler: async (ctx, { pollId }) => {
    const store = pollsStore(ctx);
    const poll = await store.getPoll(GUILD_ID, pollId);
    if (!poll) return null;
    const [votes, members, posts] = await Promise.all([
      store.listVotes(GUILD_ID, pollId),
      identityStore(ctx).listMembers(GUILD_ID),
      store.listPosts(GUILD_ID, pollId),
    ]);
    const built = buildPollCard(poll, votes, members, pollUrl(pollId));
    return { message: renderPollPost(built), key: renderKey(built), posts };
  },
});

export const recordPost = internalMutation({
  args: {
    pollId: v.string(),
    channelId: v.string(),
    messageId: v.string(),
    renderedKey: v.string(),
  },
  handler: (ctx, args) => pollsStore(ctx).insertPost({ guildId: GUILD_ID, ...args }),
});

export const setRenderedKey = internalMutation({
  args: { postId: v.string(), renderedKey: v.string() },
  handler: (ctx, { postId, renderedKey }) =>
    pollsStore(ctx).updatePost(GUILD_ID, postId, { renderedKey }),
});

function rest() {
  const token = process.env.DISCORD_BOT_TOKEN;
  return token ? createDiscordRest({ token }) : null;
}

/** Post a poll to a channel and remember the message, so later changes edit it in place. */
export const post = internalAction({
  args: { pollId: v.string(), channelId: v.string() },
  handler: async (ctx, { pollId, channelId }) => {
    const discord = rest();
    if (!discord) return { skipped: 'DISCORD_BOT_TOKEN is not set' };
    const now = await ctx.runQuery(internal.pollPosts.card, { pollId });
    if (!now) return { skipped: 'no such poll' };
    const message = (await discord.createMessage(channelId, now.message)) as { id: string };
    await ctx.runMutation(internal.pollPosts.recordPost, {
      pollId,
      channelId,
      messageId: message.id,
      renderedKey: now.key,
    });
    return { posted: message.id };
  },
});

/** Edit every post of a poll whose rendered key is out of date. A no-op when nothing changed. */
export const refresh = internalAction({
  args: { pollId: v.string() },
  handler: async (ctx, { pollId }) => {
    const discord = rest();
    if (!discord) return { skipped: 'DISCORD_BOT_TOKEN is not set' };
    const now = await ctx.runQuery(internal.pollPosts.card, { pollId });
    if (!now) return { skipped: 'no such poll' };
    let edited = 0;
    for (const p of now.posts) {
      if (p.renderedKey === now.key) continue;
      await discord.request('PATCH', `/channels/${p.channelId}/messages/${p.messageId}`, {
        body: now.message,
      });
      await ctx.runMutation(internal.pollPosts.setRenderedKey, {
        postId: p.id,
        renderedKey: now.key,
      });
      edited++;
    }
    return { edited };
  },
});
