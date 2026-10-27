// The Decisions API for module code running in Convex actions (#131). Decisions calls are HTTP,
// so only actions can make them; a command that needs one schedules an action. Every call goes
// through the agent module's ledger: the pause switch and the monthly cap refuse it, and each
// call is a `decision` run labeled with what it was for.
import { decisionsBudgetAlert } from '@vintage/agent/commands';
import { usageKey } from '@vintage/agent/contract';
import { createOpenAIDecisions, type DecisionsPort, withLedger } from '@vintage/decisions';
import { createDiscordRest } from '@vintage/discord-kit';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { GUILD_ID } from './commands';
import { agentStore, coordinatorStore } from './stores';

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
    const used = await store.bumpUsage(GUILD_ID, usageKey('decision', now));
    const cap = (await store.getConfig(GUILD_ID)).guildMonthlyDecisions;
    const alert = decisionsBudgetAlert(used, cap);
    if (alert)
      await ctx.scheduler.runAfter(0, internal.decisions.budgetAlert, { alert, used, cap });
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
      context: null,
      notes: [],
      draft: null,
      cancelRequested: false,
      createdAt: now,
      finishedAt: now,
    });
  },
});

/** The officers' ops channel (the coordinator's), or null when none is set. */
export const opsChannel = internalQuery({
  args: {},
  handler: async (ctx): Promise<string | null> =>
    (await coordinatorStore(ctx).getConfig(GUILD_ID)).opsChannelId ?? null,
});

/**
 * Tell the officers the month's Decisions budget is running out (#145): labels on applications
 * and signup-note triage stop quietly once it is used up, whatever used it.
 */
export const budgetAlert = internalAction({
  args: {
    alert: v.union(v.literal('warning'), v.literal('used-up')),
    used: v.number(),
    cap: v.number(),
  },
  handler: async (ctx, { alert, used, cap }): Promise<string> => {
    const channelId = await ctx.runQuery(internal.decisions.opsChannel, {});
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!channelId || !token) return 'no channel';
    const count = `${used.toLocaleString('en-US')} of ${cap.toLocaleString('en-US')}`;
    const content =
      alert === 'used-up'
        ? `This month's Decisions calls are used up (${count}). Application labels and signup-note triage are off until the 1st (UTC). Raise the cap with \`agent-config-set guildMonthlyDecisions\`.`
        : `${count} of this month's Decisions calls are used. At the cap, application labels and signup-note triage stop until the 1st (UTC). Check what used them with \`agent-runs kind:decision\`.`;
    await createDiscordRest({ token }).createMessage(channelId, {
      content,
      allowed_mentions: { parse: [] },
    });
    return alert;
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
