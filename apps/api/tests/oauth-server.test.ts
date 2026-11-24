// The OAuth server's guards (#9), on a real in-memory Better Auth with the production plugin order
// (src/oauth-server.ts, then the cross-domain plugin) and a stubbed Discord.
//
// The attack these guard against: someone starts a Discord sign-in themselves and smuggles an
// authorization for their own client into it (`additionalData.query`, which the OAuth provider
// stores without a signature check). When a member who has used the app before clicks the link,
// Discord passes straight through, the provider redirects to the attacker's redirect_uri, and the
// cross-domain plugin appends the member's one-time session token to that redirect.
import { crossDomain } from '@convex-dev/better-auth/plugins';
import type { Member } from '@vintage/identity/contract';
import { TEST_GUILD_ID } from '@vintage/testing';
import { type BetterAuthPlugin, betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createAuthMiddleware } from 'better-auth/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hashToken,
  mcpCaller,
  type StoredAccessToken,
  type StoredClient,
  type StoredConsent,
} from '../src/mcp-caller';
import {
  allowedCallbackLocation,
  oauthBeforeHook,
  oauthPlugins,
  oauthServerOptions,
  siteOriginsFrom,
} from '../src/oauth-server';

const SITE = 'https://site.test';
const AUTH = 'https://auth.test';
const BASE = `${AUTH}/api/auth`;
const MCP = 'https://gateway.test/mcp';
const ATTACKER = 'https://attacker.test/callback';

/** The environment, as production reads it (convex/auth.ts builds its options the same way). */
const ENV = { SITE_URL: SITE, VINTAGE_MCP_URL: MCP, CONVEX_SITE_URL: AUTH };

const DISCORD_USERS = {
  'discord-at': { id: '100000000000000001', username: 'member', name: 'Member' },
  'discord-at-2': { id: '100000000000000002', username: 'other', name: 'Other Member' },
} as const;

function makeAuth({
  guard = true,
  beforeConsentRevocation = [],
}: {
  guard?: boolean;
  beforeConsentRevocation?: BetterAuthPlugin[];
} = {}) {
  const options = oauthServerOptions(ENV);
  const plugins = [...oauthPlugins(options)];
  if (beforeConsentRevocation.length > 0) {
    const idx = plugins.findIndex((p) => p.id === 'vintage-consent-revocation');
    plugins.splice(idx, 0, ...beforeConsentRevocation);
  }
  return betterAuth({
    baseURL: AUTH,
    secret: 'test-secret-test-secret-test-secret-32',
    trustedOrigins: options.siteOrigins,
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      oauthClient: [],
      oauthResource: [],
      oauthClientResource: [],
      oauthAccessToken: [],
      oauthRefreshToken: [],
      oauthConsent: [],
      oauthClientAssertion: [],
    }),
    socialProviders: {
      discord: {
        clientId: 'discord-client',
        clientSecret: 'discord-secret',
        getUserInfo: async (token) => {
          const u =
            DISCORD_USERS[token.accessToken as keyof typeof DISCORD_USERS] ??
            DISCORD_USERS['discord-at'];
          return {
            user: {
              name: u.name,
              email: `${u.id}@users.discord.invalid`,
              emailVerified: false,
            },
            data: {
              id: u.id,
              username: u.username,
              discriminator: '0',
              global_name: u.name,
              avatar: null,
              mfa_enabled: false,
              banner: null,
              accent_color: null,
              locale: 'en-US',
              verified: false,
              flags: 0,
              premium_type: 0,
              public_flags: 0,
              display_name: u.name,
              avatar_decoration: null,
              banner_color: null,
              image_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
            },
          };
        },
      },
    },
    ...(guard ? { hooks: { before: oauthBeforeHook(options) } } : {}),
    plugins: [...plugins, crossDomain({ siteUrl: SITE })],
  });
}

type Auth = ReturnType<typeof makeAuth>;

const post = (auth: Auth, path: string, body: unknown) =>
  auth.handler(
    new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

/** A public client, registered the way anyone can (open dynamic registration). */
async function registerAttackerClient(auth: Auth): Promise<string> {
  const res = await post(auth, '/oauth2/register', {
    client_name: 'Totally Claude',
    redirect_uris: [ATTACKER],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  });
  return (await res.json()).client_id;
}

/** An authorization for the attacker's client that skips consent with prompt=none. */
const smuggledQuery = (clientId: string) =>
  new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: ATTACKER,
    scope: 'commands',
    prompt: 'none',
    state: 'attacker-state',
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
  }).toString();

/**
 * A validly signed authorization query for the attacker's client: anyone gets one by starting an
 * authorization signed out, which redirects to the site's sign-in page with it.
 */
async function signedQuery(auth: Auth, clientId: string): Promise<string> {
  // prompt=none would answer login_required to the client instead of signing a login query.
  const query = new URLSearchParams(smuggledQuery(clientId));
  query.delete('prompt');
  const res = await auth.handler(
    new Request(`${BASE}/oauth2/authorize?${query}`, {
      headers: { accept: 'text/html' },
    }),
  );
  const location = new URL(res.headers.get('location') ?? 'about:blank');
  expect(location.searchParams.has('sig')).toBe(true);
  return location.search.slice(1);
}

/** Discord's callback for a sign-in that started with `res` (state from its authorize URL). */
async function discordCallback(auth: Auth, res: Response): Promise<URL> {
  const { url } = await res.json();
  const state = new URL(url).searchParams.get('state');
  const back = await auth.handler(
    new Request(`${BASE}/callback/discord?code=discord-code&state=${state}`, {
      headers: { accept: 'text/html' },
    }),
  );
  return new URL(back.headers.get('location') ?? 'about:blank', AUTH);
}

beforeEach(() => {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith('https://discord.com/api/oauth2/token')) {
      const body = typeof init?.body === 'string' ? init.body : String(init?.body ?? '');
      const accessToken = body.includes('discord-code-2') ? 'discord-at-2' : 'discord-at';
      return new Response(
        JSON.stringify({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    return realFetch(input, init);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('the OAuth server guards', () => {
  it('an honest sign-in still returns to the site with its one-time token', async () => {
    const auth = makeAuth();
    const start = await post(auth, '/sign-in/social', { provider: 'discord', callbackURL: SITE });
    expect(start.status).toBe(200);
    const landed = await discordCallback(auth, start);
    expect(landed.origin).toBe(SITE);
    expect(landed.searchParams.has('ott')).toBe(true);
  });

  it('preserves a raid short-link return path (/r/<code>) across Discord sign-in', async () => {
    const auth = makeAuth();
    const start = await post(auth, '/sign-in/social', {
      provider: 'discord',
      callbackURL: `${SITE}/r/k3m9qz`,
    });
    expect(start.status).toBe(200);
    const landed = await discordCallback(auth, start);
    expect(landed.origin).toBe(SITE);
    expect(landed.pathname).toBe('/r/k3m9qz');
    expect(landed.searchParams.has('ott')).toBe(true);
  });

  it('refuses a sign-in that carries an authorization (additionalData or oauth_query)', async () => {
    const auth = makeAuth();
    const clientId = await registerAttackerClient(auth);
    const smuggled = await post(auth, '/sign-in/social', {
      provider: 'discord',
      callbackURL: SITE,
      additionalData: { query: smuggledQuery(clientId) },
    });
    expect(smuggled.status).toBe(400);
    // The same with a genuinely signed query, which the provider itself would accept.
    const viaQuery = await post(auth, '/sign-in/social', {
      provider: 'discord',
      callbackURL: SITE,
      oauth_query: await signedQuery(auth, clientId),
    });
    expect(viaQuery.status).toBe(400);
  });

  it('a signed query smuggled into sign-in still cannot send the session off the site', async () => {
    const auth = makeAuth({ guard: false });
    const clientId = await registerAttackerClient(auth);
    const start = await post(auth, '/sign-in/social', {
      provider: 'discord',
      callbackURL: SITE,
      oauth_query: await signedQuery(auth, clientId),
    });
    expect(start.status).toBe(200);
    const landed = await discordCallback(auth, start);
    expect(landed.origin).not.toBe(new URL(ATTACKER).origin);
  });

  it('never lets a session token leave the site, even if a smuggled sign-in gets through', async () => {
    // Without the sign-in guard: the callback guard alone must keep the token on the site.
    const auth = makeAuth({ guard: false });
    const clientId = await registerAttackerClient(auth);
    const start = await post(auth, '/sign-in/social', {
      provider: 'discord',
      callbackURL: SITE,
      additionalData: { query: smuggledQuery(clientId) },
    });
    expect(start.status).toBe(200);
    const landed = await discordCallback(auth, start);
    expect(landed.origin).not.toBe(new URL(ATTACKER).origin);
    if (landed.searchParams.has('ott')) expect(landed.origin).toBe(SITE);
  });

  it('the honest MCP flow still works through the guards: sign-in, continue, consent, token', async () => {
    const auth = makeAuth();
    // A member signs in on the site; the callback sets their session.
    const start = await post(auth, '/sign-in/social', { provider: 'discord', callbackURL: SITE });
    const { url } = await start.json();
    const state = new URL(url).searchParams.get('state');
    const back = await auth.handler(
      new Request(`${BASE}/callback/discord?code=discord-code&state=${state}`, {
        headers: { accept: 'text/html' },
      }),
    );
    const cookie = (back.headers.get('set-cookie') ?? '')
      .split(/,(?=\s*[\w.-]+=)/)
      .map((c) => c.split(';')[0]?.trim())
      .join('; ');
    const signedIn = (path: string, body: unknown) =>
      auth.handler(
        new Request(`${BASE}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie, origin: SITE },
          body: JSON.stringify(body),
        }),
      );

    // Claude registers and authorizes; the browser lands on the site's sign-in page.
    const reg = await (
      await post(auth, '/oauth2/register', {
        client_name: 'Claude',
        redirect_uris: ['http://127.0.0.1:33418/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      })
    ).json();
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const authorize = new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: 'http://127.0.0.1:33418/callback',
      scope: 'commands offline_access',
      state: 'claude-state',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      resource: MCP,
    });
    const toSignIn = new URL(
      (
        await auth.handler(
          new Request(`${BASE}/oauth2/authorize?${authorize}`, {
            headers: { accept: 'text/html' },
          }),
        )
      ).headers.get('location') ?? 'about:blank',
    );
    expect(`${toSignIn.origin}${toSignIn.pathname}`).toBe(`${SITE}/oauth/sign-in`);

    // The sign-in page continues; the consent page accepts.
    const cont = await (
      await signedIn('/oauth2/continue', { selected: true, oauth_query: toSignIn.search.slice(1) })
    ).json();
    const toConsent = new URL(cont.url);
    expect(`${toConsent.origin}${toConsent.pathname}`).toBe(`${SITE}/oauth/consent`);
    const done = await (
      await signedIn('/oauth2/consent', { accept: true, oauth_query: toConsent.search.slice(1) })
    ).json();
    const toClient = new URL(done.url);
    expect(toClient.origin).toBe('http://127.0.0.1:33418');
    expect(toClient.searchParams.get('state')).toBe('claude-state');
    expect(toClient.searchParams.get('iss')).toBe(BASE);
    expect(toClient.searchParams.has('ott')).toBe(false);

    // Claude trades the code, bound to /mcp.
    const token = await (
      await auth.handler(
        new Request(`${BASE}/oauth2/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: toClient.searchParams.get('code') ?? '',
            redirect_uri: 'http://127.0.0.1:33418/callback',
            client_id: reg.client_id,
            code_verifier: verifier,
            resource: MCP,
          }).toString(),
        }),
      )
    ).json();
    expect(token).toMatchObject({ token_type: 'Bearer', scope: 'commands offline_access' });
    expect(typeof token.refresh_token).toBe('string');
    // Stored the way mcp:caller looks it up.
    const ctx = await auth.$context;
    const stored = await ctx.adapter.findOne<{ token: string }>({
      model: 'oauthAccessToken',
      where: [{ field: 'token', value: await hashToken(token.access_token) }],
    });
    expect(stored).not.toBeNull();
  });

  it('refuses a sign-in that would return to the auth server instead of the site', async () => {
    const auth = makeAuth();
    const clientId = await registerAttackerClient(auth);
    // Better Auth trusts its own origin for callbackURL; an authorize URL there would run the
    // attacker's authorization with the session's one-time token attached.
    for (const field of ['callbackURL', 'errorCallbackURL', 'newUserCallbackURL']) {
      const res = await post(auth, '/sign-in/social', {
        provider: 'discord',
        callbackURL: SITE,
        [field]: `${BASE}/oauth2/authorize?${smuggledQuery(clientId)}`,
      });
      expect(res.status, field).toBe(400);
    }
  });

  it('a callback to an auth-server page other than its error page lands on the site instead', async () => {
    // Without the sign-in guard: only the callback guard stands between the token and the route.
    const auth = makeAuth({ guard: false });
    const clientId = await registerAttackerClient(auth);
    const start = await post(auth, '/sign-in/social', {
      provider: 'discord',
      callbackURL: `${BASE}/oauth2/authorize?${smuggledQuery(clientId)}`,
    });
    expect(start.status).toBe(200);
    const landed = await discordCallback(auth, start);
    expect(landed.origin).toBe(SITE);
  });

  it('refuses an oauth_query anywhere but continue and consent', async () => {
    const auth = makeAuth();
    const res = await post(auth, '/cross-domain/one-time-token/verify', {
      token: 'anything',
      oauth_query: 'client_id=x&sig=y',
    });
    expect(res.status).toBe(400);
  });
});

describe('oauthServerOptions', () => {
  it('skips a malformed trusted origin instead of breaking sign-in', () => {
    expect(
      siteOriginsFrom({
        SITE_URL: 'https://vintageguild.gg',
        VINTAGE_TRUSTED_ORIGINS:
          'https://vintage-web-pi.vercel.app, not a url, ,http://localhost:5173/',
      }),
    ).toEqual([
      'https://vintageguild.gg',
      'https://vintage-web-pi.vercel.app',
      'http://localhost:5173',
    ]);
  });

  it('allows a callback to the site, or exactly the auth error page, and nowhere else', () => {
    const o = oauthServerOptions(ENV);
    const allowed = (location: string) => allowedCallbackLocation(location, BASE, o);
    expect(allowed(`${SITE}/oauth/sign-in?x=1`)).toBe(true);
    expect(allowed(`${BASE}/error?error=state_mismatch`)).toBe(true);
    expect(allowed(`${BASE}/oauth2/authorize?client_id=x`)).toBe(false);
    expect(allowed(`${BASE}/error/extra`)).toBe(false);
    expect(allowed(ATTACKER)).toBe(false);
    expect(allowed(`//attacker.test/x`)).toBe(false);
    expect(allowed('https://site.test.attacker.test/')).toBe(false);
  });
});

const PKCE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const PKCE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const MCP_REDIRECT = 'http://127.0.0.1:33418/callback';

function cookiesOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '')
    .split(/,(?=\s*[\w.-]+=)/)
    .map((c) => c.split(';')[0]?.trim())
    .join('; ');
}

async function signInMember(auth: Auth, discordCode = 'discord-code') {
  const start = await post(auth, '/sign-in/social', { provider: 'discord', callbackURL: SITE });
  const { url } = await start.json();
  const state = new URL(url).searchParams.get('state');
  const back = await auth.handler(
    new Request(`${BASE}/callback/discord?code=${discordCode}&state=${state}`, {
      headers: { accept: 'text/html' },
    }),
  );
  const cookie = cookiesOf(back);
  return {
    cookie,
    post: (path: string, body: unknown) =>
      auth.handler(
        new Request(`${BASE}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie, origin: SITE },
          body: JSON.stringify(body),
        }),
      ),
    get: (path: string) =>
      auth.handler(
        new Request(`${BASE}${path}`, {
          method: 'GET',
          headers: { cookie, origin: SITE },
        }),
      ),
  };
}

async function registerMcpClient(auth: Auth, name: string): Promise<string> {
  const res = await post(auth, '/oauth2/register', {
    client_name: name,
    redirect_uris: [MCP_REDIRECT],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  });
  expect(res.status).toBe(201);
  return (await res.json()).client_id;
}

async function authorizeAndConsent(
  auth: Auth,
  member: Awaited<ReturnType<typeof signInMember>>,
  clientId: string,
  scope = 'commands offline_access',
): Promise<string> {
  const authorize = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: MCP_REDIRECT,
    scope,
    state: `state-${clientId}`,
    code_challenge: PKCE_CHALLENGE,
    code_challenge_method: 'S256',
    resource: MCP,
  });
  const toSignIn = new URL(
    (
      await auth.handler(
        new Request(`${BASE}/oauth2/authorize?${authorize}`, {
          headers: { accept: 'text/html' },
        }),
      )
    ).headers.get('location') ?? 'about:blank',
  );
  const cont = await (
    await member.post('/oauth2/continue', { selected: true, oauth_query: toSignIn.search.slice(1) })
  ).json();
  const next = new URL(cont.url);
  let toClient = next;
  if (`${next.origin}${next.pathname}` === `${SITE}/oauth/consent`) {
    const done = await (
      await member.post('/oauth2/consent', { accept: true, oauth_query: next.search.slice(1) })
    ).json();
    toClient = new URL(done.url);
  }
  const code = toClient.searchParams.get('code');
  expect(code).toBeTruthy();
  return code!;
}

async function exchangeCode(auth: Auth, clientId: string, code: string) {
  return auth.handler(
    new Request(`${BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: MCP_REDIRECT,
        client_id: clientId,
        code_verifier: PKCE_VERIFIER,
        resource: MCP,
      }).toString(),
    }),
  );
}

async function refreshWith(auth: Auth, clientId: string, refreshToken: string) {
  return auth.handler(
    new Request(`${BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        resource: MCP,
      }).toString(),
    }),
  );
}

/** Resolve an access token through the real `mcpCaller` backed by Better Auth's adapter. */
async function resolveMcpToken(auth: Auth, token: string) {
  const ctx = await auth.$context;
  const toMillis = (value: unknown): number =>
    value instanceof Date ? value.getTime() : typeof value === 'number' ? value : 0;
  return mcpCaller(TEST_GUILD_ID, token, {
    accessToken: async (hashed) => {
      const row = await ctx.adapter.findOne<Record<string, unknown>>({
        model: 'oauthAccessToken',
        where: [{ field: 'token', value: hashed }],
      });
      if (!row) return null;
      return {
        clientId: String(row.clientId),
        userId: (row.userId as string | null | undefined) ?? null,
        expiresAt: toMillis(row.expiresAt),
        revoked: row.revoked ? toMillis(row.revoked) : null,
        scopes: (row.scopes as string[]) ?? [],
      } satisfies StoredAccessToken;
    },
    client: async (clientId) =>
      (await ctx.adapter.findOne<StoredClient>({
        model: 'oauthClient',
        where: [{ field: 'clientId', value: clientId }],
      })) ?? null,
    consent: async (clientId, userId) =>
      (await ctx.adapter.findOne<StoredConsent>({
        model: 'oauthConsent',
        where: [
          { field: 'clientId', value: clientId },
          { field: 'userId', value: userId },
        ],
      })) ?? null,
    discordIdOfUser: async (userId) => {
      const account = await ctx.adapter.findOne<{ accountId?: string }>({
        model: 'account',
        where: [
          { field: 'userId', value: userId },
          { field: 'providerId', value: 'discord' },
        ],
      });
      return account?.accountId ?? null;
    },
    memberByDiscordId: async (discordId): Promise<Member> => ({
      id: `member-${discordId}`,
      guildId: TEST_GUILD_ID,
      discordId,
      displayName: 'Member',
      roleIds: [],
      inServer: true,
      rank: 'raider',
      rankSince: 0,
      tier: 'raider',
      prefs: { dmOptOut: false },
      syncedAt: 0,
    }),
    now: () => Date.now(),
  });
}

describe('disconnecting an app revokes its tokens (#174)', () => {
  it('revokes active access tokens and refresh tokens when consent is deleted', async () => {
    const auth = makeAuth();
    const member = await signInMember(auth);
    const clientId = await registerMcpClient(auth, 'Claude');
    const code = await authorizeAndConsent(auth, member, clientId);
    const initial = await (await exchangeCode(auth, clientId, code)).json();
    expect(typeof initial.access_token).toBe('string');
    expect(typeof initial.refresh_token).toBe('string');

    // Refresh once so multiple access tokens exist (initial + refreshed).
    const refreshedRes = await refreshWith(auth, clientId, initial.refresh_token);
    expect(refreshedRes.status).toBe(200);
    const refreshed = await refreshedRes.json();

    // Both active access tokens resolve before disconnect.
    expect(await resolveMcpToken(auth, initial.access_token)).toMatchObject({
      caller: { surface: 'mcp', tier: 'raider' },
    });
    expect(await resolveMcpToken(auth, refreshed.access_token)).toMatchObject({
      caller: { surface: 'mcp', tier: 'raider' },
    });

    // Member disconnects the app via /oauth2/delete-consent.
    const consents = (await (await member.get('/oauth2/get-consents')).json()) as {
      id: string;
      clientId: string;
    }[];
    const consent = consents.find((c) => c.clientId === clientId);
    expect(consent).toBeDefined();
    const del = await member.post('/oauth2/delete-consent', { id: consent!.id });
    expect(del.status).toBe(200);

    // Active access tokens are deleted from storage and immediately refused.
    const ctx = await auth.$context;
    expect(
      await ctx.adapter.findOne({
        model: 'oauthAccessToken',
        where: [{ field: 'token', value: await hashToken(initial.access_token) }],
      }),
    ).toBeNull();
    expect(
      await ctx.adapter.findOne({
        model: 'oauthAccessToken',
        where: [{ field: 'token', value: await hashToken(refreshed.access_token) }],
      }),
    ).toBeNull();
    expect(
      await ctx.adapter.findMany({
        model: 'oauthRefreshToken',
        where: [{ field: 'clientId', value: clientId }],
      }),
    ).toEqual([]);
    expect(await resolveMcpToken(auth, initial.access_token)).toEqual({ refused: 'unknown' });
    expect(await resolveMcpToken(auth, refreshed.access_token)).toEqual({ refused: 'unknown' });

    // Refresh token is immediately refused.
    const afterRefresh = await refreshWith(auth, clientId, refreshed.refresh_token);
    expect(afterRefresh.status).toBe(400);
    expect(await afterRefresh.json()).toMatchObject({ error: 'invalid_grant' });

    // Member's website session stays active.
    const session = await (await member.get('/get-session')).json();
    expect(session?.user?.id).toBeTruthy();
  });

  it('re-connecting the same client does not resurrect previously revoked tokens', async () => {
    const auth = makeAuth();
    const member = await signInMember(auth);
    const clientId = await registerMcpClient(auth, 'Claude');
    const code1 = await authorizeAndConsent(auth, member, clientId);
    const oldTokens = await (await exchangeCode(auth, clientId, code1)).json();

    const consents = (await (await member.get('/oauth2/get-consents')).json()) as {
      id: string;
      clientId: string;
    }[];
    const consent = consents.find((c) => c.clientId === clientId);
    expect((await member.post('/oauth2/delete-consent', { id: consent!.id })).status).toBe(200);

    // Re-connect the exact same client_id: creates a new consent row and fresh tokens.
    const code2 = await authorizeAndConsent(auth, member, clientId);
    const newTokens = await (await exchangeCode(auth, clientId, code2)).json();

    // Old tokens stay dead even though consent exists again for this client_id.
    expect(await resolveMcpToken(auth, oldTokens.access_token)).toEqual({ refused: 'unknown' });
    const oldRefresh = await refreshWith(auth, clientId, oldTokens.refresh_token);
    expect(oldRefresh.status).toBe(400);
    expect(await oldRefresh.json()).toMatchObject({ error: 'invalid_grant' });

    // New tokens work cleanly.
    expect(await resolveMcpToken(auth, newTokens.access_token)).toMatchObject({
      caller: { surface: 'mcp', tier: 'raider' },
    });
    const newRefresh = await refreshWith(auth, clientId, newTokens.refresh_token);
    expect(newRefresh.status).toBe(200);
  });

  it('revokes access-only tokens issued without offline_access', async () => {
    const auth = makeAuth();
    const member = await signInMember(auth);
    const clientId = await registerMcpClient(auth, 'Short-lived CLI');
    const code = await authorizeAndConsent(auth, member, clientId, 'commands');
    const tokens = await (await exchangeCode(auth, clientId, code)).json();
    expect(tokens.refresh_token).toBeUndefined();
    expect(await resolveMcpToken(auth, tokens.access_token)).toMatchObject({
      caller: { surface: 'mcp', tier: 'raider' },
    });

    const consents = (await (await member.get('/oauth2/get-consents')).json()) as {
      id: string;
      clientId: string;
    }[];
    const consent = consents.find((c) => c.clientId === clientId);
    expect((await member.post('/oauth2/delete-consent', { id: consent!.id })).status).toBe(200);

    expect(await resolveMcpToken(auth, tokens.access_token)).toEqual({ refused: 'unknown' });
  });

  it("disconnecting one app does not revoke the member's other connected apps", async () => {
    const auth = makeAuth();
    const member = await signInMember(auth);
    const claudeId = await registerMcpClient(auth, 'Claude');
    const codexId = await registerMcpClient(auth, 'Codex');

    const claudeTokens = await (
      await exchangeCode(auth, claudeId, await authorizeAndConsent(auth, member, claudeId))
    ).json();
    const codexTokens = await (
      await exchangeCode(auth, codexId, await authorizeAndConsent(auth, member, codexId))
    ).json();

    const consents = (await (await member.get('/oauth2/get-consents')).json()) as {
      id: string;
      clientId: string;
    }[];
    const claudeConsent = consents.find((c) => c.clientId === claudeId);
    expect((await member.post('/oauth2/delete-consent', { id: claudeConsent!.id })).status).toBe(
      200,
    );

    // Claude is revoked.
    expect(await resolveMcpToken(auth, claudeTokens.access_token)).toEqual({ refused: 'unknown' });
    expect((await refreshWith(auth, claudeId, claudeTokens.refresh_token)).status).toBe(400);

    // Codex keeps working.
    expect(await resolveMcpToken(auth, codexTokens.access_token)).toMatchObject({
      caller: { surface: 'mcp', tier: 'raider' },
    });
    expect((await refreshWith(auth, codexId, codexTokens.refresh_token)).status).toBe(200);
  });

  it('refuses unauthorized delete-consent and isolates tokens across members on the same client', async () => {
    const auth = makeAuth();
    const member1 = await signInMember(auth, 'discord-code');
    const member2 = await signInMember(auth, 'discord-code-2');
    const sharedClientId = await registerMcpClient(auth, 'Shared MCP Client');

    const m1Tokens = await (
      await exchangeCode(
        auth,
        sharedClientId,
        await authorizeAndConsent(auth, member1, sharedClientId),
      )
    ).json();
    const m2Tokens = await (
      await exchangeCode(
        auth,
        sharedClientId,
        await authorizeAndConsent(auth, member2, sharedClientId),
      )
    ).json();

    const m1Consents = (await (await member1.get('/oauth2/get-consents')).json()) as {
      id: string;
      clientId: string;
    }[];
    const m1ConsentId = m1Consents.find((c) => c.clientId === sharedClientId)!.id;

    // Unauthenticated caller cannot delete or revoke Member 1's tokens.
    const unauth = await post(auth, '/oauth2/delete-consent', { id: m1ConsentId });
    expect(unauth.status).toBe(401);
    expect(await resolveMcpToken(auth, m1Tokens.access_token)).toMatchObject({
      caller: { discordId: '100000000000000001' },
    });

    // Member 2 cannot delete or revoke Member 1's tokens.
    const wrongUser = await member2.post('/oauth2/delete-consent', { id: m1ConsentId });
    expect(wrongUser.status).toBe(401);
    expect(await resolveMcpToken(auth, m1Tokens.access_token)).toMatchObject({
      caller: { discordId: '100000000000000001' },
    });

    // Member 1 disconnects their own consent: only Member 1's tokens are revoked.
    expect((await member1.post('/oauth2/delete-consent', { id: m1ConsentId })).status).toBe(200);
    expect(await resolveMcpToken(auth, m1Tokens.access_token)).toEqual({ refused: 'unknown' });
    expect((await refreshWith(auth, sharedClientId, m1Tokens.refresh_token)).status).toBe(400);

    // Member 2's access and refresh tokens for the same client stay valid.
    expect(await resolveMcpToken(auth, m2Tokens.access_token)).toMatchObject({
      caller: { discordId: '100000000000000002' },
    });
    expect((await refreshWith(auth, sharedClientId, m2Tokens.refresh_token)).status).toBe(200);
  });

  it('refuses an in-flight authorization code and out-of-band consent deletion', async () => {
    const auth = makeAuth();
    const member = await signInMember(auth);
    const clientId = await registerMcpClient(auth, 'Racy Client');

    // Member consents, producing an authorization code, then disconnects before code exchange.
    const inflightCode = await authorizeAndConsent(auth, member, clientId);
    const consents1 = (await (await member.get('/oauth2/get-consents')).json()) as {
      id: string;
      clientId: string;
    }[];
    const consent1 = consents1.find((c) => c.clientId === clientId)!;
    expect((await member.post('/oauth2/delete-consent', { id: consent1.id })).status).toBe(200);

    const exchanged = await exchangeCode(auth, clientId, inflightCode);
    expect(exchanged.status).toBe(400);
    expect(await exchanged.json()).toMatchObject({ error: 'invalid_grant' });

    const ctx = await auth.$context;
    expect(
      await ctx.adapter.findMany({
        model: 'oauthAccessToken',
        where: [{ field: 'clientId', value: clientId }],
      }),
    ).toEqual([]);
    expect(
      await ctx.adapter.findMany({
        model: 'oauthRefreshToken',
        where: [{ field: 'clientId', value: clientId }],
      }),
    ).toEqual([]);

    // Now authorize again, then delete the consent row directly (out-of-band).
    const tokens = await (
      await exchangeCode(auth, clientId, await authorizeAndConsent(auth, member, clientId))
    ).json();
    await ctx.adapter.deleteMany({
      model: 'oauthConsent',
      where: [{ field: 'clientId', value: clientId }],
    });

    // Active access token is refused by mcpCaller even if the token row was never deleted.
    expect(await resolveMcpToken(auth, tokens.access_token)).toEqual({ refused: 'unknown' });
    // Refresh grant also refuses and cleans up the orphaned tokens.
    const refreshed = await refreshWith(auth, clientId, tokens.refresh_token);
    expect(refreshed.status).toBe(400);
    expect(await refreshed.json()).toMatchObject({ error: 'invalid_grant' });
    expect(
      await ctx.adapter.findMany({
        model: 'oauthAccessToken',
        where: [{ field: 'clientId', value: clientId }],
      }),
    ).toEqual([]);
    expect(
      await ctx.adapter.findMany({
        model: 'oauthRefreshToken',
        where: [{ field: 'clientId', value: clientId }],
      }),
    ).toEqual([]);
  });

  it('enforces narrowed consent scopes from /oauth2/update-consent', async () => {
    const auth = makeAuth();
    const member = await signInMember(auth);
    const clientId = await registerMcpClient(auth, 'Claude');
    const tokens = await (
      await exchangeCode(auth, clientId, await authorizeAndConsent(auth, member, clientId))
    ).json();

    const consents = (await (await member.get('/oauth2/get-consents')).json()) as {
      id: string;
      clientId: string;
    }[];
    const consentId = consents.find((c) => c.clientId === clientId)!.id;

    // Removing `commands` immediately blocks active access tokens on mcpCaller.
    const dropCommands = await member.post('/oauth2/update-consent', {
      id: consentId,
      update: { scopes: ['offline_access'] },
    });
    expect(dropCommands.status).toBe(200);
    expect(await resolveMcpToken(auth, tokens.access_token)).toEqual({ refused: 'scope' });

    // Trying to refresh a token whose scopes exceed the narrowed consent is refused.
    const refreshed = await refreshWith(auth, clientId, tokens.refresh_token);
    expect(refreshed.status).toBe(400);
    expect(await refreshed.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it('cascades revocation through direct auth.api.deleteOAuthConsent calls too', async () => {
    const auth = makeAuth();
    const member = await signInMember(auth);
    const clientId = await registerMcpClient(auth, 'Claude');
    const tokens = await (
      await exchangeCode(auth, clientId, await authorizeAndConsent(auth, member, clientId))
    ).json();

    const consents = (await (await member.get('/oauth2/get-consents')).json()) as {
      id: string;
      clientId: string;
    }[];
    const consentId = consents.find((c) => c.clientId === clientId)!.id;

    await auth.api.deleteOAuthConsent({
      body: { id: consentId },
      headers: new Headers({ cookie: member.cookie, origin: SITE }),
    });

    expect(await resolveMcpToken(auth, tokens.access_token)).toEqual({ refused: 'unknown' });
    const refreshed = await refreshWith(auth, clientId, tokens.refresh_token);
    expect(refreshed.status).toBe(400);
    expect(await refreshed.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it('cascades revocation over cross-domain Better-Auth-Cookie requests (even without explicit headers)', async () => {
    const auth = makeAuth();
    const member = await signInMember(auth);
    const clientId = await registerMcpClient(auth, 'Claude');
    const tokens = await (
      await exchangeCode(auth, clientId, await authorizeAndConsent(auth, member, clientId))
    ).json();

    const consents = (await (await member.get('/oauth2/get-consents')).json()) as {
      id: string;
      clientId: string;
    }[];
    const consentId = consents.find((c) => c.clientId === clientId)!.id;

    // Cross-domain calls carry `better-auth-cookie` on `request`, which crossDomain turns into
    // `ctx.headers` in a downstream before-hook; keying on `ctx.request` keeps before/after aligned.
    await auth.api.deleteOAuthConsent({
      body: { id: consentId },
      request: new Request(`${BASE}/oauth2/delete-consent`, {
        method: 'POST',
        headers: { 'better-auth-cookie': member.cookie, origin: SITE },
      }),
    });

    const ctx = await auth.$context;
    expect(
      await ctx.adapter.findMany({
        model: 'oauthAccessToken',
        where: [{ field: 'clientId', value: clientId }],
      }),
    ).toEqual([]);
    expect(
      await ctx.adapter.findMany({
        model: 'oauthRefreshToken',
        where: [{ field: 'clientId', value: clientId }],
      }),
    ).toEqual([]);
    expect(await resolveMcpToken(auth, tokens.access_token)).toEqual({ refused: 'unknown' });
    expect((await refreshWith(auth, clientId, tokens.refresh_token)).status).toBe(400);
  });

  it('fails closed and revokes any surviving refresh token if the access token disappears mid-issuance', async () => {
    // Simulate a concurrent disconnect deleting the freshly minted access token after the
    // provider inserted both rows, leaving the refresh token behind right before our after-hook.
    const dropMintedAccessToken: BetterAuthPlugin = {
      id: 'test-drop-minted-access-token',
      hooks: {
        after: [
          {
            matcher: (ctx) => ctx.path === '/oauth2/token',
            handler: createAuthMiddleware(async (ctx) => {
              const returned = ctx.context.returned as { access_token?: unknown } | undefined;
              if (typeof returned?.access_token !== 'string') return;
              await ctx.context.adapter.deleteMany({
                model: 'oauthAccessToken',
                where: [{ field: 'token', value: await hashToken(returned.access_token) }],
              });
            }),
          },
        ],
      },
    };
    const auth = makeAuth({ beforeConsentRevocation: [dropMintedAccessToken] });
    const member = await signInMember(auth);
    const clientId = await registerMcpClient(auth, 'Concurrent Client');
    const code = await authorizeAndConsent(auth, member, clientId);

    const res = await exchangeCode(auth, clientId, code);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_grant' });

    // The surviving refresh token row must also have been deleted.
    const ctx = await auth.$context;
    expect(
      await ctx.adapter.findMany({
        model: 'oauthRefreshToken',
        where: [{ field: 'clientId', value: clientId }],
      }),
    ).toEqual([]);
  });
});
