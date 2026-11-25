// The gateway (apps/gateway) calls Convex's /gateway/* routes with a shared secret,
// VINTAGE_GATEWAY_SECRET, as a bearer token. Shared by convex/http.ts and src/mcp-gateway.ts.
// On /gateway/interaction, Convex also re-verifies Discord's Ed25519 signature over the exact
// raw body with DISCORD_PUBLIC_KEY (#263), so a leaked bearer secret alone cannot forge a user.
import {
  importPublicKey,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyInteraction,
} from '@vintage/discord-kit';

/** Compare secrets without leaking their length or content through timing. */
export function sameSecret(given: string, expected: string): boolean {
  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.max(given.length, expected.length); i++) {
    diff |= (given.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A refusal Response when the request isn't from the gateway, or null when it is. */
export function refuseUnlessGateway(request: Request, secret: string | undefined): Response | null {
  if (!secret) return json({ error: 'VINTAGE_GATEWAY_SECRET is not set' }, 500);
  const auth = request.headers.get('authorization') ?? '';
  if (!sameSecret(auth.replace(/^Bearer /, ''), secret))
    return json({ error: 'unauthorized' }, 401);
  return null;
}

let cachedPublicKeyHex: string | undefined;
let cachedPublicKey: CryptoKey | undefined;

async function loadPublicKey(hex: string): Promise<CryptoKey | undefined> {
  if (cachedPublicKeyHex === hex && cachedPublicKey) return cachedPublicKey;
  try {
    const key = await importPublicKey(hex);
    cachedPublicKeyHex = hex;
    cachedPublicKey = key;
    return key;
  } catch {
    return undefined;
  }
}

export interface GatewayInteractionAuthOptions {
  /** VINTAGE_GATEWAY_SECRET. */
  secret: string | undefined;
  /** DISCORD_PUBLIC_KEY (32-byte hex). */
  publicKey: string | undefined;
  /** Clock for Discord's replay window. Default: the real clock. */
  now?: () => Date;
}

/**
 * Authenticate a forwarded Discord interaction on `/gateway/interaction` (#263):
 *   1. Shared gateway bearer secret (`VINTAGE_GATEWAY_SECRET`).
 *   2. Discord Ed25519 signature + replay window (`DISCORD_PUBLIC_KEY`) over the exact raw body,
 *      checked before parsing JSON.
 *   3. JSON parse.
 * Returns a refusal Response on failure, or `{ interaction }` when both checks pass.
 */
export async function verifyGatewayInteraction(
  request: Request,
  { secret, publicKey, now }: GatewayInteractionAuthOptions,
): Promise<Response | { interaction: unknown }> {
  const refused = refuseUnlessGateway(request, secret);
  if (refused) return refused;
  if (!publicKey) return json({ error: 'DISCORD_PUBLIC_KEY is not set' }, 500);

  const key = await loadPublicKey(publicKey);
  if (!key) return json({ error: 'DISCORD_PUBLIC_KEY is invalid' }, 500);

  const body = await request.text();
  const valid = await verifyInteraction(
    key,
    {
      signature: request.headers.get(SIGNATURE_HEADER),
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      body,
    },
    now ? { now } : undefined,
  );
  if (!valid) return json({ error: 'invalid request signature' }, 401);

  try {
    return { interaction: JSON.parse(body) as unknown };
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
}

/**
 * Is this forwarded interaction autocomplete (type 4, discord-kit's
 * InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE)? convex/http.ts runs those as a query.
 */
export const isAutocomplete = (interaction: unknown): boolean =>
  typeof interaction === 'object' &&
  interaction !== null &&
  (interaction as { type?: unknown }).type === 4;
