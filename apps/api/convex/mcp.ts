// The /mcp caller (#9): turns an OAuth bearer token into the member it runs as. The /mcp
// endpoint itself arrives with AFD 2.2's stateless handler; this is the part it will call.
import { v } from 'convex/values';
import {
  type McpCallerResult,
  mcpCaller,
  type StoredAccessToken,
  type StoredClient,
} from '../src/mcp-caller';
import { components } from './_generated/api';
import { internalQuery } from './_generated/server';
import { discordIdOfUser } from './auth';
import { GUILD_ID } from './commands';
import { identityStore } from './stores';

export const caller = internalQuery({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }): Promise<McpCallerResult> =>
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
      memberByDiscordId: (discordId) =>
        identityStore(ctx).getMemberByDiscordId(GUILD_ID, discordId),
      now: () => Date.now(),
    }),
});
