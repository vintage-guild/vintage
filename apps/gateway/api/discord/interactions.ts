// Vercel function: POST /api/discord/interactions (also /discord/interactions, see vercel.json).
// Thin shell: read config from the environment, delegate to the web-standard handler.
//   DISCORD_PUBLIC_KEY       verifies Discord's signatures
//   VINTAGE_CONVEX_SITE_URL  the Convex deployment's HTTP actions URL (https://<name>.convex.site)
//   VINTAGE_GATEWAY_SECRET   shared with Convex; signup buttons are forwarded with it
import { createInteractionHandler } from '../../src/interactions';

let cached: { key: string; handle: (request: Request) => Promise<Response> } | undefined;

export async function POST(request: Request): Promise<Response> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return Response.json({ error: 'DISCORD_PUBLIC_KEY is not set' }, { status: 500 });
  }
  const siteUrl = process.env.VINTAGE_CONVEX_SITE_URL;
  const secret = process.env.VINTAGE_GATEWAY_SECRET;
  const convex = siteUrl && secret ? { siteUrl, secret } : undefined;
  const key = `${publicKey}|${siteUrl ?? ''}|${secret ? 'set' : ''}`;
  if (cached?.key !== key) {
    cached = { key, handle: createInteractionHandler({ publicKey, convex }) };
  }
  return cached.handle(request);
}
