// How MCP clients find out how to sign in to /mcp (#9). /mcp answers an unauthenticated request
// with a 401 whose WWW-Authenticate header points at this server's protected-resource metadata
// (RFC 9728). That names the authorization server: Better Auth's OAuth provider on Convex
// (`<VINTAGE_CONVEX_SITE_URL>/api/auth`). Web-standard Request → Response, like interactions.ts.
//   VINTAGE_CONVEX_SITE_URL  the Convex deployment's HTTP actions URL (the issuer's origin)
//   VINTAGE_MCP_URL          optional: the /mcp URL, if not https://vintage-gateway.vercel.app/mcp

export interface McpEnv {
  VINTAGE_CONVEX_SITE_URL?: string;
  VINTAGE_MCP_URL?: string;
}

/** The OAuth scopes /mcp accepts (apps/api src/mcp-caller.ts: `commands`; refresh). */
export const MCP_SCOPES = ['commands', 'offline_access'];

const PROTECTED_RESOURCE = '/.well-known/oauth-protected-resource';

export const mcpUrlOf = (env: McpEnv) =>
  env.VINTAGE_MCP_URL ?? 'https://vintage-gateway.vercel.app/mcp';

/** Better Auth's issuer: the Convex site's origin plus its base path. */
export function issuerOf(env: McpEnv): string | null {
  if (!env.VINTAGE_CONVEX_SITE_URL) return null;
  try {
    return `${new URL(env.VINTAGE_CONVEX_SITE_URL).origin}/api/auth`;
  } catch {
    return null;
  }
}

/** Where a client fetches this resource's metadata (RFC 9728 path insertion for /mcp). */
export function metadataUrlOf(env: McpEnv): string {
  const mcp = new URL(mcpUrlOf(env));
  return `${mcp.origin}${PROTECTED_RESOURCE}${mcp.pathname === '/' ? '' : mcp.pathname}`;
}

export function protectedResourceMetadata(env: McpEnv, issuer: string) {
  return {
    resource: mcpUrlOf(env),
    authorization_servers: [issuer],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Vintage',
    resource_documentation: 'https://github.com/vintage-guild/vintage',
  };
}

/** Whether this request is for the metadata (at the root, or path-inserted for /mcp). */
export function isMetadataRequest(request: Request, env: McpEnv): boolean {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  const mcpPath = new URL(mcpUrlOf(env)).pathname.replace(/\/$/, '');
  return path === PROTECTED_RESOURCE || path === `${PROTECTED_RESOURCE}${mcpPath}`;
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** GET the metadata. Public and cacheable: it holds no secrets. */
export function metadataResponse(request: Request, env: McpEnv): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method not allowed' }, 405, { allow: 'GET, HEAD' });
  }
  const issuer = issuerOf(env);
  if (!issuer) return json({ error: 'VINTAGE_CONVEX_SITE_URL is not set' }, 500);
  return json(protectedResourceMetadata(env, issuer), 200, {
    'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*',
  });
}

/**
 * The 401 /mcp sends without a usable token (RFC 6750 §3, RFC 9728 §5.1). With `invalid` (an
 * expired, revoked, or unknown token) it says so, so the client signs in again.
 */
export function mcpChallenge(env: McpEnv, invalid?: string): Response {
  const params = [
    `resource_metadata="${metadataUrlOf(env)}"`,
    `scope="${MCP_SCOPES.join(' ')}"`,
    ...(invalid ? ['error="invalid_token"', `error_description="${invalid}"`] : []),
  ];
  return json(
    invalid ? { error: 'invalid_token', error_description: invalid } : { error: 'unauthorized' },
    401,
    { 'www-authenticate': `Bearer ${params.join(', ')}` },
  );
}
