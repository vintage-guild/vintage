// Discord sign-in for the website (#7, PLAN §3.4): Better Auth in its Convex component, Discord as
// the only provider. The site lives on another origin, so the cross-domain plugin carries the
// session; the convex plugin mints the token Convex checks, with the Discord id as a claim that
// commands.ts turns into the caller (src/web-caller.ts). Each sign-in syncs the member's roles.
//
// Better Auth also serves OAuth 2.1 for MCP clients (#9): see the oauthProvider plugin below.
//
// Environment (Convex, never the repo): BETTER_AUTH_SECRET, DISCORD_CLIENT_ID,
// DISCORD_CLIENT_SECRET, SITE_URL (the website origin), and optionally VINTAGE_TRUSTED_ORIGINS
// (more origins, comma-separated) and VINTAGE_MCP_URL (the /mcp endpoint). Discord's redirect URI
// is <CONVEX_SITE_URL>/api/auth/callback/discord.
//
// The Better Auth component is installed locally (convex/betterAuth): after changing options that
// add tables, run `pnpm --filter @vintage/api auth:schema`.

import { type AuthFunctions, createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { v } from 'convex/values';
import { fetchGuildMember } from '../src/discord-directory';
import { oauthBeforeHook, oauthPlugins, oauthServerOptions } from '../src/oauth-server';
import { type SignInSync, syncOnSignIn } from '../src/sign-in';
import { DISCORD_ID_CLAIM } from '../src/web-caller';
import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { internalAction, type MutationCtx } from './_generated/server';
import authConfig from './auth.config';
import authSchema from './betterAuth/schema';

/** The OAuth server's settings from the Convex env, built the same way the tests build them. */
const oauthOptions = () => oauthServerOptions(process.env);
const siteUrl = () => oauthOptions().siteUrl;

/** The /mcp endpoint, the only audience OAuth tokens may be issued for. */
export const mcpUrl = () => oauthOptions().mcpUrl;

/** The website origins allowed to sign in: SITE_URL plus VINTAGE_TRUSTED_ORIGINS. */
export const siteOrigins = () => oauthOptions().siteOrigins;

/** A Discord account was linked or signed in again: sync the member right away. */
async function afterSignIn(ctx: MutationCtx, account: { providerId: string; accountId: string }) {
  if (account.providerId !== 'discord') return;
  await ctx.scheduler.runAfter(0, internal.auth.syncSignIn, { discordId: account.accountId });
}

// Typed up front: `internal.auth` includes the trigger functions made from authComponent below.
const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: { schema: authSchema },
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
export async function discordIdOfUser(ctx: GenericCtx<DataModel>, userId: string) {
  const account = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: 'account',
    where: [
      { field: 'userId', value: userId },
      { field: 'providerId', value: 'discord' },
    ],
  });
  return (account as { accountId?: string } | null)?.accountId ?? null;
}

/**
 * The Better Auth options, separate from `createAuth` so the locally installed component
 * (betterAuth/adapter.ts) and schema generation (scripts/auth-schema.ts) can read them without
 * starting Better Auth.
 */
export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    baseURL: process.env.CONVEX_SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    // Guards for the OAuth server (src/oauth-server.ts): sign-in never carries an authorization,
    // and only /mcp may be requested.
    hooks: { before: oauthBeforeHook(oauthOptions()) },
    trustedOrigins: siteOrigins(),
    database: authComponent.adapter(ctx),
    socialProviders: {
      discord: {
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
        clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
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
      // OAuth 2.1 for MCP clients (#9), then the callback guard. Order matters: both must come
      // before crossDomain, whose callback hook appends the session's one-time token.
      ...oauthPlugins(oauthOptions()),
      crossDomain({ siteUrl: siteUrl() }),
      convex({
        authConfig,
        jwt: {
          definePayload: async ({ user }) => ({
            [DISCORD_ID_CLAIM]: await discordIdOfUser(ctx, user.id),
          }),
        },
      }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));

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
