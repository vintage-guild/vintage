import { describe, expect, it } from 'vitest';
import { type AuthFetch, oauthActions, pendingAuthorization } from '../src/oauth';

const SIGNED =
  'response_type=code&client_id=claude&scope=commands+offline_access&state=xyz&exp=123&sig=abc';

describe('pendingAuthorization', () => {
  it('reads the client and scopes from a signed query, and keeps the query exactly', () => {
    expect(pendingAuthorization(`?${SIGNED}`)).toEqual({
      clientId: 'claude',
      scopes: ['commands', 'offline_access'],
      query: SIGNED,
    });
  });

  it('is null without a client or a signature (not an authorization page visit)', () => {
    expect(pendingAuthorization('')).toBeNull();
    expect(pendingAuthorization('?client_id=claude')).toBeNull();
    expect(pendingAuthorization('?sig=abc')).toBeNull();
  });
});

/** Records the calls and answers each with the next queued reply. */
function fakeAuth(replies: { data?: unknown; error?: { message?: string; status?: number } }[]) {
  const calls: { path: string; method: string; body?: unknown; query?: unknown }[] = [];
  const authFetch: AuthFetch = async (path, init) => {
    calls.push({ path, ...init });
    const reply = replies.shift() ?? {};
    return { data: reply.data ?? null, error: reply.error ?? null };
  };
  const visited: string[] = [];
  let search = `?${SIGNED}`;
  const location = { search: () => search, assign: (url: string) => visited.push(url) };
  return { calls, visited, authFetch, location, setSearch: (s: string) => (search = s) };
}

describe('oauthActions', () => {
  it('continue passes the signed query back with selected, then follows the next step', async () => {
    const f = fakeAuth([{ data: { redirect: true, url: 'https://site/oauth/consent?x=1' } }]);
    await oauthActions(f.authFetch, f.location).continue();
    expect(f.calls).toEqual([
      { path: '/oauth2/continue', method: 'POST', body: { selected: true, oauth_query: SIGNED } },
    ]);
    expect(f.visited).toEqual(['https://site/oauth/consent?x=1']);
  });

  it('consent sends the answer with the signed query and goes back to the client', async () => {
    const f = fakeAuth([{ data: { url: 'http://127.0.0.1:33418/callback?code=c&iss=i' } }]);
    await oauthActions(f.authFetch, f.location).consent(false);
    expect(f.calls[0]).toEqual({
      path: '/oauth2/consent',
      method: 'POST',
      body: { accept: false, oauth_query: SIGNED },
    });
    expect(f.visited).toEqual(['http://127.0.0.1:33418/callback?code=c&iss=i']);
  });

  it('refuses to act when the page has no pending authorization, and surfaces server errors', async () => {
    const f = fakeAuth([{ error: { message: 'invalid_signature', status: 400 } }]);
    const actions = oauthActions(f.authFetch, f.location);
    await expect(actions.continue()).rejects.toThrow('invalid_signature');
    f.setSearch('');
    await expect(actions.consent(true)).rejects.toThrow('No authorization is waiting');
    expect(f.visited).toEqual([]);
  });

  it('client returns the public name and links for the consent screen', async () => {
    const f = fakeAuth([{ data: { client_name: 'Claude', client_uri: 'https://claude.ai' } }, {}]);
    const actions = oauthActions(f.authFetch, f.location);
    expect(await actions.client('claude')).toEqual({ name: 'Claude', uri: 'https://claude.ai' });
    expect(f.calls[0]).toEqual({
      path: '/oauth2/public-client',
      method: 'GET',
      query: { client_id: 'claude' },
    });
    expect(await actions.client('gone')).toBeNull();
  });
});
