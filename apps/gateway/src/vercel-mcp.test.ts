import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import vercelMcpHandler from './vercel-mcp';

const ENV: NodeJS.ProcessEnv = {
  VINTAGE_CONVEX_SITE_URL: 'https://dusty-sardine-902.convex.site',
  VINTAGE_GATEWAY_SECRET: 'gw-secret',
  VINTAGE_MCP_URL: 'https://vintage-gateway.vercel.app/mcp',
};

const servers: Array<ReturnType<typeof createServer>> = [];

async function start(env: NodeJS.ProcessEnv = ENV, fetchImpl?: typeof fetch) {
  const server = createServer((req, res) => {
    void vercelMcpHandler(req, res, env, fetchImpl);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server) continue;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('the Vercel /mcp function', () => {
  it('serves RFC 9728 metadata publicly without any token or Discord env', async () => {
    const base = await start({ VINTAGE_CONVEX_SITE_URL: ENV.VINTAGE_CONVEX_SITE_URL });
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    expect((await res.json()).authorization_servers).toEqual([
      'https://dusty-sardine-902.convex.site/api/auth',
    ]);
  });

  it('challenges unauthenticated /mcp requests with the RFC 9728 metadata link', async () => {
    const base = await start();
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://vintage-gateway.vercel.app/.well-known/oauth-protected-resource/mcp"',
    );
  });
});
