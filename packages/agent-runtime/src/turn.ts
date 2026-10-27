// One agent turn, end to end: start (or resume) the session, answer every function call the
// session waits on, and read the final answer. Runs inside a Convex action, which polls the
// session for tool calls and the outcome (measured fine in the #128 spike: one tool call
// answered in 9–12 s). Progress for a surface comes from the session's event stream on the side
// (`watchProgress`); the turn never waits on it, so a dropped stream only loses progress.
import type {
  AgentEvent,
  AgentRuntime,
  FunctionCall,
  StartTurnRequest,
  ToolResult,
  TurnStatus,
} from './types';

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
  /** Progress while the turn runs: notes and the answer so far. Never awaited by the loop. */
  onProgress?: (progress: TurnProgress) => Promise<void> | void;
  /** At most one progress report per this many ms, except when a message finishes. */
  progressMs?: number;
  /** After the turn ends, wait at most this long for the stream to catch up (default 1.5 s). */
  progressGraceMs?: number;
  /** Checked on every poll: true cancels the turn upstream and ends it as `cancelled`. */
  isCancelled?: () => Promise<boolean>;
}

/** What a surface can show before the answer: the agent's progress notes and its answer so far. */
export interface TurnProgress {
  /** `commentary` messages, in order ("I'll check Thursday's signups"). The last may be partial. */
  notes: string[];
  /** The final answer while it is being written, or null before it starts. */
  draft: string | null;
}

export interface TurnToolCall {
  callId: string;
  name: string;
  success: boolean;
}

export interface TurnOutcome {
  sessionId: string | null;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
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
  if (outcome.status === 'cancelled') return 'Stopped';
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
  const seenAt = (loop.options.now ?? Date.now)();
  for (const call of pending) call.seenAt ??= seenAt;
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

/**
 * Ends the turn early: the member asked to stop (agent-cancel), or it ran past its time. Either
 * way the turn is cancelled upstream.
 */
async function cutShort(loop: Loop, started: number): Promise<Ended | null> {
  const { timeoutMs = 120_000, now = Date.now, isCancelled } = loop.options;
  let ended: Ended | null = null;
  if (isCancelled && (await isCancelled().catch(() => false))) {
    ended = { status: 'cancelled', text: null, error: null };
  } else if (now() - started > timeoutMs) {
    ended = { status: 'timeout', text: null, error: `no answer after ${timeoutMs} ms` };
  }
  if (ended) await loop.options.runtime.cancel(loop.sessionId).catch(() => undefined);
  return ended;
}

/** Poll until the turn ends, answering function calls on the way. */
async function drive(loop: Loop): Promise<Ended> {
  const { runtime, pollMs = 500, sleep = defaultSleep, now = Date.now } = loop.options;
  const started = now();
  for (;;) {
    const early = await cutShort(loop, started);
    if (early) return early;
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
  const startedAt = (options.now ?? Date.now)();
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
  const watch = watchProgress(options, started.sessionId, {
    previousTurnId: started.previousTurnId,
    // Only a reused session replays turns from before this one.
    reused: Boolean(options.request.sessionId) && !started.restarted,
    startedAt,
  });
  let ended: Ended;
  try {
    ended = await drive(loop);
  } catch (err) {
    ended = { status: 'failed', text: null, error: describe(err) };
  }
  // Every progress write lands before the caller records the outcome.
  await watch.stop();
  return { ...ended, sessionId: started.sessionId, toolCalls, restarted: started.restarted };
}

/** The longest stop() waits for the stream to close or a progress write to finish. */
const STOP_WAIT_MS = 1000;

/** A turn started more than this before the run is an earlier turn of a reused session. */
const TURN_CLOCK_SLACK_MS = 5000;

interface Message {
  phase: 'commentary' | 'final_answer' | null;
  text: string;
}

/** Notes and draft from this turn's assistant messages, in the order they were added. */
export function progressOf(messages: Iterable<Message>): TurnProgress {
  const notes: string[] = [];
  let draft: string | null = null;
  for (const m of messages) {
    const text = m.text.trim();
    if (!text) continue;
    if (m.phase === 'final_answer') draft = text;
    else notes.push(text);
  }
  return { notes, draft };
}

/**
 * Follow the session's event stream and report this turn's progress, throttled. Turns that are
 * not this one (the replayed history of a reused session) are ignored: the previous turn by id,
 * older ones by when they were created.
 */
interface WatchFrom {
  previousTurnId: string | null;
  /** The session existed before this turn, so its earlier turns replay first. */
  reused: boolean;
  /** When runTurn began, before the session was started or resumed. */
  startedAt: number;
}

/** Settles after `ms`, whatever the other promise does. */
const within = (promise: Promise<unknown>, ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    void promise.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });

function watchProgress(
  options: TurnOptions,
  sessionId: string,
  { previousTurnId, reused, startedAt }: WatchFrom,
): { stop: () => Promise<void> } {
  const { runtime, onProgress } = options;
  if (!runtime.events || !onProgress) return { stop: async () => undefined };
  const now = options.now ?? Date.now;
  const progressMs = options.progressMs ?? 750;
  const controller = new AbortController();
  const ours = new Set<string>();
  const messages = new Map<string, Message>();
  let sent = '';
  let lastSent = 0;
  let writes: Promise<void> = Promise.resolve();

  const report = (force: boolean) => {
    const progress = progressOf(messages.values());
    const key = JSON.stringify(progress);
    if (key === sent || (!force && now() - lastSent < progressMs)) return;
    sent = key;
    lastSent = now();
    writes = writes.then(() => onProgress(progress)).catch(() => undefined);
  };

  // The stream can trail the poll loop: when the loop is done, wait a moment for this turn's own
  // end event so its last notes land, then stop.
  let ended: () => void = () => undefined;
  const turnEnded = new Promise<void>((resolve) => {
    ended = resolve;
  });
  const claimTurn = (turnId: string, createdAt: number | null, status: TurnStatus) => {
    // created_at is whole seconds on the API's clock: only a reused session needs it.
    const fresh = !reused || createdAt === null || createdAt >= startedAt - TURN_CLOCK_SLACK_MS;
    if (turnId !== previousTurnId && fresh) ours.add(turnId);
    if (ours.has(turnId) && finished(status)) ended();
  };
  const addText = (itemId: string, text: string, done: boolean) => {
    const message = messages.get(itemId);
    if (!message) return;
    message.text = done ? text : message.text + text;
    report(done);
  };
  const handle = (event: AgentEvent) => {
    if (event.type === 'turn') return claimTurn(event.turnId, event.createdAt, event.status);
    if (event.type === 'idle' || !ours.has(event.turnId)) return;
    if (event.type === 'message') {
      if (event.role === 'assistant') messages.set(event.itemId, { phase: event.phase, text: '' });
      return;
    }
    if (event.type === 'delta') addText(event.itemId, event.delta, false);
    else addText(event.itemId, event.text, true);
  };

  const reading = (async () => {
    try {
      for await (const event of runtime.events!(sessionId, controller.signal)) handle(event);
    } catch {
      // The stream dropped or was stopped: progress ends, the turn carries on.
    }
    ended();
  })();

  return {
    stop: async () => {
      await within(turnEnded, options.progressGraceMs ?? 1500);
      controller.abort();
      // A stream that ignores abort, or a write that never returns, must not hold the answer:
      // a write that lands later is refused because the run has ended.
      await within(reading, STOP_WAIT_MS);
      report(true);
      await within(writes, STOP_WAIT_MS);
    },
  };
}
