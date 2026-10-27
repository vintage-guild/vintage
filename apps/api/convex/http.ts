// Convex HTTP routes: Better Auth's sign-in endpoints under /api/auth (#7), and the gateway's
// interaction route, called with a shared secret. The public Discord endpoint (signature checks,
// PING) stays in apps/gateway.
import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { httpRouter } from 'convex/server';
import { isAutocomplete, json, refuseUnlessGateway } from '../src/gateway-auth';
import { createMcpGatewayRoutes } from '../src/mcp-gateway';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { authComponent, createAuth, siteOrigins } from './auth';

const http = httpRouter();

// Lazy: Better Auth is built on the first /api/auth request, not at load. A hosted deployment
// missing its sign-in env (src/auth-env.ts) then fails sign-in only, never this whole router.
authComponent.registerRoutesLazy(http, createAuth, {
  cors: { allowedOrigins: siteOrigins() },
  trustedOrigins: siteOrigins(),
});

/**
 * OAuth authorization server metadata (RFC 8414) for MCP clients (#9). The issuer is Better
 * Auth's base URL (`<site>/api/auth`), so clients look here, with the issuer path after the
 * well-known name.
 */
http.route({
  path: '/.well-known/oauth-authorization-server/api/auth',
  method: 'GET',
  handler: httpAction(async (ctx, request) =>
    oauthProviderAuthServerMetadata(createAuth(ctx))(request),
  ),
});

/**
 * POST /gateway/interaction: a verified Discord component or modal interaction from the gateway.
 * Answers with the interaction response for the gateway to return to Discord, or 404 when it
 * isn't one Vintage handles (signups, polls). Autocomplete runs as a query, the rest as a mutation.
 */
http.route({
  path: '/gateway/interaction',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const refused = refuseUnlessGateway(request, process.env.VINTAGE_GATEWAY_SECRET);
    if (refused) return refused;
    let interaction: unknown;
    try {
      interaction = await request.json();
    } catch {
      return json({ error: 'invalid JSON' }, 400);
    }
    // Autocomplete only reads (a query); everything else may change data (a mutation).
    const response = isAutocomplete(interaction)
      ? await ctx.runQuery(internal.discord.autocomplete, { interaction })
      : await ctx.runMutation(internal.discord.interaction, { interaction });
    return response ? json(response) : json({ error: 'not a Vintage interaction' }, 404);
  }),
});

/**
 * The /mcp endpoint's two calls (#9, src/mcp-gateway.ts), from the gateway with its secret and the
 * member's OAuth token: the tools that member may use, and one command run as them.
 */
const mcpRoutes = (ctx: Parameters<Parameters<typeof httpAction>[0]>[0]) =>
  createMcpGatewayRoutes({
    secret: process.env.VINTAGE_GATEWAY_SECRET,
    tools: (token) => ctx.runQuery(internal.mcp.tools, { token }),
    call: (token, request) => ctx.runMutation(internal.mcp.call, { token, ...request }),
  });

http.route({
  path: '/gateway/mcp/tools',
  method: 'POST',
  handler: httpAction(async (ctx, request) => mcpRoutes(ctx).tools(request)),
});

http.route({
  path: '/gateway/mcp/call',
  method: 'POST',
  handler: httpAction(async (ctx, request) => mcpRoutes(ctx).call(request)),
});

export default http;
