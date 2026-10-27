// Applications outside the command's transaction (#134, #135): label a new application with the
// Decisions API and post it for officers; refresh the post when it changes; DM the officers'
// reply; onboard an accepted applicant once role sync has promoted them (src/onboarding.ts), with
// the onboarding DM. Each runs as a scheduled function from the module's ApplicationEffects port
// (stores.ts). The bot never sets roles: an officer gives the recruit role. Without
// DISCORD_BOT_TOKEN the Discord parts do nothing; without OPENAI_API_KEY it posts unlabeled.
//   npx convex run applications:afterSubmit '{"applicationId":"…"}'

import {
  labelApplication,
  renderApplicantDm,
  renderApplicationPost,
  renderOnboardingDm,
} from '@vintage/applications/commands';
import type { Application, ApplicationLabels } from '@vintage/applications/contract';
import { createDiscordRest, DiscordRestError, type MessageData } from '@vintage/discord-kit';
import { STARTER_RECRUITING } from '@vintage/site/contract';
import { v } from 'convex/values';
import { onboardIfPromoted as onboardIfMember } from '../src/onboarding';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { GUILD_ID, runSystemCommand } from './commands';
import { decisionsFor } from './decisions';
import { applicationsStore, identityStore, siteStore } from './stores';

function rest() {
  const token = process.env.DISCORD_BOT_TOKEN;
  return token ? createDiscordRest({ token }) : null;
}

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const load = internalQuery({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }) => {
    const store = applicationsStore(ctx);
    const application = await store.get(GUILD_ID, applicationId);
    if (!application) return null;
    const [config, recruiting] = await Promise.all([
      store.getConfig(GUILD_ID),
      siteStore(ctx).getRecruiting(GUILD_ID),
    ]);
    // Until an officer saves the band, the site shows the starter needs; label against the same.
    return { application, config, needs: recruiting?.needs ?? STARTER_RECRUITING.needs };
  },
});

const labelsArg = v.object({
  role: v.union(v.literal('raider'), v.literal('flex-raider'), v.literal('social'), v.null()),
  complete: v.union(v.boolean(), v.null()),
  fit: v.union(v.number(), v.null()),
  labeledAt: v.number(),
});

export const saveLabels = internalMutation({
  args: { applicationId: v.string(), labels: labelsArg },
  handler: (ctx, { applicationId, labels }) =>
    applicationsStore(ctx).update(GUILD_ID, applicationId, { labels }),
});

export const savePost = internalMutation({
  args: { applicationId: v.string(), channelId: v.string(), messageId: v.string() },
  handler: (ctx, { applicationId, channelId, messageId }) =>
    applicationsStore(ctx).update(GUILD_ID, applicationId, {
      postChannelId: channelId,
      postMessageId: messageId,
    }),
});

/** Label, then post for officers. Safe to repeat: an application already posted is edited. */
export const afterSubmit = internalAction({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }): Promise<string> => {
    const loaded = await ctx.runQuery(internal.applications.load, { applicationId });
    if (!loaded) return 'missing';
    let application = loaded.application;
    if (!application.labels) {
      const labels: ApplicationLabels | null = await labelApplication(
        decisionsFor(ctx, 'application-triage'),
        application,
        loaded.needs,
        Date.now(),
      );
      if (labels) {
        application = await ctx.runMutation(internal.applications.saveLabels, {
          applicationId,
          labels,
        });
      }
    }
    const discord = rest();
    const channelId = loaded.config.channelId;
    if (!discord || !channelId) return application.labels ? 'labeled' : 'saved';
    if (application.postMessageId) return editPost(application);
    const sent = (await discord.createMessage(channelId, renderApplicationPost(application))) as {
      id: string;
    };
    await ctx.runMutation(internal.applications.savePost, {
      applicationId,
      channelId,
      messageId: sent.id,
    });
    return 'posted';
  },
});

/** Edit an application's review post to show it as it is now. */
async function editPost(app: Application): Promise<string> {
  const discord = rest();
  if (!discord || !app.postChannelId || !app.postMessageId) return 'nothing to refresh';
  try {
    await discord.request('PATCH', `/channels/${app.postChannelId}/messages/${app.postMessageId}`, {
      body: renderApplicationPost(app),
    });
    return 'edited';
  } catch (err) {
    console.log(`application ${app.id}: could not edit the post: ${describe(err)}`);
    return 'failed';
  }
}

/** Re-render the review post after a change (accepted, declined, replied, withdrawn). */
export const refreshPost = internalAction({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }): Promise<string> => {
    const loaded = await ctx.runQuery(internal.applications.load, { applicationId });
    return loaded ? editPost(loaded.application) : 'missing';
  },
});

async function dm(discordUserId: string, message: MessageData) {
  const discord = rest();
  if (!discord) return 'no bot token';
  try {
    const channel = (await discord.request('POST', '/users/@me/channels', {
      body: { recipient_id: discordUserId },
    })) as { id: string };
    await discord.createMessage(channel.id, message);
    return 'sent';
  } catch (err) {
    // 50007: they don't accept DMs from this server. A reply still shows on their application.
    if (err instanceof DiscordRestError && err.code === 50007) return 'DMs closed';
    throw err;
  }
}

/** DM the officers' reply. */
export const sendReply = internalAction({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }): Promise<string> => {
    const loaded = await ctx.runQuery(internal.applications.load, { applicationId });
    const app = loaded?.application;
    if (!app?.reply) return 'no reply';
    return dm(
      app.discordId,
      renderApplicantDm(`About your application to Vintage:\n\n${app.reply}`),
    );
  },
});

/**
 * After an accept: if the applicant already holds recruit or above (an officer gave the role
 * first), onboard them now; otherwise role sync does it when it promotes them (commands.ts).
 */
export const onboardIfPromoted = internalMutation({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }) => {
    const app = await applicationsStore(ctx).get(GUILD_ID, applicationId);
    if (!app) return null;
    const member = await identityStore(ctx).getMemberByDiscordId(GUILD_ID, app.discordId);
    return onboardIfMember(member, (name, input) => runSystemCommand(ctx, name, input));
  },
});

/** The onboarding DM, once `application-onboard` has marked the application. */
export const sendOnboarding = internalAction({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }): Promise<string> => {
    const loaded = await ctx.runQuery(internal.applications.load, { applicationId });
    if (!loaded) return 'missing';
    const message = renderOnboardingDm(
      loaded.config.onboarding,
      process.env.VINTAGE_SITE_URL ?? null,
    );
    return dm(loaded.application.discordId, message);
  },
});
