// Discord sign-in (#7) without Convex or the network: the bot's member lookup, the sync that runs
// right after sign-in, and the caller the website's commands then run as.

import { createMemoryAgentDeps } from '@vintage/agent/testing';
import { createMemoryApplicationsDeps } from '@vintage/applications/testing';
import { createMemoryCoordinatorDeps } from '@vintage/coordinator/testing';
import type { MemberSyncInput } from '@vintage/identity/commands';
import { createMemoryIdentityDeps } from '@vintage/identity/testing';
import { createMemoryInsightsDeps } from '@vintage/insights/testing';
import { createMemoryLootDeps } from '@vintage/loot/testing';
import { createMemoryPollsDeps } from '@vintage/polls/testing';
import { createMemoryProgressDeps } from '@vintage/progress/testing';
import { createMemoryRaidsDeps } from '@vintage/raids/testing';
import { createMemorySiteDeps } from '@vintage/site/testing';
import { makeCaller, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { fetchGuildMember } from '../src/discord-directory';
import { commands, type VintageDeps } from '../src/registry';
import { syncOnSignIn } from '../src/sign-in';
import { discordIdOf, webCaller } from '../src/web-caller';

const RAIDER_ROLE = '300000000000000003';
const AERYN = '100000000000000001';
const STRANGER = '100000000000000009';

/** A fetch that answers one request and records it. */
function fakeDiscord(status: number, body: unknown) {
  const requests: { url: string; auth: string | null }[] = [];
  const fetchFn = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({ url: String(input), auth: new Headers(init?.headers).get('authorization') });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const options = { token: 'test-token', guildId: 'guild-1', fetch: fetchFn };
  return { requests, fetchMember: (id: string) => fetchGuildMember(options, id) };
}

const aerynInServer = {
  user: { id: AERYN, username: 'aeryn', global_name: 'Aeryn' },
  nick: null,
  roles: [RAIDER_ROLE],
};

/** The memory host: the real registry, identity with a raider role mapped. */
function host() {
  const deps: VintageDeps = {
    ...createMemoryIdentityDeps({ [RAIDER_ROLE]: 'raider' }),
    ...createMemoryRaidsDeps(),
    ...createMemoryCoordinatorDeps(() => ({ guildId: TEST_GUILD_ID, events: [], members: [] })),
    ...createMemoryPollsDeps(),
    ...createMemoryProgressDeps(),
    ...createMemorySiteDeps(),
    ...createMemoryAgentDeps().deps,
    ...createMemoryApplicationsDeps().deps,
    ...createMemoryInsightsDeps().deps,
    ...createMemoryLootDeps(),
  };
  const registry = testRegistry<VintageDeps>(commands);
  const system = makeCaller('officer', { surface: 'system', memberId: undefined });
  const synced: MemberSyncInput[] = [];
  return {
    deps,
    synced,
    syncMember: async (input: MemberSyncInput) => {
      synced.push(input);
      return registry.execute({ name: 'member-sync', input, caller: system }, deps);
    },
    /** The caller a website request runs as, given the token's claims. */
    caller: (claims: Record<string, unknown> | null) =>
      webCaller(TEST_GUILD_ID, discordIdOf(claims), (id) =>
        deps.identity.getMemberByDiscordId(TEST_GUILD_ID, id),
      ),
  };
}

describe('fetchGuildMember', () => {
  it('reads one member with the bot token', async () => {
    const discord = fakeDiscord(200, aerynInServer);
    expect(await discord.fetchMember(AERYN)).toEqual({
      discordId: AERYN,
      displayName: 'Aeryn',
      roleIds: [RAIDER_ROLE],
    });
    expect(discord.requests[0]!.url).toMatch(/\/guilds\/guild-1\/members\/100000000000000001$/);
    expect(discord.requests[0]!.auth).toBe('Bot test-token');
  });

  it('answers null for someone not in the server', async () => {
    const discord = fakeDiscord(404, { code: 10007, message: 'Unknown Member' });
    expect(await discord.fetchMember(STRANGER)).toBeNull();
  });

  it('throws for an unknown server instead of treating the member as gone', async () => {
    const discord = fakeDiscord(404, { code: 10004, message: 'Unknown Guild' });
    const err = await discord.fetchMember(AERYN).catch((e: Error) => e);
    expect(String(err)).toMatch(/get guild member failed: 404.*DISCORD_GUILD_ID/);
    expect(String(err)).not.toMatch(/test-token/);
  });
});

describe('Discord sign-in', () => {
  it('a member in the guild is synced on sign-in and runs commands with their tier', async () => {
    const h = host();
    const discord = fakeDiscord(200, aerynInServer);
    expect(await syncOnSignIn(AERYN, { fetchMember: discord.fetchMember, ...h })).toBe('synced');
    expect(h.synced).toEqual([
      { discordId: AERYN, displayName: 'Aeryn', roleIds: [RAIDER_ROLE], inServer: true },
    ]);
    const member = await h.deps.identity.getMemberByDiscordId(TEST_GUILD_ID, AERYN);
    expect(await h.caller({ subject: 'better-auth-user-1', discordId: AERYN })).toEqual({
      surface: 'web',
      guildId: TEST_GUILD_ID,
      tier: 'raider',
      memberId: member!.id,
      discordId: AERYN,
    });
  });

  it('someone not in the guild is not synced and stays public, with their Discord id', async () => {
    const h = host();
    const discord = fakeDiscord(404, { code: 10007 });
    expect(await syncOnSignIn(STRANGER, { fetchMember: discord.fetchMember, ...h })).toBe(
      'not-in-server',
    );
    expect(h.synced).toEqual([]);
    const caller = await h.caller({ subject: 'better-auth-user-2', discordId: STRANGER });
    expect(caller).toMatchObject({ tier: 'public', discordId: STRANGER });
    expect(caller.memberId).toBeUndefined();
  });

  it('an unknown user (signed out, or a token without the claim) is public', async () => {
    const h = host();
    expect(await h.caller(null)).toMatchObject({ tier: 'public' });
    expect((await h.caller(null)).discordId).toBeUndefined();
    expect(await h.caller({ subject: 'better-auth-user-3' })).toMatchObject({ tier: 'public' });
    expect(await h.caller({ subject: 'x', discordId: '' })).toMatchObject({ tier: 'public' });
  });
});
