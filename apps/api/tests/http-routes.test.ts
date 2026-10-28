// The Convex HTTP router loads on a hosted deployment even when sign-in isn't configured: a
// missing auth env fails /api/auth requests (src/auth-env.ts), never the gateway's route.
//
// The env is stubbed in vi.hoisted, before the static import below evaluates convex/http. Loading
// it pulls in Better Auth and its Convex adapter (over a second cold, three under a full parallel
// run), which belongs in the file's import phase like every other test file's imports, not in a
// dynamic import() inside the test, where it ran against the 5s test timeout and flaked.

import { afterAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.stubEnv('CONVEX_SITE_URL', 'https://example.convex.site');
  for (const name of [
    'BETTER_AUTH_SECRET',
    'SITE_URL',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
  ])
    vi.stubEnv(name, '');
});

import http from '../convex/http';

describe('convex/http', () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('routes the gateway on a hosted deployment with no sign-in env', () => {
    expect(http.lookup('/gateway/interaction', 'POST')).not.toBeNull();
    expect(http.lookup('/api/auth/get-session', 'GET')).not.toBeNull();
  });
});
