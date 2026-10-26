// The role-sync path with a mocked Discord REST API (no network): the fetch-backed directory,
// then the full run feeding member-sync through the registry and the memory store.

import { createMemoryCoordinatorDeps } from '@vintage/coordinator/testing';
import type { MemberSyncInput } from '@vintage/identity/commands';
import { createMemoryIdentityDeps } from '@vintage/identity/testing';
import { createMemoryPollsDeps } from '@vintage/polls/testing';
import { createMemoryProgressDeps } from '@vintage/progress/testing';
import { createMemoryRaidsDeps } from '@vintage/raids/testing';
import { makeCaller, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { discordGuildDirectory } from '../src/discord-directory';
import { commands, type VintageDeps } from '../src/registry';
import { runRoleSync } from '../src/role-sync';

const RAIDER = '200000000000000002';
const OFFICER = '200000000000000001';

const apiMember = (id: string, roles: string[] = [], extra: Record<string, unknown> = {}) => ({
  user: { id, username: `user${id}`, global_name: null },
  nick: null,
  roles,
  ...extra,
});

type Reply = { status?: number; body: unknown; headers?: Record<string, string> };

/** A fetch that answers with the queued replies in order and records the requests. */
function fakeDiscord(replies: Reply[]) {
  const requests: { url: URL; auth: string | null }[] = [];
  const sleeps: number[] = [];
  const fetchFn = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, auth: new Headers(init?.headers).get('authorization') });
    const reply = replies.shift();
    if (!reply) throw new Error(`unexpected request ${url}`);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json', ...reply.headers },
    });
  }) as typeof fetch;
  const directory = (pageSize = 2) =>
    discordGuildDirectory({
      token: 'test-token',
      guildId: '900000000000000000',
      fetch: fetchFn,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      pageSize,
    });
  return { requests, sleeps, directory };
}

describe('discordGuildDirectory', () => {
  it('pages with limit and after, using bot auth', async () => {
    const discord = fakeDiscord([
      { body: [apiMember('1'), apiMember('2')] },
      { body: [apiMember('3')] },
    ]);
    const directory = discord.directory();
    const first = await directory.page(null);
    expect(first.next).toBe('2');
    const second = await directory.page(first.next);
    expect(second.next).toBeNull();

    const [a, b] = discord.requests;
    expect(a?.url.pathname).toBe('/api/v10/guilds/900000000000000000/members');
    expect(a?.url.searchParams.get('limit')).toBe('2');
    expect(a?.url.searchParams.has('after')).toBe(false);
    expect(b?.url.searchParams.get('after')).toBe('2');
    expect(a?.auth).toBe('Bot test-token');
  });

  it('uses nickname, then global name, then username, and skips bots', async () => {
    const discord = fakeDiscord([
      {
        body: [
          apiMember('1', [RAIDER], { nick: 'Aeryn' }),
          apiMember('2', [], { user: { id: '2', username: 'kol', global_name: 'Kol' } }),
          apiMember('3'),
          apiMember('4', [], { user: { id: '4', username: 'botty', bot: true } }),
        ],
      },
    ]);
    const page = await discord.directory(10).page(null);
    expect(page.members).toEqual([
      { discordId: '1', displayName: 'Aeryn', roleIds: [RAIDER] },
      { discordId: '2', displayName: 'Kol', roleIds: [] },
      { discordId: '3', displayName: 'user3', roleIds: [] },
    ]);
  });

  it('advances the cursor past a bot at the end of a full page', async () => {
    const discord = fakeDiscord([
      {
        body: [apiMember('1'), apiMember('2', [], { user: { id: '2', username: 'b', bot: true } })],
      },
    ]);
    const page = await discord.directory().page(null);
    expect(page.next).toBe('2');
    expect(page.members).toHaveLength(1);
  });

  it('waits out a 429 retry_after and retries', async () => {
    const discord = fakeDiscord([
      { status: 429, body: { message: 'rate limited', retry_after: 1.25, global: false } },
      { body: [apiMember('1')] },
    ]);
    const page = await discord.directory().page(null);
    expect(page.members).toHaveLength(1);
    expect(discord.sleeps).toEqual([1250]);
    expect(discord.requests).toHaveLength(2);
  });

  it('falls back to the Retry-After header', async () => {
    const discord = fakeDiscord([
      { status: 429, body: {}, headers: { 'retry-after': '2' } },
      { body: [] },
    ]);
    await discord.directory().page(null);
    expect(discord.sleeps).toEqual([2000]);
  });

  it('waits for the bucket reset before the next page when none remain', async () => {
    const discord = fakeDiscord([
      {
        body: [apiMember('1'), apiMember('2')],
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '0.5' },
      },
      { body: [] },
    ]);
    const directory = discord.directory();
    await directory.page(null);
    expect(discord.sleeps).toEqual([]);
    await directory.page('2');
    expect(discord.sleeps).toEqual([500]);
  });

  it('gives up after repeated 429s or an over-long wait', async () => {
    const limited = { status: 429, body: { retry_after: 0.1 } };
    const many = fakeDiscord(Array.from({ length: 7 }, () => limited));
    await expect(many.directory().page(null)).rejects.toThrow(/rate limit/);

    const long = fakeDiscord([{ status: 429, body: { retry_after: 3600 } }]);
    await expect(long.directory().page(null)).rejects.toThrow(/giving up/);
  });

  it('explains auth and intent failures without echoing the token', async () => {
    const forbidden = fakeDiscord([{ status: 403, body: { message: 'Missing Access' } }]);
    const err = await forbidden
      .directory()
      .page(null)
      .catch((e: Error) => e);
    expect(String(err)).toMatch(/403.*Server Members intent/);
    expect(String(err)).not.toMatch(/test-token/);
  });
});

describe('runRoleSync', () => {
  const OFFICER_ROLE_MAP = { [OFFICER]: 'officer', [RAIDER]: 'raider' } as const;

  /** Applies batches through member-sync as the system caller, like commands:syncMembers. */
  function host() {
    const deps: VintageDeps = {
      ...createMemoryIdentityDeps({ ...OFFICER_ROLE_MAP }),
      ...createMemoryRaidsDeps(),
      ...createMemoryCoordinatorDeps(() => ({ guildId: TEST_GUILD_ID, events: [], members: [] })),
      ...createMemoryPollsDeps(),
      ...createMemoryProgressDeps(),
    };
    const registry = testRegistry<VintageDeps>(commands);
    const system = makeCaller('officer', { surface: 'system', memberId: undefined });
    const batches: MemberSyncInput[][] = [];
    const sync = (input: MemberSyncInput) =>
      registry.execute({ name: 'member-sync', input, caller: system }, deps);
    return {
      deps,
      batches,
      sync,
      knownMembers: () => deps.identity.listMembers(TEST_GUILD_ID),
      apply: async (batch: MemberSyncInput[]) => {
        batches.push(batch);
        const results = await Promise.all(batch.map(sync));
        return { synced: results.filter((r) => r.success).length, failed: [] };
      },
    };
  }

  it('syncs every directory member, drops departed ones to public, and batches', async () => {
    const h = host();
    await h.sync({ discordId: '9', displayName: 'Gone', inServer: true, roleIds: [RAIDER] });
    const discord = fakeDiscord([
      { body: [apiMember('1', [OFFICER], { nick: 'Boss' }), apiMember('2', [RAIDER])] },
      { body: [apiMember('3')] },
    ]);

    const summary = await runRoleSync({
      directory: discord.directory(),
      knownMembers: h.knownMembers,
      apply: h.apply,
      batchSize: 3,
    });

    expect(summary).toEqual({ inServer: 3, departed: 1, synced: 4, failed: [] });
    expect(h.batches.map((b) => b.length)).toEqual([3, 1]);
    const members = await h.deps.identity.listMembers(TEST_GUILD_ID);
    const tierOf = (id: string) => members.find((m) => m.discordId === id)?.tier;
    expect(['1', '2', '3', '9'].map(tierOf)).toEqual(['officer', 'raider', 'public', 'public']);
  });

  it('refuses to mark everyone departed when Discord lists nobody', async () => {
    const h = host();
    await h.sync({ discordId: '9', displayName: 'Kept', inServer: true, roleIds: [RAIDER] });
    const discord = fakeDiscord([{ body: [] }]);
    await expect(
      runRoleSync({ directory: discord.directory(), knownMembers: h.knownMembers, apply: h.apply }),
    ).rejects.toThrow(/refusing/);
    expect(h.batches).toEqual([]);
  });

  it('applies nothing when the directory read fails part way', async () => {
    const h = host();
    const discord = fakeDiscord([
      { body: [apiMember('1'), apiMember('2')] },
      { status: 500, body: {} },
    ]);
    await expect(
      runRoleSync({ directory: discord.directory(), knownMembers: h.knownMembers, apply: h.apply }),
    ).rejects.toThrow(/500/);
    expect(h.batches).toEqual([]);
  });
});
