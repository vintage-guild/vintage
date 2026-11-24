// Poll posts in Discord (#62): put a poll's post up, and re-render it when what it shows changes.
// Rendering lives in @vintage/polls (renderPollPost, renderKey); this file loads the data, calls
// the Discord REST API, and records where each post is. Without DISCORD_BOT_TOKEN it does nothing.
//   npx convex run pollPosts:refresh '{"pollId":"…"}'

import { createDiscordRest } from '@vintage/discord-kit';
import {
  buildPollCard,
  buildSurveyCard,
  renderKey,
  renderPollPost,
  renderSurveyInvite,
  surveyRenderKey,
} from '@vintage/polls/commands';
import { v } from 'convex/values';
import { runPollRefreshWithAlerts } from '../src/ops-alerts';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { GUILD_ID } from './commands';
import { reportCronFailure } from './opsAlerts';
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
  handler: async (
    ctx,
    { pollId },
  ): Promise<{ edited: number } | { skipped: string } | { failed: string }> =>
    runPollRefreshWithAlerts(
      pollId,
      async () => {
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
      (alert, at) => reportCronFailure(ctx, alert, at),
    ),
});

const surveyUrl = (surveyId: string) => {
  const site = process.env.VINTAGE_SITE_URL;
  return site ? `${site.replace(/\/$/, '')}/surveys/${surveyId}` : null;
};

/** Survey invite embed, key, and recorded Discord posts (#65). */
export const surveyCard = internalQuery({
  args: { surveyId: v.string() },
  handler: async (ctx, { surveyId }) => {
    const store = pollsStore(ctx);
    const survey = await store.getSurvey(GUILD_ID, surveyId);
    if (!survey) return null;
    const [responses, members, posts] = await Promise.all([
      store.listSurveyResponses(GUILD_ID, surveyId),
      identityStore(ctx).listMembers(GUILD_ID),
      store.listSurveyPosts(GUILD_ID, surveyId),
    ]);
    const built = buildSurveyCard(survey, responses, members, surveyUrl(surveyId));
    return { message: renderSurveyInvite(built), key: surveyRenderKey(built), posts };
  },
});

export const recordSurveyPost = internalMutation({
  args: {
    surveyId: v.string(),
    channelId: v.string(),
    messageId: v.string(),
    renderedKey: v.string(),
  },
  handler: (ctx, args) => pollsStore(ctx).insertSurveyPost({ guildId: GUILD_ID, ...args }),
});

export const setSurveyRenderedKey = internalMutation({
  args: { postId: v.string(), renderedKey: v.string() },
  handler: (ctx, { postId, renderedKey }) =>
    pollsStore(ctx).updateSurveyPost(GUILD_ID, postId, { renderedKey }),
});

/** Post a survey invite embed with link button and responded count (#65). */
export const postSurvey = internalAction({
  args: { surveyId: v.string(), channelId: v.string() },
  handler: async (ctx, { surveyId, channelId }) => {
    const discord = rest();
    if (!discord) return { skipped: 'DISCORD_BOT_TOKEN is not set' };
    const now = await ctx.runQuery(internal.pollPosts.surveyCard, { surveyId });
    if (!now) return { skipped: 'no such survey' };
    const message = (await discord.createMessage(channelId, now.message)) as { id: string };
    await ctx.runMutation(internal.pollPosts.recordSurveyPost, {
      surveyId,
      channelId,
      messageId: message.id,
      renderedKey: now.key,
    });
    return { posted: message.id };
  },
});

/** Refresh every Discord invite post for a survey when its responded count or status changed (#65). */
export const refreshSurvey = internalAction({
  args: { surveyId: v.string() },
  handler: async (
    ctx,
    { surveyId },
  ): Promise<{ edited: number } | { skipped: string } | { failed: string }> =>
    runPollRefreshWithAlerts(
      `survey:${surveyId}`,
      async () => {
        const discord = rest();
        if (!discord) return { skipped: 'DISCORD_BOT_TOKEN is not set' };
        const now = await ctx.runQuery(internal.pollPosts.surveyCard, { surveyId });
        if (!now) return { skipped: 'no such survey' };
        let edited = 0;
        for (const p of now.posts) {
          if (p.renderedKey === now.key) continue;
          await discord.request('PATCH', `/channels/${p.channelId}/messages/${p.messageId}`, {
            body: now.message,
          });
          await ctx.runMutation(internal.pollPosts.setSurveyRenderedKey, {
            postId: p.id,
            renderedKey: now.key,
          });
          edited++;
        }
        return { edited };
      },
      (alert, at) => reportCronFailure(ctx, alert, at),
    ),
});
