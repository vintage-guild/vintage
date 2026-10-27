// The /mcp caller (#9) without Convex: an OAuth bearer token to the member it runs as, and the
// resource guard on authorization requests. The full OAuth flow (register, authorize, consent,
// token) was checked end to end against the dev deployment; see the PR.
import type { Member } from '@vintage/identity/contract';
import { TEST_GUILD_ID } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import {
  allowedResource,
  hashToken,
  MCP_SCOPE,
  type McpCallerPorts,
  mcpCaller,
  type StoredAccessToken,
} from '../src/mcp-caller';

const MCP = 'https://vintage-gateway.vercel.app/mcp';
const NOW = 1_800_000_000_000;
const DISCORD = '100000000000000001';

const member: Member = {
  id: 'member-1',
  guildId: TEST_GUILD_ID,
  discordId: DISCORD,
  displayName: 'Aeryn',
  roleIds: [],
  rank: 'raider',
  tier: 'raider',
  prefs: { dmOptOut: false },
  syncedAt: NOW,
};

/** Ports over one stored token, keyed by the hash of `raw`. */
async function ports(
  raw: string,
  stored: Partial<StoredAccessToken> = {},
  extra: Partial<McpCallerPorts> = {},
): Promise<McpCallerPorts> {
  const hashed = await hashToken(raw);
  const row: StoredAccessToken = {
    clientId: 'claude',
    userId: 'user-1',
    expiresAt: NOW + 60_000,
    scopes: [MCP_SCOPE, 'offline_access'],
    ...stored,
  };
  return {
    accessToken: async (h) => (h === hashed ? row : null),
    client: async (id) => (id === 'claude' ? { disabled: false } : null),
    discordIdOfUser: async (id) => (id === 'user-1' ? DISCORD : null),
    memberByDiscordId: async (id) => (id === DISCORD ? member : null),
    now: () => NOW,
    ...extra,
  };
}

describe('hashToken', () => {
  it('is SHA-256, base64url without padding, as the OAuth provider stores tokens', async () => {
    // RFC 6234 test vector for "abc", re-encoded as base64url.
    expect(await hashToken('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });
});

describe('mcpCaller', () => {
  it('a member with a valid token runs as themselves, on the mcp surface', async () => {
    expect(await mcpCaller(TEST_GUILD_ID, 'tok', await ports('tok'))).toEqual({
      caller: {
        surface: 'mcp',
        guildId: TEST_GUILD_ID,
        tier: 'raider',
        memberId: 'member-1',
        discordId: DISCORD,
      },
    });
  });

  it('someone signed in who is not a guild member runs as public, with their Discord id', async () => {
    const result = await mcpCaller(
      TEST_GUILD_ID,
      'tok',
      await ports('tok', {}, { memberByDiscordId: async () => null }),
    );
    expect(result).toMatchObject({
      caller: { surface: 'mcp', tier: 'public', discordId: DISCORD },
    });
    expect('caller' in result && result.caller.memberId).toBeFalsy();
  });

  it('refuses missing, unknown, and expired tokens', async () => {
    const p = await ports('tok', {});
    expect(await mcpCaller(TEST_GUILD_ID, undefined, p)).toEqual({ refused: 'missing' });
    expect(await mcpCaller(TEST_GUILD_ID, 'other', p)).toEqual({ refused: 'unknown' });
    const expired = await ports('tok', { expiresAt: NOW });
    expect(await mcpCaller(TEST_GUILD_ID, 'tok', expired)).toEqual({ refused: 'expired' });
    // The schema makes expiresAt optional; a row without one is not valid forever.
    const noExpiry = await ports('tok', { expiresAt: undefined as unknown as number });
    expect(await mcpCaller(TEST_GUILD_ID, 'tok', noExpiry)).toEqual({ refused: 'expired' });
  });

  it('refuses tokens from a disabled or deleted client', async () => {
    const disabled = await ports('tok', {}, { client: async () => ({ disabled: true }) });
    expect(await mcpCaller(TEST_GUILD_ID, 'tok', disabled)).toEqual({ refused: 'client' });
    const gone = await ports('tok', {}, { client: async () => null });
    expect(await mcpCaller(TEST_GUILD_ID, 'tok', gone)).toEqual({ refused: 'client' });
  });

  it('refuses a token without the commands scope', async () => {
    const p = await ports('tok', { scopes: ['offline_access'] });
    expect(await mcpCaller(TEST_GUILD_ID, 'tok', p)).toEqual({ refused: 'scope' });
  });

  it('refuses a token with no user, or a user without a linked Discord account', async () => {
    const noUser = await ports('tok', { userId: null });
    expect(await mcpCaller(TEST_GUILD_ID, 'tok', noUser)).toEqual({ refused: 'no-user' });
    const noDiscord = await ports('tok', {}, { discordIdOfUser: async () => null });
    expect(await mcpCaller(TEST_GUILD_ID, 'tok', noDiscord)).toEqual({ refused: 'no-user' });
  });
});

describe('allowedResource', () => {
  it('allows /mcp, or no resource at all', () => {
    expect(allowedResource(MCP, [MCP])).toBe(true);
    expect(allowedResource(undefined, [MCP])).toBe(true);
    expect(allowedResource('', [MCP])).toBe(true);
    expect(allowedResource([MCP], [MCP])).toBe(true);
  });

  it('refuses any other resource, alone or mixed in', () => {
    expect(allowedResource('https://evil.example/api', [MCP])).toBe(false);
    expect(allowedResource(`${MCP}/`, [MCP])).toBe(false);
    expect(allowedResource([MCP, 'https://evil.example/api'], [MCP])).toBe(false);
    expect(allowedResource(42, [MCP])).toBe(false);
  });
});
