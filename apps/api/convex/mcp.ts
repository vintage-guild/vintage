// The /mcp caller (#9): turns an OAuth bearer token into the member it runs as, and serves the
// gateway's two MCP routes (src/mcp-gateway.ts): the tools that member may use, and one command
// run as them. The /mcp endpoint itself is apps/gateway, on AFD's stateless handler.
import { toManifest } from '@vintage/guild-kit';
import { v } from 'convex/values';
import {
  type McpCallerResult,
  mcpCaller,
  type StoredAccessToken,
  type StoredClient,
} from '../src/mcp-caller';
import { callFor, type McpCall, type McpTools, toolsFor } from '../src/mcp-gateway';
import { components } from './_generated/api';
import { internalMutation, internalQuery, type QueryCtx } from './_generated/server';
import { discordIdOfUser } from './auth';
import { GUILD_ID, registry, runCommandAs } from './commands';
import { identityStore } from './stores';

/** Resolve a bearer token against the OAuth provider's tables, then identity. */
const resolve = (ctx: QueryCtx, token: string | undefined): Promise<McpCallerResult> =>
  mcpCaller(GUILD_ID, token, {
    accessToken: async (hashed) =>
      (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'oauthAccessToken',
        where: [{ field: 'token', value: hashed }],
      })) as StoredAccessToken | null,
    client: async (clientId) =>
      (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'oauthClient',
        where: [{ field: 'clientId', value: clientId }],
      })) as StoredClient | null,
    discordIdOfUser: (userId) => discordIdOfUser(ctx, userId),
    memberByDiscordId: (discordId) => identityStore(ctx).getMemberByDiscordId(GUILD_ID, discordId),
    now: () => Date.now(),
  });

export const caller = internalQuery({
  args: { token: v.optional(v.string()) },
  handler: (ctx, { token }): Promise<McpCallerResult> => resolve(ctx, token),
});

/** The tools a token's member may use: their visible commands, as manifest entries. */
export const tools = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<McpTools> =>
    toolsFor(await resolve(ctx, token), (c) => toManifest(registry().visibleTo(c)).commands),
});

/**
 * One command as the token's member. The token is checked in the same transaction that runs the
 * command, so a revoked token can't slip between the check and the run.
 */
export const call = internalMutation({
  args: {
    token: v.string(),
    name: v.string(),
    input: v.any(),
    confirmToken: v.optional(v.string()),
  },
  handler: async (ctx, { token, name, input, confirmToken }): Promise<McpCall> =>
    callFor(
      await resolve(ctx, token),
      { name, input, ...(confirmToken ? { confirmToken } : {}) },
      (c, r) => runCommandAs(ctx, c, r.name, r.input, r.confirmToken),
    ),
});
