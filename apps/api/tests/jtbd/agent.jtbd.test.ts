// JTBD: the guild agent (docs/jtbd/agent.md). A raider asks Random in Discord, confirms a change it
// prepared, and an officer sees the notes that need them. Only the OpenAI turn is stood in for:
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
});
