// Short AI wording for system posts (#130): one Agents API turn with no tools, at low effort,
// on the guild's question model. Counted in the agent ledger as a `wording` run and against the
// guild's monthly cap; refused while the agent is paused. Callers keep their template on null.
import { monthStart } from '@vintage/agent/commands';
import { WORDING_EFFORT } from '@vintage/agent/contract';
import { createOpenAIAgents, runTurn } from '@vintage/agent-runtime';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { type ActionCtx, internalMutation } from './_generated/server';
import { GUILD_ID } from './commands';
import { agentStore } from './stores';

/** Open a wording run, or null when the agent is paused or the month's cap is used. */
export const start = internalMutation({
  args: { label: v.string(), prompt: v.string() },
  handler: async (ctx, { label, prompt }) => {
    const store = agentStore(ctx);
    const config = await store.getConfig(GUILD_ID);
    if (config.paused) return null;
    const now = Date.now();
    const used = await store.countRuns(GUILD_ID, { kind: 'wording', since: monthStart(now) });
    if (used >= config.guildMonthlyAsks) return null;
    const run = await store.insertRun({
      guildId: GUILD_ID,
      kind: 'wording',
      memberId: null,
      surface: 'system',
      threadKey: null,
      label,
      prompt: prompt.slice(0, 2000),
      status: 'running',
      answer: null,
      error: null,
      model: config.model,
      sessionId: null,
      toolCalls: [],
      confirmationIds: [],
      inputTokens: null,
      context: null,
      notes: [],
      draft: null,
      cancelRequested: false,
      createdAt: now,
      finishedAt: null,
    });
    return { runId: run.id, model: config.model };
  },
});

export const finish = internalMutation({
  args: {
    runId: v.string(),
    answer: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { runId, answer, error }) => {
    await agentStore(ctx).updateRun(GUILD_ID, runId, {
      status: answer ? 'answered' : 'failed',
      answer,
      error,
      finishedAt: Date.now(),
    });
  },
});

/** Reword `facts` per `instructions`; null on no key, paused, capped, or any failure. */
export async function writeWording(
  ctx: ActionCtx,
  label: string,
  instructions: string,
  facts: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const started = await ctx.runMutation(internal.wording.start, { label, prompt: facts });
  if (!started) return null;
  const runtime = createOpenAIAgents({ apiKey });
  const outcome = await runTurn({
    runtime,
    request: {
      sessionId: null,
      model: started.model,
      effort: WORDING_EFFORT,
      instructions,
      tools: [],
      input: facts,
      metadata: { guildId: GUILD_ID, runId: started.runId, kind: 'wording' },
    },
    executeTool: async () => ({ success: false, output: '', error: 'No tools for wording' }),
    timeoutMs: 60_000,
  });
  // One-off: nothing reuses a wording session.
  if (outcome.sessionId) await runtime.delete(outcome.sessionId).catch(() => undefined);
  const text = outcome.status === 'completed' ? outcome.text : null;
  await ctx.runMutation(internal.wording.finish, {
    runId: started.runId,
    answer: text,
    error: text ? null : (outcome.error ?? 'no text'),
  });
  return text;
}
