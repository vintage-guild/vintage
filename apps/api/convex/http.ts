// Convex HTTP routes. Only the gateway calls these, with a shared secret; the public Discord
// endpoint (signature checks, PING) stays in apps/gateway.
import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';

/** Compare secrets without leaking their length or content through timing. */
function sameSecret(given: string, expected: string): boolean {
  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.max(given.length, expected.length); i++) {
    diff |= (given.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const http = httpRouter();

/**
 * POST /gateway/interaction: a verified Discord component or modal interaction from the gateway.
 * Answers with the interaction response for the gateway to return to Discord, or 404 when it
 * isn't one Vintage handles (signups, polls).
 */
http.route({
  path: '/gateway/interaction',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.VINTAGE_GATEWAY_SECRET;
    if (!secret) return json({ error: 'VINTAGE_GATEWAY_SECRET is not set' }, 500);
    const auth = request.headers.get('authorization') ?? '';
    if (!sameSecret(auth.replace(/^Bearer /, ''), secret))
      return json({ error: 'unauthorized' }, 401);
    let interaction: unknown;
    try {
      interaction = await request.json();
    } catch {
      return json({ error: 'invalid JSON' }, 400);
    }
    const response = await ctx.runMutation(internal.discord.interaction, { interaction });
    return response ? json(response) : json({ error: 'not a Vintage interaction' }, 404);
  }),
});

export default http;
