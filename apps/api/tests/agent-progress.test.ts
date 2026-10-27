// What the officers' side panel reads while a question runs (#167), end to end with the real
// registry: one turn through the fake Agents runtime, wired the way convex/agent.ts wires it
// (tool calls recorded with their start, progress written while running, agent-cancel checked
// on every poll).

import type { AgentDeps } from '@vintage/agent/commands';
import { agentCommands, askInput, recordProgress, recordToolCall } from '@vintage/agent/commands';
import type { AgentRun } from '@vintage/agent/contract';
import { createMemoryAgentStore } from '@vintage/agent/testing';
import { CALL_TOOL, createRegistryTools, REGISTRY_TOOLS, runTurn } from '@vintage/agent-runtime';
import { createFakeAgentRuntime, type ScriptedTurn } from '@vintage/agent-runtime/testing';
import { type Caller, commandsFor, success } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const command = commandsFor<AgentDeps>();
const signupList = command({
  name: 'signup-list',
  description: 'Everyone signed up for a raid.',
  tier: 'recruit',
  input: z.object({ eventId: z.string() }),
  handler: async () => success([{ name: 'Aeryn' }, { name: 'Kol' }]),
});

const officer = makeCaller('officer', { memberId: 'm-off', discordId: 'd-off', surface: 'web' });
const context = {
  page: "Officers' quarters · Tonight",
  selection: { kind: 'raid' as const, id: 'raid-7', label: 'Molten Core, Thu 8pm' },
};

function harness(scripts: ScriptedTurn[]) {
  const clock = fixedClock(Date.UTC(2026, 9, 27, 19));
  const registry = testRegistry<AgentDeps>([...agentCommands, signupList], clock);
  const store = createMemoryAgentStore();
  const deps: AgentDeps = {
    agent: store,
    agentQueue: { enqueue: async () => undefined },
    agentRunner: {
      run: (caller, name, input, confirmToken) =>
        registry.execute({ name, input, caller, ...(confirmToken ? { confirmToken } : {}) }, deps),
    },
  };
  // The stream trails the loop, as it can live: the answer streams after the loop reads it.
  const runtime = createFakeAgentRuntime(scripts, { lagPolls: 0, trails: true });
  const asAgent: Caller = { ...officer, surface: 'agent', onBehalfOf: officer.memberId };
  const tools = createRegistryTools({ registry, deps, caller: asAgent });
  const progress: Pick<AgentRun, 'notes' | 'draft'>[] = [];

  /** The action's turn: the same calls, against memory instead of Convex. */
  async function answer(runId: string, afterTool: () => Promise<void> = async () => undefined) {
    const run = await store.getRun(officer.guildId, runId);
    if (!run) throw new Error('no run');
    await store.updateRun(officer.guildId, runId, { status: 'running' });
    return runTurn({
      runtime,
      request: {
        sessionId: null,
        model: 'gpt-6.1-terra',
        effort: 'medium',
        instructions: 'test',
        tools: REGISTRY_TOOLS,
        input: askInput(run.prompt, {
          surface: run.surface,
          now: clock.now(),
          memberName: 'Ana',
          page: run.context,
        }),
        metadata: { runId },
      },
      sleep: async () => undefined,
      progressMs: 0,
      progressGraceMs: 50,
      executeTool: async (call) => {
        const reply = await recordToolCall(
          store,
          {
            guildId: officer.guildId,
            runId,
            callId: call.callId,
            name: call.name,
            startedAt: call.seenAt,
          },
          clock.now(),
          () => tools.execute(call.name, call.arguments),
        );
        await afterTool();
        return reply;
      },
      onProgress: async (p) => {
        await recordProgress(store, officer.guildId, runId, p);
        const saved = await store.getRun(officer.guildId, runId);
        if (saved) progress.push({ notes: saved.notes, draft: saved.draft });
      },
      isCancelled: async () =>
        (await store.getRun(officer.guildId, runId))?.cancelRequested ?? false,
    });
  }

  const ask = async (question: string) => {
    const result = await registry.execute(
      { name: 'agent-ask', input: { question, thread: 'tab-1', context }, caller: officer },
      deps,
    );
    return (result.data as { runId: string }).runId;
  };
  return { clock, registry, deps, store, runtime, progress, answer, ask };
}

describe('the officers’ side panel, while a question runs', () => {
  it('shows the tool call with its times, a progress note, the answer as written, then the answer', async () => {
    const h = harness([
      {
        notes: ['I’ll read the signups for Thursday.'],
        rounds: [
          [{ name: CALL_TOOL, arguments: { name: 'signup-list', input: { eventId: 'raid-7' } } }],
        ],
        answer: 'Aeryn and Kol are signed up.',
      },
    ]);
    const runId = await h.ask('who is signed up for this raid?');
    const outcome = await h.answer(runId);
    expect(outcome).toMatchObject({ status: 'completed', text: 'Aeryn and Kol are signed up.' });

    // The page context reached the agent with the question.
    expect(h.runtime.starts[0]?.input).toContain(
      'Selected raid: "Molten Core, Thu 8pm" (id raid-7)',
    );

    const run = await h.store.getRun(officer.guildId, runId);
    expect(run?.toolCalls).toEqual([
      {
        name: CALL_TOOL,
        command: 'signup-list',
        success: true,
        summary: 'signup-list',
        error: null,
        startedAt: expect.any(Number),
        finishedAt: h.clock.now(),
      },
    ]);
    expect(run?.notes).toEqual(['I’ll read the signups for Thursday.']);
    // The answer was visible while it was being written, before the run finished.
    expect(
      h.progress.some((p) => p.draft && p.draft.length < 'Aeryn and Kol are signed up.'.length),
    ).toBe(true);
    expect(run?.draft).toBe('Aeryn and Kol are signed up.');

    // The panel reloads the conversation by thread.
    const thread = await h.registry.execute(
      { name: 'agent-runs', input: { thread: 'tab-1' }, caller: officer },
      h.deps,
    );
    expect((thread.data as { id: string }[]).map((r) => r.id)).toEqual([runId]);
  });

  it('stops a question midway when the officer presses Stop', async () => {
    const h = harness([
      {
        rounds: [
          [{ name: CALL_TOOL, arguments: { name: 'signup-list', input: { eventId: 'raid-7' } } }],
          [{ name: CALL_TOOL, arguments: { name: 'signup-list', input: { eventId: 'raid-8' } } }],
        ],
        answer: 'never',
      },
    ]);
    const runId = await h.ask('compare the two raids');
    // Stop after the first tool call, as a click would while the agent works.
    const outcome = await h.answer(runId, async () => {
      const run = await h.store.getRun(officer.guildId, runId);
      if (run?.cancelRequested) return;
      const stopped = await h.registry.execute(
        { name: 'agent-cancel', input: { runId }, caller: officer },
        h.deps,
      );
      expect(stopped.data).toMatchObject({ status: 'stopping' });
    });
    expect(outcome.status).toBe('cancelled');
    expect(h.runtime.cancelled).toEqual([outcome.sessionId]);
    expect((await h.store.getRun(officer.guildId, runId))?.toolCalls).toHaveLength(1);
  });
});
