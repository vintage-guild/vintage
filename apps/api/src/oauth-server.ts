// The OAuth 2.1 server for MCP clients (#9): Better Auth's OAuth provider plus Vintage's guards,
// with no Convex in it. convex/auth.ts and the tests build it the same way, from the environment.
//
// The guards exist because of how two plugins combine. The cross-domain plugin (the site's session)
// appends the session's one-time token to wherever a sign-in callback redirects. The OAuth provider
// can make a callback redirect to an OAuth client, finishing an authorization smuggled into the
// sign-in. Unguarded, a crafted sign-in link sent a member's session to an attacker's client
// (reproduced in tests/oauth-server.test.ts).
import { oauthProvider } from '@better-auth/oauth-provider';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { allowedResource, hashToken, MCP_SCOPE } from './mcp-caller';

/** The environment variables the auth server reads (Convex env in production). */
export interface AuthEnv {
  SITE_URL?: string;
  VINTAGE_TRUSTED_ORIGINS?: string;
  VINTAGE_MCP_URL?: string;
  CONVEX_SITE_URL?: string;
}

export interface OAuthServerOptions {
  /** The website, where the sign-in and consent pages live. */
  siteUrl: string;
  /** The website's origins: where sign-in may send people, and the only place callbacks land. */
  siteOrigins: string[];
  /** The /mcp endpoint, the only audience tokens are issued for. */
  mcpUrl: string;
  /** Better Auth's own error page, the one auth-server page a callback may land on. */
  authErrorUrl?: string;
}

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * SITE_URL plus VINTAGE_TRUSTED_ORIGINS, as origins. An entry that doesn't parse is skipped: one
 * typo in the env var mustn't take sign-in down for everyone.
 */
export function siteOriginsFrom(env: AuthEnv): string[] {
  const entries = [
    env.SITE_URL ?? 'http://localhost:5173',
    ...(env.VINTAGE_TRUSTED_ORIGINS ?? '').split(',').map((s) => s.trim()),
  ];
  const origins = entries.flatMap((entry) => {
    const origin = entry ? originOf(entry) : null;
    return origin ? [origin] : [];
  });
  return [...new Set(origins)];
}

export function oauthServerOptions(env: AuthEnv): OAuthServerOptions {
  const authOrigin = env.CONVEX_SITE_URL ? originOf(env.CONVEX_SITE_URL) : null;
  return {
    siteUrl: env.SITE_URL ?? 'http://localhost:5173',
    siteOrigins: siteOriginsFrom(env),
    mcpUrl: env.VINTAGE_MCP_URL ?? 'https://vintage-gateway.vercel.app/mcp',
    ...(authOrigin ? { authErrorUrl: `${authOrigin}/api/auth/error` } : {}),
  };
}

/**
 * The only endpoints that take the signed authorization query: continue and consent (the site's
 * two pages), and authorize as they call it internally with the same body. Authorize itself is
 * GET-only, so a request from outside can't put an oauth_query body on it.
 */
const OAUTH_QUERY_PATHS = new Set(['/oauth2/continue', '/oauth2/consent', '/oauth2/authorize']);
const SIGN_IN = /^\/(sign-in|link-social)/;
const CALLBACK_URL_FIELDS = ['callbackURL', 'errorCallbackURL', 'newUserCallbackURL'] as const;

const refuse = (description: string) =>
  new APIError('BAD_REQUEST', { error: 'invalid_request', error_description: description });

/** A sign-in return URL: relative (resolved against the site), or absolute on a site origin. */
export function siteReturnUrl(value: unknown, siteOrigins: readonly string[]): boolean {
  if (typeof value !== 'string') return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  const origin = originOf(value);
  return origin !== null && siteOrigins.includes(origin);
}

/**
 * The `hooks.before` guard for Better Auth's options. User hooks run before plugin hooks, so
 * these refusals happen before the OAuth provider sees the request.
 */
type Body = Record<string, unknown> | undefined;

/** Sign-in carries no authorization, and only ever returns to the site. */
function checkSignIn(path: string, body: Body, o: OAuthServerOptions) {
  if (!SIGN_IN.test(path)) return;
  // The provider stores `additionalData.query` from a sign-in without checking a signature, then
  // finishes that authorization in the callback. Vintage's sign-ins never carry it.
  if (body?.additionalData !== undefined) throw refuse('Sign-in does not take additionalData');
  // Better Auth would also accept its own origin here.
  for (const field of CALLBACK_URL_FIELDS) {
    if (body?.[field] !== undefined && !siteReturnUrl(body[field], o.siteOrigins)) {
      throw refuse(`${field} must be on the website`);
    }
  }
}

function checkOAuthQuery(path: string, body: Body) {
  if (body?.oauth_query !== undefined && !OAUTH_QUERY_PATHS.has(path)) {
    throw refuse('oauth_query is only accepted by /oauth2/continue and /oauth2/consent');
  }
}

/** An OAuth authorization for any resource but /mcp is refused up front (src/mcp-caller.ts). */
function checkResource(path: string, resource: unknown, o: OAuthServerOptions) {
  if (path === '/oauth2/authorize' && !allowedResource(resource, [o.mcpUrl])) {
    throw new APIError('BAD_REQUEST', {
      error: 'invalid_target',
      error_description: `This server only issues tokens for ${o.mcpUrl}`,
    });
  }
}

export function oauthBeforeHook(o: OAuthServerOptions) {
  return createAuthMiddleware(async (ctx) => {
    const body = ctx.body as Body;
    const path = ctx.path ?? '';
    checkSignIn(path, body, o);
    checkOAuthQuery(path, body);
    checkResource(path, ctx.query?.resource, o);
  });
}

/**
 * Where a sign-in callback may redirect: a site origin, or exactly Better Auth's error page.
 * Never anywhere else on the auth server's origin, so no route there can pass a session on.
 */
export function allowedCallbackLocation(
  location: string,
  base: string,
  o: Pick<OAuthServerOptions, 'siteOrigins' | 'authErrorUrl'>,
): boolean {
  let url: URL;
  try {
    url = new URL(location, base);
  } catch {
    return false;
  }
  if (o.siteOrigins.includes(url.origin)) return true;
  return o.authErrorUrl !== undefined && `${url.origin}${url.pathname}` === o.authErrorUrl;
}

/** Every path the cross-domain plugin appends the one-time token on. */
const SESSION_HANDOFF = /^\/(callback|oauth2\/callback|magic-link\/verify)/;

/**
 * Second layer: a sign-in callback never redirects off the site. Placed after the OAuth provider
 * (which may set the redirect) and before the cross-domain plugin (which reads it to add the
 * one-time token), since after-hooks run in plugin order.
 */
export function callbackGuard(o: OAuthServerOptions): BetterAuthPlugin {
  return {
    id: 'vintage-callback-guard',
    hooks: {
      after: [
        {
          matcher: (ctx) => SESSION_HANDOFF.test(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const location = ctx.context.responseHeaders?.get('location');
            if (!location || allowedCallbackLocation(location, ctx.context.baseURL, o)) return;
            throw ctx.redirect(o.siteUrl);
          }),
        },
      ],
    },
  };
}

/**
 * Keep the two `oauthClient` columns dropped by @better-auth/oauth-provider 1.7 optional in
 * Convex's schema so pre-1.7 rows already in production keep validating on deploy.
 */
function legacyOAuthClientColumns(): BetterAuthPlugin {
  return {
    id: 'vintage-legacy-oauth-client-columns',
    schema: {
      oauthClient: {
        fields: {
          public: { type: 'boolean', required: false },
          type: { type: 'string', required: false },
        },
      },
    },
  };
}

interface PendingConsentDelete {
  id: string;
  clientId: string;
  userId: string;
}

const pendingConsentDeletes = new WeakMap<object, PendingConsentDelete>();

/**
 * Stable per-request WeakMap key across Better Auth's before/after hooks: `createAuthMiddleware`
 * shallow-copies `ctx.context` per hook and endpoint schema validation replaces `ctx.body`.
 * Prefer `ctx.request` (never allocated or replaced mid-pipeline) over `ctx.headers` (which a
 * downstream before-hook like `crossDomain` may allocate when `input.headers` was omitted).
 */
function hookRequestKey(ctx: {
  headers?: Headers;
  request?: Request;
  body?: unknown;
}): object | null {
  if (ctx.request) return ctx.request;
  if (ctx.headers) return ctx.headers;
  return ctx.body && typeof ctx.body === 'object' ? ctx.body : null;
}

type TokenAdapter = {
  findOne<T>(data: { model: string; where: { field: string; value: string }[] }): Promise<T | null>;
  deleteMany(data: { model: string; where: { field: string; value: string }[] }): Promise<number>;
};

/**
 * Remove every access and refresh token for one `(clientId, userId)` grant (#174). Deletes
 * access tokens before and after refresh tokens (matching @better-auth/oauth-provider's
 * `invalidateRefreshFamily`) to close the concurrent-refresh window and trigger the provider's
 * own `refreshTokenExists` guard during issuance.
 */
async function revokeClientTokens(
  adapter: Pick<TokenAdapter, 'deleteMany'>,
  clientId: string,
  userId: string,
): Promise<void> {
  const where = [
    { field: 'clientId', value: clientId },
    { field: 'userId', value: userId },
  ];
  await adapter.deleteMany({ model: 'oauthAccessToken', where });
  await adapter.deleteMany({ model: 'oauthRefreshToken', where });
  await adapter.deleteMany({ model: 'oauthAccessToken', where });
}

const consentRevokedError = () =>
  new APIError('BAD_REQUEST', {
    error: 'invalid_grant',
    error_description: 'consent revoked',
  });

/** Clean up a surviving refresh token when its companion access token disappeared mid-issuance. */
async function revokeOrphanedRefreshToken(
  adapter: TokenAdapter,
  refreshToken: unknown,
): Promise<void> {
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return;
  const hashed = await hashToken(refreshToken);
  const row = await adapter.findOne<{ clientId?: string; userId?: string | null }>({
    model: 'oauthRefreshToken',
    where: [{ field: 'token', value: hashed }],
  });
  if (row?.clientId && row.userId) {
    await revokeClientTokens(adapter, row.clientId, row.userId);
  } else {
    await adapter.deleteMany({
      model: 'oauthRefreshToken',
      where: [{ field: 'token', value: hashed }],
    });
  }
}

/**
 * Verify a freshly minted opaque token still has a live consent covering its scopes. Fails closed
 * if the access token vanished during a concurrent disconnect or if consent is missing/narrowed.
 */
async function verifyIssuedTokenConsent(adapter: TokenAdapter, returned: unknown): Promise<void> {
  if (
    !returned ||
    isAPIError(returned) ||
    returned instanceof Error ||
    typeof returned !== 'object'
  )
    return;
  const body = returned as { access_token?: unknown; refresh_token?: unknown };
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) return;

  const stored = await adapter.findOne<{
    clientId?: string;
    userId?: string | null;
    scopes?: string[];
  }>({
    model: 'oauthAccessToken',
    where: [{ field: 'token', value: await hashToken(body.access_token) }],
  });
  if (!stored) {
    // With disableJwtPlugin: true, every issued access_token has a backing row unless a
    // concurrent disconnect deleted it mid-flight. Clean up any surviving refresh token and fail
    // closed so the race cannot leak a refresh token.
    await revokeOrphanedRefreshToken(adapter, body.refresh_token);
    throw consentRevokedError();
  }
  if (!stored.clientId || !stored.userId) return;

  const consent = await adapter.findOne<{ scopes?: string[] }>({
    model: 'oauthConsent',
    where: [
      { field: 'clientId', value: stored.clientId },
      { field: 'userId', value: stored.userId },
    ],
  });
  const consentScopes = consent?.scopes ?? [];
  const tokenScopes = stored.scopes ?? [];
  const needsOffline = typeof body.refresh_token === 'string';
  const covered =
    consent !== null &&
    tokenScopes.every((scope) => consentScopes.includes(scope)) &&
    (!needsOffline || consentScopes.includes('offline_access'));
  if (covered) return;

  await revokeClientTokens(adapter, stored.clientId, stored.userId);
  throw consentRevokedError();
}

/**
 * Disconnecting an app (`/oauth2/delete-consent`) cascades to revoke all of that client's access
 * and refresh tokens for the member (#174). As defense-in-depth, `/oauth2/token` also requires a
 * live consent covering the issued token's scopes (catching in-flight authorization codes and
 * out-of-band consent deletion). Declares `(clientId, userId)` indexes on both token tables so
 * Convex serves the cascade without scanning.
 */
export function consentRevocation(): BetterAuthPlugin {
  return {
    id: 'vintage-consent-revocation',
    schema: {
      oauthAccessToken: {
        fields: {},
        indexes: [{ fields: ['clientId', 'userId'] }],
      },
      oauthRefreshToken: {
        fields: {},
        indexes: [{ fields: ['clientId', 'userId'] }],
      },
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === '/oauth2/delete-consent',
          handler: createAuthMiddleware(async (ctx) => {
            const key = hookRequestKey(ctx);
            const id = (ctx.body as Body)?.id;
            if (!key || typeof id !== 'string' || id.length === 0) return;
            const consent = await ctx.context.adapter.findOne<{
              clientId?: string;
              userId?: string | null;
            }>({
              model: 'oauthConsent',
              where: [{ field: 'id', value: id }],
            });
            if (!consent?.clientId || !consent.userId) return;
            // Read-only capture before the endpoint verifies ownership and deletes the row.
            pendingConsentDeletes.set(key, {
              id,
              clientId: consent.clientId,
              userId: consent.userId,
            });
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === '/oauth2/delete-consent',
          handler: createAuthMiddleware(async (ctx) => {
            const key = hookRequestKey(ctx);
            if (!key) return;
            const pending = pendingConsentDeletes.get(key);
            pendingConsentDeletes.delete(key);
            if (!pending) return;
            // Better Auth still runs after-hooks when an endpoint throws an APIError.
            const returned = ctx.context.returned;
            if (isAPIError(returned) || returned instanceof Error) return;
            // Confirm the consent row was actually removed before cascading.
            const stillExists = await ctx.context.adapter.findOne({
              model: 'oauthConsent',
              where: [{ field: 'id', value: pending.id }],
            });
            if (stillExists) return;
            await revokeClientTokens(ctx.context.adapter, pending.clientId, pending.userId);
          }),
        },
        {
          matcher: (ctx) => ctx.path === '/oauth2/token',
          handler: createAuthMiddleware(async (ctx) => {
            await verifyIssuedTokenConsent(ctx.context.adapter, ctx.context.returned);
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
      resources: [o.mcpUrl],
      clientRegistrationDefaultResources: [o.mcpUrl],
      // Only one resource exists (/mcp); keep pre-1.7 registered clients working without a backfill.
      enforcePerClientResources: false,
      scopes: [MCP_SCOPE, 'offline_access'],
      clientRegistrationDefaultScopes: [MCP_SCOPE, 'offline_access'],
      grantTypes: ['authorization_code', 'refresh_token'],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // Native MCP clients (Claude Code, Codex, Cursor) often omit application_type on DCR while
      // registering loopback or custom-scheme callbacks.
      clientRegistrationDefaultApplicationType: 'infer',
      // Opaque tokens: the convex plugin owns JWT signing, and the provider can't share it.
      disableJwtPlugin: true,
      storeTokens: { hash: hashToken },
    }),
    legacyOAuthClientColumns(),
    consentRevocation(),
    callbackGuard(o),
  ] as const;
}
