// The hosted guild agent's runtime in Convex (PLAN §3.10, #129). `agent-ask` queues a run and
// schedules `answer`, an action that holds one Agents API turn: it starts or resumes the
// member's session, answers each function call through `tool` (a mutation that runs the registry
// as that member), and records the answer. OpenAI keeps the session; Convex keeps the ledger,
// the session map, and every confirmation. No webhooks: the action polls (the #128 spike measured
// 9–12 s for a question with one tool call).
//   npx convex run agent:answer '{"runId":"…"}'
import {
  ASK_INSTRUCTIONS,
  askInput,
  recordProgress,
  recordToolCall,
  renderAgentReply,
  routeQuestion,
} from '@vintage/agent/commands';
import {
  type AgentDelivery,
  isAgentCommand,
  SESSION_REUSE_MS,
  toConfirmationView,
} from '@vintage/agent/contract';
import {
  type AgentRuntime,
  createOpenAIAgents,
  createRegistryTools,
  publicTurnError,
  REGISTRY_TOOLS,
  runTurn,
  type ToolExecution,
  type TurnOutcome,
} from '@vintage/agent-runtime';
import { createDiscordRest } from '@vintage/discord-kit';
import type { Caller } from '@vintage/guild-kit';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { deps, GUILD_ID, registry } from './commands';
import { decisionsFor } from './decisions';
import { agentStore, identityStore } from './stores';

/** Everything `answer` needs to start a turn, read in one query. */
export const load = internalQuery({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const store = agentStore(ctx);
    const run = await store.getRun(GUILD_ID, runId);
    if (!run) return null;
    const config = await store.getConfig(GUILD_ID);
    const session = run.threadKey ? await store.getSession(GUILD_ID, run.threadKey) : null;
    const member = run.memberId ? await identityStore(ctx).getMember(GUILD_ID, run.memberId) : null;
    return {
      run,
      config,
      session,
      memberName: member?.displayName ?? null,
      memberTier: member?.tier ?? 'public',
    };
  },
});

export const begin = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const store = agentStore(ctx);
    const run = await store.getRun(GUILD_ID, runId);
    // Only a queued run starts: a retried schedule never runs a question twice.
    if (run?.status !== 'queued') return false;
    await store.updateRun(GUILD_ID, runId, { status: 'running' });
    return true;
  },
});

/** The member the run acts for, as a caller on the `agent` surface. Null if they left. */
async function memberCaller(
  ctx: Parameters<typeof identityStore>[0],
  memberId: string,
): Promise<Caller | null> {
  const member = await identityStore(ctx).getMember(GUILD_ID, memberId);
  if (!member || member.tier === 'public') return null;
  return {
    surface: 'agent',
    guildId: GUILD_ID,
    tier: member.tier,
    memberId: member.id,
    discordId: member.discordId,
    onBehalfOf: member.id,
  };
}

/**
 * One function call, run as the asking member. Idempotent per call id: the stored result is
 * returned on a retry, so a mutation-preparing call never makes two confirmations.
 */
export const tool = internalMutation({
  args: {
    runId: v.string(),
    callId: v.string(),
    name: v.string(),
    args: v.any(),
    startedAt: v.optional(v.number()),
  },
  handler: (ctx, { runId, callId, name, args, startedAt }): Promise<ToolExecution> =>
    recordToolCall(
      agentStore(ctx),
      { guildId: GUILD_ID, runId, callId, name, startedAt: startedAt ?? null },
      Date.now(),
      async (run) => {
        const caller = run.memberId ? await memberCaller(ctx, run.memberId) : null;
        if (!caller) return null;
        const tools = createRegistryTools({
          registry: registry(),
          deps: deps(ctx),
          caller,
          hidden: isAgentCommand,
        });
        return tools.execute(name, args);
      },
    ),
});

export const finish = internalMutation({
  args: {
    runId: v.string(),
    status: v.union(v.literal('answered'), v.literal('failed'), v.literal('cancelled')),
    answer: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    sessionId: v.union(v.string(), v.null()),
    label: v.optional(v.union(v.string(), v.null())),
    /** The router answered without a turn: the conversation's session is untouched. */
    keepSession: v.optional(v.boolean()),
  },
  handler: async (ctx, { runId, status, answer, error, sessionId, label, keepSession }) => {
    const store = agentStore(ctx);
    const run = await store.getRun(GUILD_ID, runId);
    if (!run) return null;
    const now = Date.now();
    const saved = await store.updateRun(GUILD_ID, runId, {
      status,
      answer,
      error,
      sessionId,
      // The answer replaces the draft; the notes stay as the turn's record.
      draft: null,
      finishedAt: now,
      ...(label === undefined ? {} : { label }),
    });
    if (run.threadKey && run.memberId && !keepSession) {
      if (sessionId && status === 'answered') {
        const existing = await store.getSession(GUILD_ID, run.threadKey);
        await store.putSession({
          guildId: GUILD_ID,
          threadKey: run.threadKey,
          memberId: run.memberId,
          sessionId,
          createdAt: existing?.sessionId === sessionId ? existing.createdAt : now,
          lastUsedAt: now,
        });
      } else {
        await store.deleteSession(GUILD_ID, run.threadKey);
      }
    }
    return saved;
  },
});

/** The turn's progress so far, while the run is still running (a late write never undoes finish). */
export const progress = internalMutation({
  args: { runId: v.string(), notes: v.array(v.string()), draft: v.union(v.string(), v.null()) },
  handler: (ctx, { runId, notes, draft }) =>
    recordProgress(agentStore(ctx), GUILD_ID, runId, { notes, draft }),
});

/** Whether agent-cancel asked this run to stop. */
export const stopRequested = internalQuery({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) =>
    (await agentStore(ctx).getRun(GUILD_ID, runId))?.cancelRequested ?? false,
});

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Record a finished turn. OpenAI keeps sessions until deleted, and the sweep only knows the ones in
 * the map: delete a failed run's session (finish drops its record) and the one a restart replaced.
 * Members see a safe reason; the raw error goes to the logs.
 */
async function settle(
  ctx: ActionCtx,
  runtime: AgentRuntime,
  runId: string,
  replaced: string | null,
  outcome: TurnOutcome,
  label: string | null,
) {
  const answered = outcome.status === 'completed' && Boolean(outcome.text);
  const stopped = outcome.status === 'cancelled';
  // A stopped turn's session is dropped like a failed one: the next question starts clean.
  if (!answered && outcome.sessionId) {
    await runtime.delete(outcome.sessionId).catch(() => undefined);
  }
  if (outcome.restarted && replaced) await runtime.delete(replaced).catch(() => undefined);
  if (!answered && !stopped) {
    console.log(`agent run ${runId} failed: ${outcome.error ?? 'no answer'}`);
  }
  await ctx.runMutation(internal.agent.finish, {
    runId,
    status: answered ? 'answered' : stopped ? 'cancelled' : 'failed',
    answer: outcome.text,
    error: answered ? null : publicTurnError(outcome),
    sessionId: outcome.sessionId,
    label,
  });
  console.log(
    `agent run ${runId}: ${outcome.status}, ${outcome.toolCalls.length} tool calls` +
      `${outcome.restarted ? ', new session' : ''}`,
  );
}

/** Run one queued question to its end: router, then (when needed) one agent turn. */
async function runAnswer(ctx: ActionCtx, runId: string): Promise<string> {
  const loaded = await ctx.runQuery(internal.agent.load, { runId });
  if (!loaded) return 'missing';
  if (!(await ctx.runMutation(internal.agent.begin, { runId }))) return 'already-started';
  const fail = async (error: string) => {
    await ctx.runMutation(internal.agent.finish, {
      runId,
      status: 'failed',
      answer: null,
      error,
      sessionId: null,
    });
    return 'failed';
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail('The agent is not set up yet (no OpenAI key on the server)');
  const { run, config, session, memberName, memberTier } = loaded;
  if (config.paused) return fail('The agent was paused before this question ran');

  // The router answers off-topic questions and officer-only requests without a turn (#133).
  const route = await routeQuestion(
    decisionsFor(ctx, 'ask-router'),
    run.prompt,
    memberTier,
    GUILD_ID,
  );
  // Stop pressed while the router ran: end here, before a session or turn is opened.
  if (await ctx.runQuery(internal.agent.stopRequested, { runId })) {
    await ctx.runMutation(internal.agent.finish, {
      runId,
      status: 'cancelled',
      answer: null,
      error: 'Stopped',
      sessionId: null,
      keepSession: true,
    });
    return 'cancelled';
  }

  if (route.reply) {
    await ctx.runMutation(internal.agent.finish, {
      runId,
      status: 'answered',
      answer: route.reply,
      error: null,
      sessionId: null,
      label: route.label,
      keepSession: true,
    });
    return 'routed';
  }

  const now = Date.now();
  const reuse = session && now - session.lastUsedAt < SESSION_REUSE_MS ? session.sessionId : null;
  try {
    const runtime = createOpenAIAgents({ apiKey });
    const outcome = await runTurn({
      runtime,
      request: {
        sessionId: reuse,
        model: config.model,
        effort: config.effort,
        instructions: ASK_INSTRUCTIONS,
        tools: REGISTRY_TOOLS,
        input: askInput(run.prompt, { surface: run.surface, now, memberName, page: run.context }),
        metadata: { guildId: GUILD_ID, runId, memberId: run.memberId ?? '' },
      },
      executeTool: (call) =>
        ctx.runMutation(internal.agent.tool, {
          runId,
          callId: call.callId,
          name: call.name,
          args: call.arguments ?? {},
          ...(call.seenAt === undefined ? {} : { startedAt: call.seenAt }),
        }),
      onProgress: async ({ notes, draft }) => {
        await ctx.runMutation(internal.agent.progress, { runId, notes, draft });
      },
      isCancelled: () => ctx.runQuery(internal.agent.stopRequested, { runId }),
    });
    await settle(ctx, runtime, runId, reuse, outcome, route.label);
    return outcome.status;
  } catch (err) {
    console.log(`agent run ${runId} failed: ${describe(err)}`);
    return fail('The agent could not answer');
  }
}

/** The finished run as a member sees it, for delivery. */
export const view = internalQuery({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const store = agentStore(ctx);
    const run = await store.getRun(GUILD_ID, runId);
    if (!run) return null;
    const confirmations = (await store.listConfirmations(GUILD_ID, runId)).map(toConfirmationView);
    return { status: run.status, answer: run.answer, error: run.error, confirmations };
  },
});

/** Edit the member's private "thinking" reply with the answer and any Confirm buttons. */
async function deliver(ctx: ActionCtx, runId: string, delivery: AgentDelivery) {
  const reply = await ctx.runQuery(internal.agent.view, { runId });
  if (!reply) return;
  try {
    await createDiscordRest().editOriginalResponse(
      delivery.applicationId,
      delivery.token,
      renderAgentReply(reply),
    );
  } catch (err) {
    // The token expired (15 minutes) or Discord refused it: the answer is still in the ledger.
    console.log(`agent run ${runId}: could not deliver to Discord: ${describe(err)}`);
  }
}

const deliveryArg = v.object({
  kind: v.literal('discord'),
  applicationId: v.string(),
  token: v.string(),
});

/**
 * Answer one queued question, then deliver it where it was asked. Scheduled by `agent-ask`;
 * safe to run twice (begin claims the run, and a second run delivers nothing new).
 */
export const answer = internalAction({
  args: { runId: v.string(), delivery: v.optional(deliveryArg) },
  handler: async (ctx, { runId, delivery }): Promise<{ status: string }> => {
    const status = await runAnswer(ctx, runId);
    if (delivery && status !== 'already-started' && status !== 'missing') {
      await deliver(ctx, runId, delivery);
    }
    return { status };
  },
});

export const idleSessions = internalQuery({
  args: { before: v.number() },
  handler: (ctx, { before }) => agentStore(ctx).listIdleSessions(GUILD_ID, before),
});

export const dropSession = internalMutation({
  args: { threadKey: v.string(), sessionId: v.string() },
  handler: async (ctx, { threadKey, sessionId }) => {
    const store = agentStore(ctx);
    const current = await store.getSession(GUILD_ID, threadKey);
    // A follow-up may have reused the key with a new session since the sweep read it.
    if (current?.sessionId === sessionId) await store.deleteSession(GUILD_ID, threadKey);
  },
});

export const expireConfirmations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const store = agentStore(ctx);
    const now = Date.now();
    const expired = await store.listExpiredConfirmations(GUILD_ID, now);
    for (const c of expired) {
      await store.updateConfirmation(GUILD_ID, c.id, { status: 'expired', finishedAt: now });
    }
    return expired.length;
  },
});

/**
 * Hourly: delete Agents API sessions nobody has used for an hour (OpenAI keeps them until
 * deleted) and close confirmations whose window passed.
 */
export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ deleted: number; expired: number }> => {
    const expired: number = await ctx.runMutation(internal.agent.expireConfirmations, {});
    const apiKey = process.env.OPENAI_API_KEY;
    const idle = await ctx.runQuery(internal.agent.idleSessions, {
      before: Date.now() - 2 * SESSION_REUSE_MS,
    });
    let deleted = 0;
    if (apiKey) {
      const runtime = createOpenAIAgents({ apiKey });
      for (const s of idle) {
        try {
          await runtime.delete(s.sessionId);
          await ctx.runMutation(internal.agent.dropSession, {
            threadKey: s.threadKey,
            sessionId: s.sessionId,
          });
          deleted++;
        } catch (err) {
          console.log(`agent sweep: could not delete ${s.sessionId}: ${describe(err)}`);
        }
      }
    }
    console.log(`agent sweep: ${deleted} sessions deleted, ${expired} confirmations expired`);
    return { deleted, expired };
  },
});
