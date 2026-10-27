// The gateway (apps/gateway) calls Convex's /gateway/* routes with a shared secret,
// VINTAGE_GATEWAY_SECRET, as a bearer token. Shared by convex/http.ts and src/mcp-gateway.ts.

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
