// Discord sign-in for the website (#7, PLAN §3.4): Better Auth in its Convex component, Discord as
// the only provider. The site lives on another origin, so the cross-domain plugin carries the
// session; the convex plugin mints the token Convex checks, with the Discord id as a claim that
// commands.ts turns into the caller (src/web-caller.ts). Each sign-in syncs the member's roles.
//
// Environment (Convex, never the repo): BETTER_AUTH_SECRET, DISCORD_CLIENT_ID,
// DISCORD_CLIENT_SECRET, SITE_URL (the website origin), and optionally VINTAGE_TRUSTED_ORIGINS
// (more origins, comma-separated). Discord's redirect URI is <CONVEX_SITE_URL>/api/auth/callback/discord.
// A hosted deployment missing any of them refuses sign-in instead of falling back (src/auth-env.ts).
import { type AuthFunctions, createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import { v } from 'convex/values';
import { authEnv, authOrigins } from '../src/auth-env';
import { fetchGuildMember } from '../src/discord-directory';
import { type SignInSync, syncOnSignIn } from '../src/sign-in';
import { DISCORD_ID_CLAIM } from '../src/web-caller';
import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { internalAction, type MutationCtx } from './_generated/server';
import authConfig from './auth.config';

/** The website origins allowed to sign in: SITE_URL plus VINTAGE_TRUSTED_ORIGINS. */
export const siteOrigins = () => authOrigins(process.env);

/** A Discord account was linked or signed in again: sync the member right away. */
async function afterSignIn(ctx: MutationCtx, account: { providerId: string; accountId: string }) {
  if (account.providerId !== 'discord') return;
  await ctx.scheduler.runAfter(0, internal.auth.syncSignIn, { discordId: account.accountId });
}

// Typed up front: `internal.auth` includes the trigger functions made from authComponent below.
const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    account: {
      onCreate: afterSignIn,
      onUpdate: afterSignIn,
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

/** The Discord user id behind a Better Auth user, from their linked account. */
async function discordIdOfUser(ctx: GenericCtx<DataModel>, userId: string) {
  const account = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'account',
    where: [
      { field: 'userId', value: userId },
      { field: 'providerId', value: 'discord' },
    ],
  });
  return (account as { accountId?: string } | null)?.accountId ?? null;
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const env = authEnv(process.env);
  return betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    secret: env.secret,
    trustedOrigins: env.origins,
    database: authComponent.adapter(ctx),
    socialProviders: {
      discord: {
        clientId: env.discordClientId,
        clientSecret: env.discordClientSecret,
        // Only `identify`: roles come from the bot, and Vintage has no use for email. Better Auth
        // requires one, so each user gets a placeholder that can't receive mail.
        disableDefaultScope: true,
        scope: ['identify'],
        mapProfileToUser: (profile) => ({
          email: `${profile.id}@users.discord.invalid`,
          emailVerified: false,
        }),
      },
    },
    plugins: [
      crossDomain({ siteUrl: env.siteUrl }),
      convex({
        authConfig,
        jwt: {
          definePayload: async ({ user }) => ({
            [DISCORD_ID_CLAIM]: await discordIdOfUser(ctx, user.id),
          }),
        },
      }),
    ],
  });
};

/** Read the member from Discord with the bot and run `member-sync` (src/sign-in.ts). */
export const syncSignIn = internalAction({
  args: { discordId: v.string() },
  handler: async (ctx, { discordId }): Promise<SignInSync> => {
    const token = process.env.DISCORD_BOT_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!token || !guildId) {
      throw new Error('Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in the Convex environment');
    }
    return syncOnSignIn(discordId, {
      fetchMember: (id) => fetchGuildMember({ token, guildId }, id),
      syncMember: (input) => ctx.runMutation(internal.commands.syncMember, input),
    });
  },
});
