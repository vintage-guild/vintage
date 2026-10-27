// The Decisions API for module code running in Convex actions (#131). Decisions calls are HTTP,
// so only actions can make them; a command that needs one schedules an action. Every call goes
// through the agent module's ledger: the pause switch and the monthly cap refuse it, and each
// call is a `decision` run labeled with what it was for.
import { usageKey } from '@vintage/agent/contract';
import { createOpenAIDecisions, type DecisionsPort, withLedger } from '@vintage/decisions';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { type ActionCtx, internalMutation, internalQuery } from './_generated/server';
import { GUILD_ID } from './commands';
import { agentStore } from './stores';

/** Null when a Decisions call may go ahead now, or the reason it may not. */
export const refusal = internalQuery({
  args: {},
  handler: async (ctx): Promise<string | null> => {
    const store = agentStore(ctx);
    const config = await store.getConfig(GUILD_ID);
    if (config.paused) return 'the agent is paused';
    const used = await store.getUsage(GUILD_ID, usageKey('decision', Date.now()));
    return used >= config.guildMonthlyDecisions
      ? `this month's ${config.guildMonthlyDecisions} Decisions calls are used`
      : null;
  },
});

export const record = internalMutation({
  args: {
    label: v.string(),
    inputTokens: v.union(v.number(), v.null()),
    model: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { label, inputTokens, model, error }) => {
    const now = Date.now();
    const store = agentStore(ctx);
    await store.bumpUsage(GUILD_ID, usageKey('decision', now));
    await store.insertRun({
      guildId: GUILD_ID,
      kind: 'decision',
      memberId: null,
      surface: 'system',
      threadKey: null,
      label,
      prompt: label,
      status: error ? 'failed' : 'answered',
      answer: null,
      error,
      model,
      sessionId: null,
      toolCalls: [],
      confirmationIds: [],
      inputTokens,
      createdAt: now,
      finishedAt: now,
    });
  },
});

/**
 * A DecisionsPort for one job (`label` names it in the ledger). Null when OPENAI_API_KEY is not
 * set: the caller keeps its non-AI behavior.
 */
export function decisionsFor(ctx: ActionCtx, label: string): DecisionsPort | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return withLedger(createOpenAIDecisions({ apiKey }), {
    refuse: () => ctx.runQuery(internal.decisions.refusal, {}),
    record: async (entry) => {
      await ctx.runMutation(internal.decisions.record, { label, ...entry });
    },
  });
}
