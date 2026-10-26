// The Vercel function: a Node (req, res) handler around the web-standard interactions handler.
// scripts/build-vercel.mjs bundles this file into one self-contained module (Build Output API),
// because Vercel's per-file TypeScript build can't resolve our workspace packages at runtime.
//   DISCORD_PUBLIC_KEY       verifies Discord's signatures
//   VINTAGE_CONVEX_SITE_URL  the Convex deployment's HTTP actions URL (https://<name>.convex.site)
//   VINTAGE_GATEWAY_SECRET   shared with Convex; signup buttons are forwarded with it
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createInteractionHandler } from './interactions';

let cached: { key: string; handle: (request: Request) => Promise<Response> } | undefined;

function handler(): ((request: Request) => Promise<Response>) | undefined {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return undefined;
  const siteUrl = process.env.VINTAGE_CONVEX_SITE_URL;
  const secret = process.env.VINTAGE_GATEWAY_SECRET;
  const convex = siteUrl && secret ? { siteUrl, secret } : undefined;
  const key = `${publicKey}|${siteUrl ?? ''}|${secret ? 'set' : ''}`;
  if (cached?.key !== key)
    cached = { key, handle: createInteractionHandler({ publicKey, convex }) };
  return cached.handle;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req)
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

/** The Node request as a web Request (headers, method, raw body). */
async function toRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  const method = req.method ?? 'GET';
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : new Uint8Array(await readBody(req));
  return new Request(`https://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
    method,
    headers,
    body,
  });
}

/** Run the web-standard handler for a Node request and write its Response back. */
export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  const handle = handler();
  const response = handle
    ? await handle(await toRequest(req))
    : Response.json({ error: 'DISCORD_PUBLIC_KEY is not set' }, { status: 500 });
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    res.setHeader(name, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}
