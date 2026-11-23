// The Vercel function for /mcp and its RFC 9728 protected-resource metadata (#9). Kept separate
// from src/vercel.ts so Discord's 3-second interaction function stays small without afd-server.
//   VINTAGE_CONVEX_SITE_URL     Convex HTTP actions URL (issuer origin + /gateway/mcp/* routes)
//   VINTAGE_GATEWAY_SECRET      shared secret with Convex
//   VINTAGE_MCP_URL             optional: canonical /mcp URL (default https://vintage-gateway.vercel.app/mcp)
//   VINTAGE_MCP_ALLOWED_ORIGINS optional: comma-separated browser origins allowed by CORS
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createVintageMcpHandler, sendResponse } from './mcp';
import { isMetadataRequest, metadataResponse } from './mcp-metadata';

/** Handle one Node request to `/mcp` or `/.well-known/oauth-protected-resource(/mcp)?`. */
export default async function vercelMcpHandler(
  req: IncomingMessage,
  res: ServerResponse,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const url = `https://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
  const probe = new Request(url, { method: req.method ?? 'GET' });
  if (isMetadataRequest(probe, env)) {
    await sendResponse(res, metadataResponse(probe, env));
    return;
  }

  const siteUrl = env.VINTAGE_CONVEX_SITE_URL;
  const secret = env.VINTAGE_GATEWAY_SECRET;
  const convex =
    siteUrl && secret ? { siteUrl, secret, ...(fetchImpl ? { fetch: fetchImpl } : {}) } : undefined;
  const handle = createVintageMcpHandler({ env, convex });
  await handle(req, res);
}
