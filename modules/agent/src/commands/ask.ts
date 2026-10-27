import { error, success, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import { type AgentRun, threadKeyOf, toConfirmationView } from '../contract';
import { BUSY_WINDOW_MS, dayStart, monthStart, refuseAsk } from '../domain/limits';
import { command } from '../store';

export const QUESTION_MAX = 2000;

export const agentAsk = command({
  name: 'agent-ask',
  description:
    'Ask the guild agent a question in plain words ("am I on the roster Thursday?", "who has not ' +
    'answered?"). It answers with the commands you can run; anything that would change data comes ' +
    'back as a confirmation you press. Answers arrive a few seconds later: read them with ' +
    'agent-run-get. Pass `thread` (a channel or chat id) to keep follow-ups in one conversation.',
  tier: 'member',
  mutation: true,
  input: z.object({
    question: z.string().trim().min(1).max(QUESTION_MAX),
    thread: z.string().trim().min(1).max(100).optional(),
  }),
  handler: async (input, { caller, guildId, deps, now }) => {
    if (!caller.memberId) {
      return error('NOT_A_MEMBER', 'Only a guild member can ask the agent', {
        suggestion: 'Sign in with Discord as a guild member',
        retryable: false,
      });
    }
    const at = now();
    const config = await deps.agent.getConfig(guildId);
    const [memberInFlight, memberToday, guildThisMonth] = await Promise.all([
      deps.agent.countRuns(guildId, {
        memberId: caller.memberId,
        kind: 'ask',
        statuses: ['queued', 'running'],
        since: at - BUSY_WINDOW_MS,
      }),
      deps.agent.countRuns(guildId, {
        memberId: caller.memberId,
        kind: 'ask',
        since: dayStart(at),
      }),
      deps.agent.countRuns(guildId, { kind: 'ask', since: monthStart(at) }),
    ]);
    const refusal = refuseAsk(config, { memberInFlight, memberToday, guildThisMonth });
    if (refusal) {
      return error(refusal.code, refusal.message, {
        suggestion: refusal.suggestion,
        retryable: refusal.code === 'AGENT_BUSY',
      });
    }
    const run = await deps.agent.insertRun({
      guildId,
      kind: 'ask',
      memberId: caller.memberId,
      surface: caller.surface,
      threadKey: threadKeyOf(caller.surface, input.thread, caller.memberId),
      label: null,
      prompt: input.question,
      status: 'queued',
      answer: null,
      error: null,
      model: config.model,
      sessionId: null,
      toolCalls: [],
      confirmationIds: [],
      inputTokens: null,
      createdAt: at,
      finishedAt: null,
    });
    await deps.agentQueue.enqueue(guildId, run.id);
    return success(
      { runId: run.id, status: run.status },
      { reasoning: 'Queued; the answer arrives in a few seconds (agent-run-get)' },
    );
  },
});

/** A run as surfaces see it: no session id; confirmations without their tokens. */
const runView = (run: AgentRun) => {
  const { sessionId: _session, ...view } = run;
  return view;
};

export const agentRunGet = command({
  name: 'agent-run-get',
  description:
    "One agent run: its status, the answer once there is one, and any changes waiting for you to confirm. Your own runs; officers see anyone's.",
  tier: 'member',
  input: z.object({ runId: z.string().min(1) }),
  handler: async ({ runId }, { caller, guildId, deps }) => {
    const run = await deps.agent.getRun(guildId, runId);
    const mine = run?.memberId && run.memberId === caller.memberId;
    if (!run || !(mine || tierAllows(caller.tier, 'officer'))) {
      return error('RUN_NOT_FOUND', `No agent run ${runId}`, {
        suggestion: 'Use the runId agent-ask returned',
        retryable: false,
      });
    }
    const confirmations = run.confirmationIds.length
      ? (await deps.agent.listConfirmations(guildId, run.id)).map(toConfirmationView)
      : [];
    return success({ ...runView(run), confirmations });
  },
});

export const agentRuns = command({
  name: 'agent-runs',
  description:
    'The agent ledger, newest first: questions, wording jobs, and Decisions calls, with the commands each ran. Members see their own; officers see everyone and can filter by member or kind.',
  tier: 'member',
  input: z.object({
    memberId: z.string().min(1).optional(),
    kind: z.enum(['ask', 'wording', 'decision']).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  handler: async (input, { caller, guildId, deps }) => {
    const officer = tierAllows(caller.tier, 'officer');
    const memberId = officer ? input.memberId : caller.memberId;
    if (!officer && !memberId) return success([]);
    const runs = await deps.agent.listRuns(guildId, {
      ...(memberId ? { memberId } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      limit: input.limit,
    });
    return success(runs.map(runView));
  },
});
