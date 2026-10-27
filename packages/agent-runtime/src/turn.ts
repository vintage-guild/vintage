// One agent turn, end to end: start (or resume) the session, answer every function call the
// session waits on, and read the final answer. Runs inside a Convex action, which polls the
// session instead of holding a stream or receiving webhooks (measured fine in the #128 spike:
// one tool call answered in 9–12 s).
import type { AgentRuntime, FunctionCall, StartTurnRequest, ToolResult, TurnStatus } from './types';

export interface ToolExecution {
  success: boolean;
  output: string;
  error?: string;
}

export interface TurnOptions {
  runtime: AgentRuntime;
  request: StartTurnRequest;
  /** Runs one function call. Must be idempotent per callId: a retry returns the stored result. */
  executeTool: (call: FunctionCall) => Promise<ToolExecution>;
  /** Gives up and cancels the turn after this long. */
  timeoutMs?: number;
  pollMs?: number;
  /** At most this many tool calls in one turn; further calls get an error result. */
  maxToolCalls?: number;
  /** Retries for a transiently failed API call (network, 429, 5xx) before the turn fails. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface TurnToolCall {
  callId: string;
  name: string;
  success: boolean;
}

export interface TurnOutcome {
  sessionId: string | null;
  status: 'completed' | 'failed' | 'timeout';
  text: string | null;
  error: string | null;
  toolCalls: TurnToolCall[];
  /** True when a resumed session failed to accept input and a new one was created. */
  restarted: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * What a member may read about a failed turn. Raw errors carry session ids and upstream response
 * bodies, so they go to server logs; the run gets one of these.
 */
export function publicTurnError(outcome: Pick<TurnOutcome, 'status' | 'error'>): string {
  if (outcome.status === 'timeout') return 'The agent took too long to answer';
  const status = /^Agents API \S+ \S+ (\d{3})/.exec(outcome.error ?? '')?.[1];
  if (status === '429') return 'The agent is busy right now; try again in a minute';
  if (status) return `The agent service returned an error (${status})`;
  if (outcome.status === 'completed') return 'The agent finished without an answer';
  return 'The agent could not answer';
}

/** Network failures, rate limits, and server errors are worth another try; 4xx answers are not. */
export function isTransient(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return true;
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/** Retry a call that failed transiently, backing off from pollMs. */
async function retrying<T>(options: TurnOptions, call: () => Promise<T>): Promise<T> {
  const { sleep = defaultSleep, pollMs = 500, retries = 3 } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= retries || !isTransient(err)) throw err;
      await sleep(pollMs * 2 ** (attempt + 1));
    }
  }
}

interface Started {
  sessionId: string;
  restarted: boolean;
  /** The turn that was latest before this input; an answer from it is stale. */
  previousTurnId: string | null;
}

async function startTurn(runtime: AgentRuntime, request: StartTurnRequest): Promise<Started> {
  const fresh = async (restarted: boolean) => ({
    ...(await runtime.start({ ...request, sessionId: null })),
    restarted,
    previousTurnId: null,
  });
  if (!request.sessionId) return fresh(false);
  try {
    const previousTurnId = await runtime.latestTurnId(request.sessionId);
    const { sessionId } = await runtime.start(request);
    return { sessionId, restarted: false, previousTurnId };
  } catch {
    // The session expired, was deleted, or is busy: start fresh rather than fail the question.
    return fresh(true);
  }
}

const finished = (status: TurnStatus | null) =>
  status === 'completed' || status === 'failed' || status === 'cancelled';

type Ended = Omit<TurnOutcome, 'sessionId' | 'toolCalls' | 'restarted'>;

interface Loop {
  options: TurnOptions;
  sessionId: string;
  previousTurnId: string | null;
  toolCalls: TurnToolCall[];
  submitted: Set<string>;
  maxToolCalls: number;
}

/** Run one function call, or refuse it once the per-question limit is reached. */
function execute(loop: Loop, call: FunctionCall): Promise<ToolExecution> {
  if (loop.toolCalls.length >= loop.maxToolCalls) {
    return Promise.resolve({
      success: false,
      output: '',
      error: `Too many tool calls in one question (limit ${loop.maxToolCalls}). Answer with what you have.`,
    });
  }
  return loop.options
    .executeTool(call)
    .catch((err) => ({ success: false, output: '', error: describe(err) }));
}

/**
 * Answer the calls the session waits on. A tool result is accepted (202) before it is applied, so
 * calls already answered are skipped. Returns false when there was nothing new to answer.
 */
async function answerCalls(loop: Loop, calls: readonly FunctionCall[]): Promise<boolean> {
  const pending = calls.filter((c) => !loop.submitted.has(c.callId));
  if (!pending.length) return false;
  const results: ToolResult[] = [];
  for (const call of pending) {
    const result = await execute(loop, call);
    loop.toolCalls.push({ callId: call.callId, name: call.name, success: result.success });
    results.push({ turnId: call.turnId, callId: call.callId, ...result });
  }
  await retrying(loop.options, () =>
    loop.options.runtime.submitToolResults(loop.sessionId, results),
  );
  for (const call of pending) loop.submitted.add(call.callId);
  return true;
}

/** An idle session's turn outcome, or null while the turn is still settling. */
async function readAnswer(loop: Loop): Promise<Ended | null> {
  const answer = await retrying(loop.options, () => loop.options.runtime.answer(loop.sessionId));
  // The input is accepted before its turn starts: the previous turn is not this answer.
  if (!answer.turnId || answer.turnId === loop.previousTurnId) return null;
  // `idle` alone is not success: the turn's own status says how it ended.
  if (!finished(answer.turnStatus)) return null;
  if (answer.turnStatus === 'completed') {
    return { status: 'completed', text: answer.text, error: null };
  }
  return {
    status: 'failed',
    text: answer.text,
    error: answer.error ?? `turn ${answer.turnStatus}`,
  };
}

/** Poll until the turn ends, answering function calls on the way. */
async function drive(loop: Loop): Promise<Ended> {
  const {
    runtime,
    timeoutMs = 120_000,
    pollMs = 500,
    sleep = defaultSleep,
    now = Date.now,
  } = loop.options;
  const started = now();
  for (;;) {
    if (now() - started > timeoutMs) {
      await runtime.cancel(loop.sessionId).catch(() => undefined);
      return { status: 'timeout', text: null, error: `no answer after ${timeoutMs} ms` };
    }
    const state = await retrying(loop.options, () => runtime.state(loop.sessionId));
    if (state.status === 'failed') {
      return { status: 'failed', text: null, error: state.error ?? 'session failed' };
    }
    if (state.status === 'requires_action' && (await answerCalls(loop, state.functionCalls))) {
      continue;
    }
    if (state.status === 'idle') {
      const ended = await readAnswer(loop);
      if (ended) return ended;
    }
    await sleep(pollMs);
  }
}

export async function runTurn(options: TurnOptions): Promise<TurnOutcome> {
  const toolCalls: TurnToolCall[] = [];
  let started: Started;
  try {
    started = await startTurn(options.runtime, options.request);
  } catch (err) {
    return {
      sessionId: null,
      status: 'failed',
      text: null,
      error: describe(err),
      toolCalls,
      restarted: false,
    };
  }
  const loop: Loop = {
    options,
    sessionId: started.sessionId,
    previousTurnId: started.previousTurnId,
    toolCalls,
    submitted: new Set(),
    maxToolCalls: options.maxToolCalls ?? 12,
  };
  let ended: Ended;
  try {
    ended = await drive(loop);
  } catch (err) {
    ended = { status: 'failed', text: null, error: describe(err) };
  }
  return { ...ended, sessionId: started.sessionId, toolCalls, restarted: started.restarted };
}
