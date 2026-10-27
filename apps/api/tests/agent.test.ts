// The agent's trust boundary end to end, with the real guild-kit registry: a change the agent
// prepares as a member carries a token that only that member can spend, once, for that input.

import type { AgentDeps } from '@vintage/agent/commands';
import { agentCommands, recordToolCall } from '@vintage/agent/commands';
import { createMemoryAgentStore } from '@vintage/agent/testing';
import { CALL_TOOL, createRegistryTools, DISCOVER_TOOL } from '@vintage/agent-runtime';
import { type Caller, commandsFor, success } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

type Deps = AgentDeps & { removed: string[] };
const command = commandsFor<Deps>();

const characterRemove = command({
  name: 'character-remove',
  description: 'Remove one of your characters.',
  tier: 'member',
  destructive: true,
  input: z.object({ characterId: z.string() }),
  handler: async (input, { deps, dryRun }) => {
    if (!dryRun) deps.removed.push(input.characterId);
    return success({ wouldRemove: input.characterId });
  },
});

function harness() {
  const clock = fixedClock(Date.UTC(2026, 9, 27, 19));
  const registry = testRegistry<Deps>([...agentCommands, characterRemove], clock);
  const deps: Deps = {
    removed: [],
    agent: createMemoryAgentStore(),
    agentQueue: { enqueue: async () => undefined },
    agentRunner: {
      run: (caller, name, input, confirmToken) =>
        registry.execute({ name, input, caller, ...(confirmToken ? { confirmToken } : {}) }, deps),
    },
  };
  return { clock, registry, deps };
}

const kol = makeCaller('raider', { memberId: 'm-kol', discordId: 'd-kol', surface: 'web' });
const officer = makeCaller('officer', { memberId: 'm-off', discordId: 'd-off', surface: 'web' });
const asAgent = (caller: Caller): Caller => ({
  ...caller,
  surface: 'agent',
  onBehalfOf: caller.memberId,
});

async function prepareRemoval(h: ReturnType<typeof harness>) {
  const asked = await h.registry.execute(
    { name: 'agent-ask', input: { question: 'remove my alt' }, caller: kol },
    h.deps,
  );
  const { runId } = asked.data as { runId: string };
  const tools = createRegistryTools({
    registry: h.registry,
    deps: h.deps,
    caller: asAgent(kol),
    hidden: (n) => n.startsWith('agent-'),
  });
  const reply = await recordToolCall(
    h.deps.agent,
    { guildId: kol.guildId, runId, callId: 'call-1', name: CALL_TOOL },
    h.clock.now(),
    () => tools.execute(CALL_TOOL, { name: 'character-remove', input: { characterId: 'alt-1' } }),
  );
  const [confirmation] = await h.deps.agent.listConfirmations(kol.guildId, runId);
  return { runId, reply, confirmation: confirmation!, tools };
}

describe('agent trust boundary', () => {
  it('a prepared destructive change runs only when the asking member confirms, once', async () => {
    const h = harness();
    const { reply, confirmation } = await prepareRemoval(h);
    expect(h.deps.removed).toEqual([]);
    expect(reply.output).not.toContain(confirmation.confirmToken as string);

    const byOfficer = await h.registry.execute(
      { name: 'agent-confirm', input: { confirmationId: confirmation.id }, caller: officer },
      h.deps,
    );
    expect(byOfficer.success ? 'OK' : byOfficer.error?.code).toBe('CONFIRMATION_NOT_FOUND');

    const confirmed = await h.registry.execute(
      { name: 'agent-confirm', input: { confirmationId: confirmation.id }, caller: kol },
      h.deps,
    );
    expect(confirmed.success).toBe(true);
    expect(h.deps.removed).toEqual(['alt-1']);

    const again = await h.registry.execute(
      { name: 'agent-confirm', input: { confirmationId: confirmation.id }, caller: kol },
      h.deps,
    );
    expect(again.success ? 'OK' : again.error?.code).toBe('CONFIRMATION_CLOSED');
    expect(h.deps.removed).toEqual(['alt-1']);
  });

  it('the token is bound to its input: replaying it for another character is refused', async () => {
    const h = harness();
    const { confirmation } = await prepareRemoval(h);
    const replay = await h.registry.execute(
      {
        name: 'character-remove',
        input: { characterId: 'main-1' },
        caller: kol,
        confirmToken: confirmation.confirmToken as string,
      },
      h.deps,
    );
    expect(replay.success ? 'OK' : replay.error?.code).toBe('CONFIRMATION_INVALID');
    expect(h.deps.removed).toEqual([]);
  });

  it('the agent cannot see or call its own commands', async () => {
    const h = harness();
    const { tools, confirmation } = await prepareRemoval(h);
    const listed = JSON.parse((await tools.execute(DISCOVER_TOOL, {})).output) as {
      name: string;
    }[];
    expect(listed.map((c) => c.name)).toEqual(['character-remove']);
    const selfConfirm = await tools.execute(CALL_TOOL, {
      name: 'agent-confirm',
      input: { confirmationId: confirmation.id },
    });
    expect(JSON.parse(selfConfirm.output).error.code).toBe('COMMAND_NOT_FOUND');
    expect(h.deps.removed).toEqual([]);
  });
});
