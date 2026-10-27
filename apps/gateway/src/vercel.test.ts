import { afterEach, describe, expect, it, vi } from 'vitest';
import { respond } from './vercel';

afterEach(() => vi.unstubAllEnvs());

describe('the Vercel entry', () => {
  it("answers /mcp's sign-in metadata without any Discord settings", async () => {
    vi.stubEnv('DISCORD_PUBLIC_KEY', '');
    vi.stubEnv('VINTAGE_CONVEX_SITE_URL', 'https://dusty-sardine-902.convex.site');
    const res = await respond(
      new Request('https://vintage-gateway.vercel.app/.well-known/oauth-protected-resource/mcp'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).authorization_servers).toEqual([
      'https://dusty-sardine-902.convex.site/api/auth',
    ]);
  });

  it('still sends everything else to the Discord endpoint', async () => {
    vi.stubEnv('DISCORD_PUBLIC_KEY', '');
    const res = await respond(
      new Request('https://vintage-gateway.vercel.app/discord/interactions', { method: 'POST' }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'DISCORD_PUBLIC_KEY is not set' });
  });
});
