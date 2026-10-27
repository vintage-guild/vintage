// The OAuth server's guards (#9), on a real in-memory Better Auth with the production plugin order
// (src/oauth-server.ts, then the cross-domain plugin) and a stubbed Discord.
//
// The attack these guard against: someone starts a Discord sign-in themselves and smuggles an
// authorization for their own client into it (`additionalData.query`, which the OAuth provider
// stores without a signature check). When a member who has used the app before clicks the link,
// Discord passes straight through, the provider redirects to the attacker's redirect_uri, and the
// cross-domain plugin appends the member's one-time session token to that redirect.
import { crossDomain } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../src/mcp-caller';
import { oauthBeforeHook, oauthPlugins } from '../src/oauth-server';

const SITE = 'https://site.test';
const AUTH = 'https://auth.test';
const BASE = `${AUTH}/api/auth`;
const MCP = 'https://gateway.test/mcp';
const ATTACKER = 'https://attacker.test/callback';

function makeAuth({ guard = true } = {}) {
  const options = { siteUrl: SITE, mcpUrl: MCP };
  return betterAuth({
    baseURL: AUTH,
    secret: 'test-secret-test-secret-test-secret-32',
    trustedOrigins: [SITE],
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      oauthClient: [],
      oauthAccessToken: [],
      oauthRefreshToken: [],
      oauthConsent: [],
    }),
    socialProviders: {
      discord: {
        clientId: 'discord-client',
        clientSecret: 'discord-secret',
        getUserInfo: async () => ({
          user: {
            id: '100000000000000001',
            name: 'Member',
            email: '100000000000000001@users.discord.invalid',
            emailVerified: false,
          },
          data: {},
        }),
      },
    },
    ...(guard ? { hooks: { before: oauthBeforeHook(options) } } : {}),
    plugins: [...oauthPlugins(options), crossDomain({ siteUrl: SITE })],
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
      return new Response(
        JSON.stringify({ access_token: 'discord-at', token_type: 'Bearer', expires_in: 3600 }),
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

  it('refuses an oauth_query anywhere but continue and consent', async () => {
    const auth = makeAuth();
    const res = await post(auth, '/cross-domain/one-time-token/verify', {
      token: 'anything',
      oauth_query: 'client_id=x&sig=y',
    });
    expect(res.status).toBe(400);
  });
});
