// The hosted guild agent's runtime in Convex (PLAN §3.10, #129). `agent-ask` queues a run and
// schedules `answer`, an action that holds one Agents API turn: it starts or resumes the
// member's session, answers each function call through `tool` (a mutation that runs the registry
// as that member), and records the answer. OpenAI keeps the session; Convex keeps the ledger,
// the session map, and every confirmation. No webhooks: the action polls (the #128 spike measured
// 9–12 s for a question with one tool call).
//   npx convex run agent:answer '{"runId":"…"}'
import { ASK_INSTRUCTIONS, askInput, recordToolCall } from '@vintage/agent/commands';
import { isAgentCommand, SESSION_REUSE_MS } from '@vintage/agent/contract';
import {
  createOpenAIAgents,
  createRegistryTools,
  REGISTRY_TOOLS,
  runTurn,
  type ToolExecution,
} from '@vintage/agent-runtime';
import type { Caller } from '@vintage/guild-kit';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { deps, GUILD_ID, registry } from './commands';
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
  args: { runId: v.string(), callId: v.string(), name: v.string(), args: v.any() },
  handler: (ctx, { runId, callId, name, args }): Promise<ToolExecution> =>
    recordToolCall(
      agentStore(ctx),
      { guildId: GUILD_ID, runId, callId, name },
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
    status: v.union(v.literal('answered'), v.literal('failed')),
    answer: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    sessionId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { runId, status, answer, error, sessionId }) => {
    const store = agentStore(ctx);
    const run = await store.getRun(GUILD_ID, runId);
    if (!run) return null;
    const now = Date.now();
    const saved = await store.updateRun(GUILD_ID, runId, {
      status,
      answer,
      error,
      sessionId,
      finishedAt: now,
    });
    if (run.threadKey && run.memberId) {
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

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Answer one queued question. Scheduled by `agent-ask`; safe to run twice (begin claims it). */
export const answer = internalAction({
  args: { runId: v.string() },
  handler: async (ctx, { runId }): Promise<{ status: string }> => {
    const loaded = await ctx.runQuery(internal.agent.load, { runId });
    if (!loaded) return { status: 'missing' as const };
    if (!(await ctx.runMutation(internal.agent.begin, { runId }))) {
      return { status: 'already-started' as const };
    }
    const fail = (error: string) =>
      ctx.runMutation(internal.agent.finish, {
        runId,
        status: 'failed',
        answer: null,
        error,
        sessionId: null,
      });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      await fail('OPENAI_API_KEY is not set in the Convex environment');
      return { status: 'failed' as const };
    }
    const { run, config, session, memberName } = loaded;
    if (config.paused) {
      await fail('The agent was paused before this question ran');
      return { status: 'failed' as const };
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
          input: askInput(run.prompt, { surface: run.surface, now, memberName }),
          metadata: { guildId: GUILD_ID, runId, memberId: run.memberId ?? '' },
        },
        executeTool: (call) =>
          ctx.runMutation(internal.agent.tool, {
            runId,
            callId: call.callId,
            name: call.name,
            args: call.arguments ?? {},
          }),
      });
      const answered = outcome.status === 'completed' && Boolean(outcome.text);
      if (!answered && outcome.sessionId) {
        // finish drops the session record, so delete the session at OpenAI now or nothing will.
        await runtime.delete(outcome.sessionId).catch(() => undefined);
      }
      await ctx.runMutation(internal.agent.finish, {
        runId,
        status: answered ? 'answered' : 'failed',
        answer: outcome.text,
        error: answered ? null : (outcome.error ?? 'no answer'),
        sessionId: outcome.sessionId,
      });
      console.log(
        `agent run ${runId}: ${outcome.status}, ${outcome.toolCalls.length} tool calls` +
          `${outcome.restarted ? ', new session' : ''}`,
      );
      return { status: outcome.status };
    } catch (err) {
      await fail(describe(err));
      return { status: 'failed' as const };
    }
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
