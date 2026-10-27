// The OpenAI Agents API over fetch (beta header `agents=v1`). Shapes follow openai@7.39.0's
// `beta.agents` types, checked against the live API in the 2026-10-26 spike (#128). Two
// differences from the SDK types: `spend_control` is rejected as an unknown parameter, and token
// usage on sessions and turns comes back null, so spend is capped by counting questions instead.
import { readAgentEvents } from './events';
import type {
  AgentRuntime,
  FunctionCall,
  SessionState,
  SessionStatus,
  StartTurnRequest,
  TurnAnswer,
  TurnStatus,
} from './types';

export interface OpenAIAgentsOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class AgentsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AgentsApiError';
  }
}

interface WireSession {
  id: string;
  status: SessionStatus;
  error: string | null;
  required_actions?: {
    type: string;
    turn_id?: string;
    call_id?: string;
    name?: string;
    arguments?: unknown;
  }[];
}

interface WireTurn {
  id: string;
  status: TurnStatus;
  error: unknown;
}

interface WireItem {
  type: string;
  role?: string;
  phase?: 'commentary' | 'final_answer' | null;
  content?: { type: string; text?: string }[];
}

const errorText = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  const message = (value as { message?: unknown }).message;
  return typeof message === 'string' ? message : JSON.stringify(value).slice(0, 300);
};

const textOf = (item: WireItem) =>
  (item.content ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

/** The final answer of the latest turn; items arrive newest first. */
export function finalText(items: readonly WireItem[]): string | null {
  const assistant = items.filter((i) => i.type === 'message' && i.role === 'assistant');
  const final = assistant.find((i) => i.phase === 'final_answer') ?? assistant[0];
  const text = final ? textOf(final) : '';
  return text || null;
}

export function readFunctionCalls(session: WireSession): FunctionCall[] {
  return (session.required_actions ?? [])
    .filter((a) => a.type === 'function_call' && a.call_id && a.turn_id && a.name)
    .map((a) => ({
      turnId: a.turn_id as string,
      callId: a.call_id as string,
      name: a.name as string,
      arguments: a.arguments ?? {},
    }));
}

export function createOpenAIAgents(options: OpenAIAgentsOptions): AgentRuntime {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const res = await doFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
        'OpenAI-Beta': 'agents=v1',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new AgentsApiError(
        `Agents API ${method} ${path} ${res.status}: ${text.slice(0, 300)}`,
        res.status,
      );
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  const message = (input: string) => [
    { role: 'user', content: [{ type: 'input_text', text: input }] },
  ];

  return {
    async start(request: StartTurnRequest) {
      if (request.sessionId) {
        await call('POST', `/agents/sessions/${request.sessionId}/events`, {
          events: [{ type: 'agent.session.input.message', input: message(request.input) }],
        });
        return { sessionId: request.sessionId };
      }
      const session = await call<WireSession>('POST', '/agents/sessions', {
        environment: { type: 'none' },
        agent: {
          model: request.model,
          reasoning: { effort: request.effort },
          instructions: request.instructions,
          tools: request.tools.map((t) => ({ type: 'function', ...t })),
        },
        input: request.input,
        metadata: request.metadata,
      });
      return { sessionId: session.id };
    },

    async state(sessionId): Promise<SessionState> {
      const session = await call<WireSession>('GET', `/agents/sessions/${sessionId}`);
      return {
        status: session.status,
        functionCalls: readFunctionCalls(session),
        error: errorText(session.error),
      };
    },

    async submitToolResults(sessionId, results) {
      if (!results.length) return;
      // A retry after a dropped connection must not apply the same results twice.
      const key = `tool-results:${results.map((r) => r.callId).join(',')}`;
      await call(
        'POST',
        `/agents/sessions/${sessionId}/events`,
        {
          events: results.map((r) => ({
            type: 'agent.session.input.tool_result',
            turn_id: r.turnId,
            call_id: r.callId,
            success: r.success,
            output: r.output,
            ...(r.error ? { error: r.error } : {}),
          })),
        },
        key.slice(0, 255),
      );
    },

    async answer(sessionId): Promise<TurnAnswer> {
      const turns = await call<{ data: WireTurn[] }>(
        'GET',
        `/agents/sessions/${sessionId}/turns?order=desc&limit=1`,
      );
      const turn = turns.data?.[0];
      const items = await call<{ data: WireItem[] }>(
        'GET',
        `/agents/sessions/${sessionId}/items?order=desc&limit=20`,
      );
      return {
        turnId: turn?.id ?? null,
        turnStatus: turn?.status ?? null,
        text: finalText(items.data ?? []),
        error: errorText(turn?.error),
      };
    },

    async latestTurnId(sessionId) {
      const turns = await call<{ data: WireTurn[] }>(
        'GET',
        `/agents/sessions/${sessionId}/turns?order=desc&limit=1`,
      );
      return turns.data?.[0]?.id ?? null;
    },

    async cancel(sessionId) {
      await call('POST', `/agents/sessions/${sessionId}/events`, {
        events: [{ type: 'agent.session.input.cancel' }],
      });
    },

    async delete(sessionId) {
      try {
        await call('DELETE', `/agents/sessions/${sessionId}`);
      } catch (err) {
        // Already gone is fine; anything else is the caller's to log.
        if (!(err instanceof AgentsApiError && err.status === 404)) throw err;
      }
    },

    async *events(sessionId, signal) {
      const res = await doFetch(`${baseUrl}/agents/sessions/${sessionId}/events?stream=true`, {
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          accept: 'text/event-stream',
          'OpenAI-Beta': 'agents=v1',
        },
        signal,
      });
      if (!res.ok || !res.body) {
        throw new AgentsApiError(`Agents API GET events ${res.status}`, res.status);
      }
      yield* readAgentEvents(res.body, signal);
    },
  };
}
