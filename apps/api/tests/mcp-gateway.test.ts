// The gateway's MCP routes (#9, src/mcp-gateway.ts) without Convex: the HTTP shape (gateway secret,
// token refusals, bodies), and the tools and calls on the real registry over memory stores.
import { createMemoryAgentDeps } from '@vintage/agent/testing';
import { createMemoryApplicationsDeps } from '@vintage/applications/testing';
import { createMemoryCoordinatorDeps } from '@vintage/coordinator/testing';
import type { Caller } from '@vintage/guild-kit';
import { toManifest } from '@vintage/guild-kit';
import { createMemoryIdentityDeps } from '@vintage/identity/testing';
import { createMemoryInsightsDeps } from '@vintage/insights/testing';
import { createMemoryLootDeps } from '@vintage/loot/testing';
import { createMemoryPollsDeps } from '@vintage/polls/testing';
import { createMemoryProgressDeps } from '@vintage/progress/testing';
import { createMemoryRaidsDeps } from '@vintage/raids/testing';
import { createMemorySiteDeps } from '@vintage/site/testing';
import { makeCaller, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import {
  callFor,
  createMcpGatewayRoutes,
  type McpCall,
  type McpGatewayPorts,
  type McpTools,
  toolsFor,
} from '../src/mcp-gateway';
import { commands, type VintageDeps } from '../src/registry';

const SECRET = 'gateway-secret';

const post = (path: string, body: unknown, secret: string | null = SECRET) =>
  new Request(`https://convex.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Routes over fake ports that record what they were asked. */
function routes(
  answers: { tools?: McpTools; call?: McpCall } = {},
  secret: string | null = SECRET,
) {
  const asked: { tools: string[]; calls: unknown[] } = { tools: [], calls: [] };
  const ports: McpGatewayPorts = {
    secret: secret ?? undefined,
    tools: async (token) => {
      asked.tools.push(token);
      return answers.tools ?? { caller: { surface: 'mcp', tier: 'raider' }, tools: [] };
    },
    call: async (token, request) => {
      asked.calls.push({ token, ...request });
      return answers.call ?? { result: { success: true, data: 'ok' } };
    },
  };
  return { asked, ...createMcpGatewayRoutes(ports) };
}

describe('the gateway MCP routes', () => {
  it('only answer the gateway: no secret configured, or the wrong one, is refused', async () => {
    expect((await routes({}, null).tools(post('/gateway/mcp/tools', { token: 't' }))).status).toBe(
      500,
    );
    const r = routes();
    expect((await r.tools(post('/gateway/mcp/tools', { token: 't' }, 'wrong'))).status).toBe(401);
    expect((await r.call(post('/gateway/mcp/call', { token: 't', name: 'x' }, null))).status).toBe(
      401,
    );
    expect(r.asked.tools).toEqual([]);
    expect(r.asked.calls).toEqual([]);
  });

  it('answer 401 invalid_token for a missing or refused member token', async () => {
    const missing = await routes().tools(post('/gateway/mcp/tools', {}));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: 'invalid_token', error_description: 'missing' });
    const expired = await routes({ tools: { refused: 'expired' } }).tools(
      post('/gateway/mcp/tools', { token: 'old' }),
    );
    expect(expired.status).toBe(401);
    expect((await expired.json()).error_description).toBe('expired');
    const revoked = await routes({ call: { refused: 'unknown' } }).call(
      post('/gateway/mcp/call', { token: 'gone', name: 'member-me' }),
    );
    expect(revoked.status).toBe(401);
  });

  it('refuse malformed bodies', async () => {
    const r = routes();
    expect((await r.tools(post('/gateway/mcp/tools', '{nope'))).status).toBe(400);
    expect((await r.call(post('/gateway/mcp/call', [1, 2]))).status).toBe(400);
    expect((await r.call(post('/gateway/mcp/call', { token: 't' }))).status).toBe(400);
    expect(
      (await r.call(post('/gateway/mcp/call', { token: 't', name: 'x', confirmToken: 7 }))).status,
    ).toBe(400);
    expect(r.asked.calls).toEqual([]);
  });

  it('pass the call through: name, input (default {}), and the confirm token only when given', async () => {
    const r = routes();
    await r.call(post('/gateway/mcp/call', { token: 't', name: 'member-me' }));
    await r.call(
      post('/gateway/mcp/call', {
        token: 't',
        name: 'character-remove',
        input: { characterId: 'c1' },
        confirmToken: 'tok',
      }),
    );
    expect(r.asked.calls).toEqual([
      { token: 't', name: 'member-me', input: {} },
      { token: 't', name: 'character-remove', input: { characterId: 'c1' }, confirmToken: 'tok' },
    ]);
    const res = await r.call(post('/gateway/mcp/call', { token: 't', name: 'member-me' }));
    expect(await res.json()).toEqual({ result: { success: true, data: 'ok' } });
  });
});

const RAIDER_ROLE = '300000000000000003';

/** The real registry over memory stores, with one raider. */
async function guild() {
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
  await registry.execute(
    {
      name: 'member-sync',
      input: { discordId: 'd1', displayName: 'Aeryn', inServer: true, roleIds: [RAIDER_ROLE] },
      caller: system,
    },
    deps,
  );
  const member = await deps.identity.getMemberByDiscordId(TEST_GUILD_ID, 'd1');
  const raider: Caller = {
    surface: 'mcp',
    guildId: TEST_GUILD_ID,
    tier: 'raider',
    memberId: member!.id,
    discordId: 'd1',
  };
  const visible = (c: Caller) => toManifest(registry.visibleTo(c)).commands;
  const execute = (c: Caller, r: { name: string; input: unknown; confirmToken?: string }) =>
    registry.execute({ ...r, caller: c }, deps);
  return { raider, visible, execute };
}

describe('tools and calls on the real registry', () => {
  it("lists the member's tools by tier: their own, never a leader's or officer's", async () => {
    const g = await guild();
    const result = toolsFor({ caller: g.raider }, g.visible);
    if (!('tools' in result)) throw new Error('expected tools');
    expect(result.caller).toEqual({ surface: 'mcp', tier: 'raider', memberId: g.raider.memberId });
    const names = (result.tools as { name: string; tier: string }[]).map((t) => t.name);
    expect(names).toContain('member-me');
    expect(names).toContain('poll-close');
    expect(names).not.toContain('guild-roles-set');
    expect(names).not.toContain('raid-cancel');
    for (const t of result.tools as { tier: string }[]) {
      expect(['public', 'member', 'recruit', 'raider']).toContain(t.tier);
    }
  });

  it('never lists a system-only command, even to an officer whose tier would allow it', async () => {
    const g = await guild();
    const officer: Caller = { ...g.raider, tier: 'officer' };
    const result = toolsFor({ caller: officer }, g.visible);
    if (!('tools' in result)) throw new Error('expected tools');
    const names = (result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain('guild-roles-set');
    // member-sync is officer-tier but system-only: only the system caller (role sync) runs it.
    expect(names).not.toContain('member-sync');
    expect(
      await callFor(
        { caller: officer },
        {
          name: 'member-sync',
          input: { discordId: 'd9', displayName: 'X', inServer: true, roleIds: [] },
        },
        g.execute,
      ),
    ).toMatchObject({ result: { success: false, error: { code: 'COMMAND_NOT_FOUND' } } });
  });

  it('a refused token lists nothing and runs nothing', async () => {
    const g = await guild();
    expect(toolsFor({ refused: 'expired' }, g.visible)).toEqual({ refused: 'expired' });
    let ran = false;
    const call = await callFor(
      { refused: 'client' },
      { name: 'member-me', input: {} },
      async () => {
        ran = true;
        return { success: true };
      },
    );
    expect(call).toEqual({ refused: 'client' });
    expect(ran).toBe(false);
  });

  it('runs a command as the member, and a destructive one only after its preview', async () => {
    const g = await guild();
    const me = await callFor({ caller: g.raider }, { name: 'member-me', input: {} }, g.execute);
    expect(me).toMatchObject({
      result: { success: true, data: { member: { displayName: 'Aeryn' } } },
    });

    const added = await callFor(
      { caller: g.raider },
      { name: 'character-add', input: { name: 'Aeryn', class: 'warrior', spec: 'protection' } },
      g.execute,
    );
    const characterId = (added as { result: { data: { id: string } } }).result.data.id;
    const preview = await callFor(
      { caller: g.raider },
      { name: 'character-remove', input: { characterId } },
      g.execute,
    );
    const confirmToken = (preview as { result: { data: { confirmToken?: string } } }).result.data
      .confirmToken;
    expect(typeof confirmToken).toBe('string');
    const removed = await callFor(
      { caller: g.raider },
      { name: 'character-remove', input: { characterId }, confirmToken: confirmToken! },
      g.execute,
    );
    expect(removed).toMatchObject({ result: { success: true } });
  });

  it("refuses a command above the member's tier, as if it didn't exist", async () => {
    const g = await guild();
    const result = await callFor(
      { caller: g.raider },
      { name: 'guild-roles-set', input: { roles: {} } },
      g.execute,
    );
    expect(result).toMatchObject({
      result: { success: false, error: { code: 'COMMAND_NOT_FOUND' } },
    });
  });
});
