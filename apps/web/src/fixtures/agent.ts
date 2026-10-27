// A fake Random for the dev fixtures (#168): no OpenAI, but the same ledger and the same real
// commands. Each question plays one short turn the way the live agent does: a progress note, a
// real read (or a prepared change, for "lock"), then the answer written in two steps. Stop is
// honored between steps. The officers' panel reads it through the real agent commands.

import type { AgentStore } from '@vintage/agent/commands';
import { recordProgress, recordToolCall } from '@vintage/agent/commands';
import { type AgentRun, isAgentCommand } from '@vintage/agent/contract';
import { CALL_TOOL, createRegistryTools } from '@vintage/agent-runtime';
import type { Caller, GuildRegistry } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';

/** Pause between steps, so the panel shows each one. */
const STEP_MS = 600;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FixtureAgentPorts<Deps> {
  store: AgentStore;
  registry: () => GuildRegistry<Deps>;
  deps: () => Deps;
  member: (guildId: string, memberId: string) => Promise<Member | null>;
}

/** Which real command the fake reads (or prepares) for a question. */
function pick(run: AgentRun): { name: string; input: Record<string, unknown>; note: string } {
  const raid = run.context?.selection?.kind === 'raid' ? run.context.selection : null;
  if (raid && /\block\b/i.test(run.prompt)) {
    return {
      name: 'roster-lock',
      input: { eventId: raid.id },
      note: `I’ll prepare locking ${raid.label}.`,
    };
  }
  if (raid) {
    return {
      name: 'signup-list',
      input: { eventId: raid.id },
      note: `I’ll read the signups for ${raid.label}.`,
    };
  }
  return { name: 'raid-list', input: {}, note: 'I’ll check the upcoming raids.' };
}

/** A few names from a read's answer, whatever shape it has. */
function namesIn(output: string): string[] {
  try {
    const data = (JSON.parse(output) as { data?: unknown }).data;
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((r) => {
        const row = r as Record<string, unknown> & { event?: { name?: string } };
        return String(row.characterName ?? row.name ?? row.displayName ?? row.event?.name ?? '');
      })
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function answerFor(name: string, output: string, prepared: boolean): string {
  if (prepared)
    return 'I prepared that change. Press **Confirm** to do it, or **Drop** to leave it.';
  const names = namesIn(output);
  if (!names.length) return 'I found nothing to list there.';
  const what = name === 'signup-list' ? 'Signed up' : 'Coming up';
  return `**${what}:**\n${names.map((n) => `- ${n}`).join('\n')}\n\n_This is the development fixtures’ stand-in for Random._`;
}

export function createFixtureAgent<Deps>(ports: FixtureAgentPorts<Deps>) {
  const { store } = ports;
  const stopped = async (g: string, runId: string) => {
    const run = await store.getRun(g, runId);
    if (!run?.cancelRequested) return false;
    await store.updateRun(g, runId, {
      status: 'cancelled',
      error: 'Stopped',
      draft: null,
      finishedAt: Date.now(),
    });
    return true;
  };

  async function play(g: string, runId: string): Promise<void> {
    const run = await store.getRun(g, runId);
    if (run?.status !== 'queued' || !run.memberId) return;
    await store.updateRun(g, runId, { status: 'running' });
    const member = await ports.member(g, run.memberId);
    if (!member) return;
    const caller: Caller = {
      surface: 'agent',
      guildId: g,
      tier: member.tier,
      memberId: member.id,
      discordId: member.discordId,
      onBehalfOf: member.id,
    };
    const choice = pick(run);

    await wait(STEP_MS);
    if (await stopped(g, runId)) return;
    await recordProgress(store, g, runId, { notes: [choice.note], draft: null });

    await wait(STEP_MS);
    if (await stopped(g, runId)) return;
    const startedAt = Date.now();
    const tools = createRegistryTools({
      registry: ports.registry(),
      deps: ports.deps(),
      caller,
      hidden: isAgentCommand,
    });
    let output = '';
    let prepared = false;
    await recordToolCall(
      store,
      { guildId: g, runId, callId: 'fixture-1', name: CALL_TOOL, startedAt },
      Date.now(),
      async () => {
        const result = await tools.execute(CALL_TOOL, { name: choice.name, input: choice.input });
        output = result.output;
        prepared = result.confirmation !== null;
        return result;
      },
    );

    const answer = answerFor(choice.name, output, prepared);
    const half = Math.ceil(answer.length / 2);
    for (const draft of [answer.slice(0, half), answer]) {
      await wait(STEP_MS);
      if (await stopped(g, runId)) return;
      await recordProgress(store, g, runId, { notes: [choice.note], draft });
    }
    await store.updateRun(g, runId, {
      status: 'answered',
      answer,
      draft: null,
      finishedAt: Date.now(),
    });
  }

  return {
    /** The agent queue: play the turn on its own, like the scheduled action. */
    enqueue: async (guildId: string, runId: string) => {
      void play(guildId, runId).catch((err: unknown) => {
        void store.updateRun(guildId, runId, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'The fixture agent failed',
          finishedAt: Date.now(),
        });
      });
    },
  };
}
