// Applications outside the command's transaction (#134, #135): label a new application with the
// Decisions API and post it for officers; refresh the post when it changes; give an accepted
// applicant the recruit role and the onboarding DM; DM the officers' reply. Each runs as a
// scheduled action from the module's ApplicationEffects port (stores.ts). Without
// DISCORD_BOT_TOKEN the Discord parts do nothing; without OPENAI_API_KEY it posts unlabeled.
//   npx convex run applications:afterSubmit '{"applicationId":"…"}'

import {
  labelApplication,
  renderApplicantDm,
  renderApplicationPost,
} from '@vintage/applications/commands';
import type { Application, ApplicationLabels } from '@vintage/applications/contract';
import { createDiscordRest, DiscordRestError } from '@vintage/discord-kit';
import { STARTER_RECRUITING } from '@vintage/site/contract';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { GUILD_ID } from './commands';
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

async function dm(discordUserId: string, text: string) {
  const discord = rest();
  if (!discord) return 'no bot token';
  try {
    const channel = (await discord.request('POST', '/users/@me/channels', {
      body: { recipient_id: discordUserId },
    })) as { id: string };
    await discord.createMessage(channel.id, renderApplicantDm(text));
    return 'sent';
  } catch (err) {
    // 50007: they don't accept DMs from this server. The reply still shows on their application.
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
    return dm(app.discordId, `About your application to Vintage:\n\n${app.reply}`);
  },
});

/** Which Discord role officers give an accepted applicant: the one mapped to the recruit rank. */
export const recruitRole = internalQuery({
  args: {},
  handler: async (ctx) => {
    const map = await identityStore(ctx).getRoleRankMap(GUILD_ID);
    return Object.entries(map).find(([, rank]) => rank === 'recruit')?.[0] ?? null;
  },
});

/**
 * An accepted applicant gets the onboarding DM, and the recruitment channel gets a note asking an
 * officer to give them the recruit role in Discord. The bot never holds Manage Roles
 * (vintage-discord skill): officers set roles, and role sync makes them a recruit here.
 */
export const afterAccept = internalAction({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }): Promise<string> => {
    const loaded = await ctx.runQuery(internal.applications.load, { applicationId });
    const discord = rest();
    const app = loaded?.application;
    if (!app || !loaded || !discord) return 'skipped: no bot';
    const site = process.env.VINTAGE_SITE_URL ?? 'the Vintage website';
    let onboarding: string;
    try {
      onboarding = await dm(app.discordId, loaded.config.onboarding.replaceAll('{site}', site));
    } catch (err) {
      onboarding = `failed (${describe(err)})`;
    }
    const roleId = await ctx.runQuery(internal.applications.recruitRole, {});
    const role = roleId
      ? `<@&${roleId}>`
      : 'the recruit role (none is mapped yet: guild-roles-set)';
    const dmNote =
      onboarding === 'sent' ? 'They have the onboarding DM.' : `Onboarding DM: ${onboarding}.`;
    if (app.postChannelId) {
      await discord
        .createMessage(app.postChannelId, {
          content: `Accepted ${app.characterName} (<@${app.discordId}>). An officer gives them ${role} in Discord; role sync does the rest. ${dmNote}`,
          allowed_mentions: { parse: [] },
        })
        .catch(() => undefined);
    }
    return `onboarding ${onboarding}`;
  },
});
