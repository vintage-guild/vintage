// The OAuth 2.1 server for MCP clients (#9): Better Auth's OAuth provider plus Vintage's guards,
// with no Convex in it, so tests run the same configuration production does (convex/auth.ts).
import { oauthProvider } from '@better-auth/oauth-provider';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { allowedResource, hashToken, MCP_SCOPE } from './mcp-caller';

export interface OAuthServerOptions {
  /** The website origin, where the sign-in and consent pages live. */
  siteUrl: string;
  /** The /mcp endpoint, the only audience tokens are issued for. */
  mcpUrl: string;
  /**
   * Origins a sign-in callback may redirect to: the site's origins and the auth server's own.
   * Defaults to the site URL's origin.
   */
  callbackOrigins?: string[];
}

/**
 * The only endpoints that take the signed authorization query: continue and consent (the site's
 * two pages), and authorize as they call it internally with the same body. Authorize itself is
 * GET-only, so a request from outside can't put an oauth_query body on it.
 */
const OAUTH_QUERY_PATHS = new Set(['/oauth2/continue', '/oauth2/consent', '/oauth2/authorize']);

const refuse = (description: string) =>
  new APIError('BAD_REQUEST', { error: 'invalid_request', error_description: description });

/**
 * The `hooks.before` guard for Better Auth's options. User hooks run before plugin hooks, so
 * these refusals happen before the OAuth provider sees the request.
 */
export function oauthBeforeHook(o: OAuthServerOptions) {
  return createAuthMiddleware(async (ctx) => {
    const body = ctx.body as Record<string, unknown> | undefined;
    // The provider stores `additionalData.query` from a sign-in without checking a signature, then
    // finishes that authorization in the callback. Vintage's sign-ins never carry either field.
    if (/^\/(sign-in|link-social)/.test(ctx.path ?? '') && body?.additionalData !== undefined) {
      throw refuse('Sign-in does not take additionalData');
    }
    if (body?.oauth_query !== undefined && !OAUTH_QUERY_PATHS.has(ctx.path ?? '')) {
      throw refuse('oauth_query is only accepted by /oauth2/continue and /oauth2/consent');
    }
    // Refuse an OAuth authorization for any resource but /mcp up front (src/mcp-caller.ts).
    if (ctx.path === '/oauth2/authorize' && !allowedResource(ctx.query?.resource, [o.mcpUrl])) {
      throw new APIError('BAD_REQUEST', {
        error: 'invalid_target',
        error_description: `This server only issues tokens for ${o.mcpUrl}`,
      });
    }
  });
}

/** Whether a redirect stays on one of the allowed origins. */
export function onTrustedOrigin(location: string, base: string, origins: readonly string[]) {
  try {
    return origins.includes(new URL(location, base).origin);
  } catch {
    return false;
  }
}

/**
 * Second layer: a sign-in callback never redirects off the site or the auth server. The
 * cross-domain plugin appends the session's one-time token to whatever the callback redirects to,
 * so any other destination would receive a session. Placed after the OAuth provider (which may set
 * the redirect) and before the cross-domain plugin (which reads it), since after-hooks run in order.
 */
export function callbackGuard(o: OAuthServerOptions): BetterAuthPlugin {
  const origins = o.callbackOrigins ?? [new URL(o.siteUrl).origin];
  return {
    id: 'vintage-callback-guard',
    hooks: {
      after: [
        {
          matcher: (ctx) => /^\/(callback|oauth2\/callback)/.test(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const location = ctx.context.responseHeaders?.get('location');
            if (!location || onTrustedOrigin(location, ctx.context.baseURL, origins)) return;
            throw ctx.redirect(o.siteUrl);
          }),
        },
      ],
    },
  };
}

/** The plugins, in order. They go before the cross-domain plugin in Better Auth's options. */
export function oauthPlugins(o: OAuthServerOptions) {
  return [
    oauthProvider({
      loginPage: `${o.siteUrl}/oauth/sign-in`,
      consentPage: `${o.siteUrl}/oauth/consent`,
      validAudiences: [o.mcpUrl],
      scopes: [MCP_SCOPE, 'offline_access'],
      clientRegistrationDefaultScopes: [MCP_SCOPE, 'offline_access'],
      grantTypes: ['authorization_code', 'refresh_token'],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // Opaque tokens: the convex plugin owns JWT signing, and the provider can't share it.
      disableJwtPlugin: true,
      storeTokens: { hash: hashToken },
    }),
    callbackGuard(o),
  ] as const;
}
