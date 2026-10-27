// JTBD: the guild agent (docs/jtbd/agent.md). A raider asks Random in Discord, confirms a change it
// prepared, an officer sees the notes that need them, and help fits each rank. Only the OpenAI turn is stood in for:
// agentUi.answer calls the same registry tools the agent would, as the asking member.

import { createFakeDecisions } from '@vintage/decisions/testing';
import type { Caller } from '@vintage/guild-kit';
import type { RaidEvent, Signup } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHost, DAY, type Host, OPS_CHANNEL, ROLES, SIGNUP_CHANNEL } from './host';

interface Guild {
  host: Host;
  officer: Caller;
  aeryn: Caller; // raider
  raid: RaidEvent;
}

const AERYN = '500000000000000003';

async function createGuild(): Promise<Guild> {
  const host = createHost();
  const officer = await host.discordMember('500000000000000001', 'Vex', [ROLES.officer]);
  const aeryn = await host.discordMember(AERYN, 'Aeryn', [ROLES.raider]);
  await host.ok(aeryn, 'character-add', {
    name: 'Aeryn',
    class: 'priest',
    spec: 'holy',
    isMain: true,
  });
  await host.configureCoordinator({ signupChannelId: SIGNUP_CHANNEL, opsChannelId: OPS_CHANNEL });
  const raid = await host.ok<RaidEvent>(officer, 'raid-create', {
    name: 'Molten Core',
    instance: 'Molten Core',
    size: 20,
    startsAt: host.clock.now() + 4 * DAY,
  });
  return { host, officer, aeryn, raid };
}

const content = (response: unknown) =>
  (response as { data?: { content?: string } } | null)?.data?.content ?? '';

describe('Guild agent', () => {
  let g: Guild;
  beforeEach(async () => {
    g = await createGuild();
  });

  it('J25 · Ask Random about the guild, privately', async () => {
    const deferred = await g.host.agentUi.ask(AERYN, 'when is the next raid?');
    // Private "thinking" reply now; the answer edits it when the turn ends.
    expect(deferred).toEqual({ type: 5, data: { flags: 64 } });
    const [queued] = g.host.agentUi.queued;
    expect(queued?.delivery).toEqual({
      kind: 'discord',
      applicationId: 'app',
      token: `token-${AERYN}`,
    });

    const reply = await g.host.agentUi.answer(
      queued!.runId,
      [{ tool: 'afd-call', args: { name: 'raid-list', input: {} } }],
      'Molten Core, in four days.',
    );
    expect(reply.content).toBe('Molten Core, in four days.');
    expect(reply.components).toEqual([]);

    // Only members ask, one question at a time, and within the caps.
    expect(content(await g.host.agentUi.ask('500000000000000099', 'hi'))).toMatch(
      /I don't know you yet/,
    );
    await g.host.ok(g.officer, 'agent-config-set', { memberDailyAsks: 1 });
    expect(content(await g.host.agentUi.ask(AERYN, 'and next week?'))).toMatch(
      /You have asked 1 questions today \(limit 1\)\. The limit resets at midnight UTC\./,
    );
  });

  it('J26 · Confirm a change Random prepared for me', async () => {
    await g.host.agentUi.ask(AERYN, 'mark me tentative for Molten Core');
    const { runId } = g.host.agentUi.queued[0]!;
    const characters = await g.host.ok<{ id: string }[]>(g.aeryn, 'character-list');
    const reply = await g.host.agentUi.answer(
      runId,
      [
        {
          tool: 'afd-call',
          args: {
            name: 'signup-set',
            input: { eventId: g.raid.id, characterId: characters[0]!.id, status: 'tentative' },
          },
        },
      ],
      'Press Confirm to mark you tentative.',
    );
    expect(reply.content).toMatch(/\*\*Change 1:\*\* signup-set: .*status tentative/);
    const row = reply.components?.[0] as { components: { custom_id: string }[] } | undefined;
    const [confirm, drop] = row?.components ?? [];
    expect(drop?.custom_id).toMatch(/^agent:no:/);

    // Nothing changed yet.
    const before = await g.host.ok<Signup | null>(g.aeryn, 'signup-get', { eventId: g.raid.id });
    expect(before).toBeNull();

    // Someone else's click does nothing; Aeryn's runs it.
    const officerClick = await g.host.agentUi.click(
      '500000000000000001',
      confirm!.custom_id,
      reply.content!,
    );
    expect(content(officerClick)).toMatch(/Not done: No pending change/);
    const done = await g.host.agentUi.click(AERYN, confirm!.custom_id, reply.content!);
    expect(content(done)).toMatch(/Done\.$/);
    const after = await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: g.raid.id });
    expect(after.status).toBe('tentative');

    // A second press is refused; the change ran once.
    expect(content(await g.host.agentUi.click(AERYN, confirm!.custom_id, reply.content!))).toMatch(
      /Not done: That change is already done/,
    );
  });

  it('J27 · See the signup notes that need an officer', async () => {
    const characters = await g.host.ok<{ id: string }[]>(g.aeryn, 'character-list');
    await g.host.ok(g.aeryn, 'signup-set', {
      eventId: g.raid.id,
      characterId: characters[0]!.id,
      status: 'accepted',
      note: 'can I bring my alt Kol instead?',
    });
    g.host.agentUi.setDecisions(
      createFakeDecisions({
        kind_0: { choice: 'swap', confidence: 0.95 },
        officer_0: { predicate: 0.9 },
      }),
    );
    await g.host.tick();
    g.host.clock.advance(3 * DAY);
    await g.host.tick();
    const digest = g.host
      .sentTo(OPS_CHANNEL)
      .map((m) => m.message.content ?? '')
      .find((c) => c.includes('confirmed'));
    expect(digest).toMatch(
      /\*\*Needs an officer\*\* \(1\): Aeryn \(can I bring my alt Kol instead\?\)/,
    );
  });

  it('J31 · Find out what I can do, for my rank', async () => {
    const ROOK = '500000000000000002';
    await g.host.discordMember(ROOK, 'Rook', [ROLES.raidLeader]);
    const page = (response: unknown) =>
      (response as { data: { flags: number; embeds: { title: string; description: string }[] } })
        .data;

    // A raider: privately, what they can do first; one line on what raid leaders can do.
    const raider = page(await g.host.helpUi.slash(AERYN));
    expect(raider.flags).toBe(64);
    expect(raider.embeds[0]?.title).toBe('Random help');
    expect(raider.embeds[0]?.description).toContain('You can use `/random poll create`.');
    expect(raider.embeds[0]?.description).toContain(
      '-# Raid leaders and officers can: `/random event create`, `/random event pick-night`.',
    );
    const raiderEvents = page(await g.host.helpUi.slash(AERYN, { group: 'event' }));
    expect(raiderEvents.embeds[0]?.description).toContain('Your rank can’t use these yet.');

    // A raid leader: the event commands, their options, and examples.
    const leader = page(await g.host.helpUi.slash(ROOK, { topic: 'events' }));
    expect(leader.embeds[0]?.title).toBe('Random help: Events');
    expect(leader.embeds[0]?.description).toContain(
      '**`/random event create`** · Make a one-off event, open for signups',
    );
    expect(leader.embeds[0]?.description).toContain('**Examples**');

    // Someone Random doesn't know yet: the role-sync note and what anyone can do.
    const stranger = page(await g.host.helpUi.slash('500000000000000099'));
    expect(stranger.embeds[0]?.description).toMatch(/^-# I don't know you yet/);
    expect(stranger.embeds[0]?.description).toContain('You can use `/random apply`');

    // Asking in plain words: the agent reads the same page as the member.
    await g.host.agentUi.ask(AERYN, 'how do I make a dungeon run?');
    const { runId } = g.host.agentUi.queued[0]!;
    await g.host.agentUi.answer(
      runId,
      [{ tool: 'afd-call', args: { name: 'help-get', input: { topic: 'events' } } }],
      'Raid leaders and officers make events with /random event create.',
    );
    const read = await g.host.deps.agent.getToolResult('guild-test', runId, 'call-0');
    expect(read?.output).toContain('Your rank can’t use these yet.');
    expect(read?.output).toContain('Raid leaders and officers can: `/random event create`');
  });
});

describe('Raid insights', () => {
  const BRIN = '500000000000000004';
  const death = (player: string, t: number) => ({
    t,
    player,
    pull: 0,
    damage_last_10s: 9000,
    killing_blow: { source: 'Ragnaros', spell: 'Lava Burst', amount: 4000 },
    last_hits: [],
    own_casts_last_8s: [],
    environment: false,
  });
  const upload = {
    schema: 'farsight.run',
    version: 1,
    parser: { name: '@farsight/core', version: '0.1.0' },
    run: {
      run_key: 'WoWCombatLog-110526.txt:1793000000',
      file: 'WoWCombatLog-110526.txt',
      start_ts: 1793000000,
      end_ts: 1793003600,
      start_offset: 0,
      end_offset: 1,
      zone_id: 409,
      zone_name: 'Molten Core',
      difficulty: 0,
      is_instance: true,
      map_id: null,
      map_name: null,
      map_bounds: null,
      build: '1.60.1',
      project: '18',
      events: 1000,
      duration: 3600,
      in_combat: 2400,
      between_pulls: 1200,
      avg_gap: 30,
      longest_gap: null,
      tank: 'Tankard-Realm',
      roster: [
        { name: 'Tankard-Realm', done: 100, heal: 0, taken: 50000, deaths: 0 },
        { name: 'Aeryn-Realm', done: 10, heal: 90000, taken: 8000, deaths: 2 },
        { name: 'Brin-Realm', done: 60000, heal: 0, taken: 6000, deaths: 0 },
      ],
      pulls: [],
      deaths: [death('Aeryn-Realm', 125), death('Aeryn-Realm', 1810)],
      interrupts: [],
      kicks: [{ player: 'Brin-Realm', attempts: 6, landed: 2 }],
      abilities: [],
      mobs: [],
      encounters: [],
    },
  };

  it('J30 · Get a private note on what the log says I could do better', async () => {
    const { host, officer, aeryn } = await createGuild();
    const brin = await host.discordMember(BRIN, 'Brin', [ROLES.raider]);
    await host.ok(brin, 'character-add', {
      name: 'Brin',
      class: 'rogue',
      spec: 'combat',
      isMain: true,
    });

    const imported = await host.ok<{ runId: string; imported: boolean }>(aeryn, 'run-import', {
      upload,
    });
    expect(imported.imported).toBe(true);
    expect((await host.ok<{ imported: boolean }>(brin, 'run-import', { upload })).imported).toBe(
      false,
    );

    // Each raider sees only their own notes, with the evidence; the officer sees everyone's.
    type Got = { findings: { character: string; text: string; evidence: string }[] };
    const mine = await host.ok<Got>(aeryn, 'insights-get', {});
    expect(mine.findings.map((f) => f.character)).toEqual(['Aeryn', 'Aeryn']);
    expect(mine.findings.map((f) => f.evidence)).toContain('at 2:05, 30:10');
    const all = await host.ok<Got>(officer, 'insights-get', { runId: imported.runId });
    expect(new Set(all.findings.map((f) => f.character))).toEqual(new Set(['Aeryn', 'Brin']));

    // Only Aeryn opted in: the preview names her alone, and the run sends once.
    await host.ok(aeryn, 'insights-optin-set', { dms: true });
    const preview = await host.preview<{ wouldMessage: string[]; messages: { text: string }[] }>(
      officer,
      'insights-send',
      { runId: imported.runId },
    );
    expect(preview.wouldMessage).toEqual(['Aeryn']);
    expect(preview.messages[0]?.text).toMatch(/Lava Burst \(Ragnaros\) killed you 2 times/);
    expect(host.insightsSent).toEqual([]);
    await host.ok(officer, 'insights-send', { runId: imported.runId });
    expect(host.insightsSent).toEqual([imported.runId]);
    expect((await host.run(officer, 'insights-send', { runId: imported.runId })).error?.code).toBe(
      'ALREADY_SENT',
    );
  });
});
