// The Convex HTTP router loads on a hosted deployment even when sign-in isn't configured: a
// missing auth env fails /api/auth requests (src/auth-env.ts), never the gateway's route.

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('convex/http', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('routes the gateway on a hosted deployment with no sign-in env', async () => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://example.convex.site');
    for (const name of [
      'BETTER_AUTH_SECRET',
      'SITE_URL',
      'DISCORD_CLIENT_ID',
      'DISCORD_CLIENT_SECRET',
    ])
      vi.stubEnv(name, '');
    const { default: http } = await import('../convex/http');
    expect(http.lookup('/gateway/interaction', 'POST')).not.toBeNull();
    expect(http.lookup('/api/auth/get-session', 'GET')).not.toBeNull();
  });
});
