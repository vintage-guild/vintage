// Who an /mcp request runs as (#9). MCP clients (Claude, Codex, the CLI) get an OAuth access token
// from Better Auth's OAuth provider (convex/auth.ts) after the member signs in with Discord and
// consents. The tokens are opaque, so they're checked here against the stored record: known,
// unexpired, from an enabled client, with the `commands` scope. The member then resolves like a
// website caller (src/web-caller.ts), with surface `mcp`. Pure over lookups, so tests don't need Convex.
import { type Caller, publicCaller } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';

/** The OAuth scope a token needs to run commands. Tier still decides which ones. */
export const MCP_SCOPE = 'commands';

/**
 * How tokens are stored: SHA-256, base64url without padding. Passed to the OAuth provider as
 * `storeTokens.hash`, so the check below and the provider agree by construction.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
  );
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Whether an authorization request may name this resource (RFC 8707). The token endpoint already
 * refuses tokens for anything but /mcp; checking at authorize too saves the member a sign-in and
 * consent that would fail anyway. No resource is allowed: the token still only works at /mcp.
 */
export function allowedResource(resource: unknown, allowed: readonly string[]): boolean {
  if (resource === undefined || resource === null || resource === '') return true;
  const requested = Array.isArray(resource) ? resource : [resource];
  return requested.every((r) => typeof r === 'string' && allowed.includes(r));
}

/** The fields of the OAuth provider's `oauthAccessToken` and `oauthClient` rows read here. */
export interface StoredAccessToken {
  clientId: string;
  userId?: string | null;
  expiresAt: number;
  scopes: string[];
}
export interface StoredClient {
  disabled?: boolean | null;
}

export interface McpCallerPorts {
  accessToken(hashed: string): Promise<StoredAccessToken | null>;
  client(clientId: string): Promise<StoredClient | null>;
  /** The Discord id behind a Better Auth user, from their linked Discord account. */
  discordIdOfUser(userId: string): Promise<string | null>;
  memberByDiscordId(discordId: string): Promise<Member | null>;
  now(): number;
}

/** Why a token was refused; the /mcp endpoint answers 401 with `invalid_token` for all of them. */
export type McpTokenRefusal = 'missing' | 'unknown' | 'expired' | 'client' | 'scope' | 'no-user';

export type McpCallerResult = { caller: Caller } | { refused: McpTokenRefusal };

/**
 * The caller for a bearer token, or why it's refused. A valid token for someone who isn't a guild
 * member runs as public (with their Discord id), like the website.
 */
export async function mcpCaller(
  guildId: string,
  token: string | undefined,
  ports: McpCallerPorts,
): Promise<McpCallerResult> {
  if (!token) return { refused: 'missing' };
  const stored = await ports.accessToken(await hashToken(token));
  if (!stored) return { refused: 'unknown' };
  if (stored.expiresAt <= ports.now()) return { refused: 'expired' };
  const client = await ports.client(stored.clientId);
  if (!client || client.disabled) return { refused: 'client' };
  if (!stored.scopes.includes(MCP_SCOPE)) return { refused: 'scope' };
  if (!stored.userId) return { refused: 'no-user' };
  const discordId = await ports.discordIdOfUser(stored.userId);
  if (!discordId) return { refused: 'no-user' };
  const member = await ports.memberByDiscordId(discordId);
  if (!member) return { caller: { ...publicCaller(guildId), surface: 'mcp', discordId } };
  return {
    caller: {
      surface: 'mcp',
      guildId,
      tier: member.tier,
      memberId: member.id,
      discordId: member.discordId,
    },
  };
}
