// A scripted AgentRuntime for tests. Each started turn plays one script: zero or more rounds of
// function calls, then a final answer (or a failure). Records everything Vintage sends.
//
// Like the live API (found in the local run for #129), input sent to an existing session is
// accepted before its turn starts: for the next `lagPolls` state reads the session still looks
// idle and the latest turn is the previous one.
import type {
  AgentRuntime,
  FunctionCall,
  SessionState,
  StartTurnRequest,
  ToolResult,
  TurnAnswer,
} from './types';

export interface ScriptedTurn {
  /** Each round is the set of calls the session waits on before the next. */
  rounds?: { name: string; arguments?: unknown }[][];
  answer?: string;
  /** End the turn as failed instead of answering. */
  fail?: string;
}

interface TurnRecord {
  id: string;
  script: ScriptedTurn;
  round: number;
  pending: FunctionCall[];
}

interface SessionRecord {
  id: string;
  turns: TurnRecord[];
  /** Turns sent but not yet started: state reads left before the newest turn becomes visible. */
  lag: number;
}

export interface FakeAgentRuntime extends AgentRuntime {
  starts: StartTurnRequest[];
  submitted: ToolResult[];
  deleted: string[];
  cancelled: string[];
  sessions: Map<string, SessionRecord>;
  /** Make `start` on an existing session throw, as if it expired. */
  expire(sessionId: string): void;
}

export function createFakeAgentRuntime(
  scripts: ScriptedTurn[],
  options: { lagPolls?: number } = {},
): FakeAgentRuntime {
  const lagPolls = options.lagPolls ?? 1;
  const queue = [...scripts];
  const sessions = new Map<string, SessionRecord>();
  const expired = new Set<string>();
  const starts: StartTurnRequest[] = [];
  const submitted: ToolResult[] = [];
  const deleted: string[] = [];
  const cancelled: string[] = [];
  let next = 1;

  const load = (session: SessionRecord, turn: TurnRecord) => {
    const round = turn.script.rounds?.[turn.round] ?? [];
    turn.pending = round.map((call, i) => ({
      turnId: turn.id,
      callId: `${turn.id}-r${turn.round}-c${i}`,
      name: call.name,
      arguments: call.arguments ?? {},
    }));
    void session;
  };
  const begin = (session: SessionRecord) => {
    const turn: TurnRecord = {
      id: `${session.id}-turn${session.turns.length + 1}`,
      script: queue.shift() ?? { answer: 'ok' },
      round: 0,
      pending: [],
    };
    load(session, turn);
    session.turns.push(turn);
  };
  const find = (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('session not found');
    return session;
  };
  /** The turn the API would report as latest right now. */
  const visible = (session: SessionRecord) =>
    session.turns[session.turns.length - 1 - (session.lag > 0 ? 1 : 0)] ?? null;

  return {
    starts,
    submitted,
    deleted,
    cancelled,
    sessions,
    expire: (id) => expired.add(id),
    async start(request) {
      starts.push(structuredClone(request));
      if (request.sessionId) {
        const existing = sessions.get(request.sessionId);
        if (!existing || expired.has(request.sessionId)) throw new Error('session not found');
        begin(existing);
        existing.lag = lagPolls;
        return { sessionId: existing.id };
      }
      const session: SessionRecord = { id: `sess_${next++}`, turns: [], lag: 0 };
      sessions.set(session.id, session);
      begin(session);
      return { sessionId: session.id };
    },
    async state(sessionId): Promise<SessionState> {
      const session = find(sessionId);
      if (session.lag > 0) {
        session.lag--;
        return { status: 'idle', functionCalls: [], error: null };
      }
      const turn = visible(session);
      if (turn?.pending.length && !turn.script.fail) {
        return { status: 'requires_action', functionCalls: turn.pending, error: null };
      }
      return { status: 'idle', functionCalls: [], error: null };
    },
    async submitToolResults(sessionId, results) {
      const session = find(sessionId);
      submitted.push(...results);
      const turn = session.turns.find((t) => t.id === results[0]?.turnId);
      if (!turn) throw new Error('turn not found');
      const answered = new Set(results.map((r) => r.callId));
      turn.pending = turn.pending.filter((c) => !answered.has(c.callId));
      if (!turn.pending.length) {
        turn.round++;
        load(session, turn);
      }
    },
    async latestTurnId(sessionId) {
      return visible(find(sessionId))?.id ?? null;
    },
    async answer(sessionId): Promise<TurnAnswer> {
      const turn = visible(find(sessionId));
      if (!turn) return { turnId: null, turnStatus: null, text: null, error: null };
      if (turn.pending.length && !turn.script.fail) {
        return { turnId: turn.id, turnStatus: 'waiting', text: null, error: null };
      }
      if (turn.script.fail) {
        return { turnId: turn.id, turnStatus: 'failed', text: null, error: turn.script.fail };
      }
      return {
        turnId: turn.id,
        turnStatus: 'completed',
        text: turn.script.answer ?? null,
        error: null,
      };
    },
    async cancel(sessionId) {
      cancelled.push(sessionId);
    },
    async delete(sessionId) {
      deleted.push(sessionId);
      sessions.delete(sessionId);
    },
  };
}
