// Vercel function: POST /api/discord/interactions (also /discord/interactions, see vercel.json).
// Thin shell: read config from the environment, delegate to the web-standard handler.
import { createInteractionHandler } from '../../src/interactions';

let cached: { publicKey: string; handle: (request: Request) => Promise<Response> } | undefined;

export async function POST(request: Request): Promise<Response> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return Response.json({ error: 'DISCORD_PUBLIC_KEY is not set' }, { status: 500 });
  }
  if (cached?.publicKey !== publicKey) {
    cached = { publicKey, handle: createInteractionHandler({ publicKey }) };
  }
  return cached.handle(request);
}
