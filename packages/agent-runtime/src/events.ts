// The Agents API session event stream (`GET /agents/sessions/{id}/events?stream=true`), parsed
// and reduced to `AgentEvent`. Shapes from the live probe on 2026-10-26: every frame has
// `event:` and `data:` lines, and the data is JSON with a `type` and a `turn_id`.
//   agent.session.turn.created / in_progress / completed / failed / cancelled  → { turn }
//   agent.session.turn.item.added            → { item: { type: 'message', id, role, phase } }
//   agent.session.turn.output_text.delta     → { item_id, delta }
//   agent.session.turn.output_text.done      → { item_id, text }
//   agent.session.idle
// Other events (content parts, function-call items, session status) are ignored here: the turn
// loop reads tool calls from the session itself.
import type { AgentEvent, TurnStatus } from './types';

const TURN_STATUS: Record<string, TurnStatus> = {
  'agent.session.turn.created': 'queued',
  'agent.session.turn.in_progress': 'in_progress',
  'agent.session.turn.completed': 'completed',
  'agent.session.turn.failed': 'failed',
  'agent.session.turn.cancelled': 'cancelled',
};

type Wire = {
  type?: string;
  turn_id?: string;
  item_id?: string;
  delta?: string;
  text?: string;
  turn?: { id?: string; created_at?: number | null };
  item?: { type?: string; id?: string; role?: string; phase?: string | null };
};

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function messageEvent(w: Wire, turnId: string): AgentEvent | null {
  const item = w.item;
  if (item?.type !== 'message' || !str(item.id)) return null;
  const phase = item.phase === 'commentary' || item.phase === 'final_answer' ? item.phase : null;
  return { type: 'message', turnId, itemId: item.id, role: item.role ?? '', phase };
}

/** One parsed `data:` payload as an AgentEvent, or null when progress doesn't need it. */
export function toAgentEvent(data: unknown): AgentEvent | null {
  if (!data || typeof data !== 'object') return null;
  const w = data as Wire;
  if (w.type === 'agent.session.idle') return { type: 'idle' };
  const turnId = w.turn_id ?? w.turn?.id;
  if (!str(w.type) || !str(turnId)) return null;
  const status = TURN_STATUS[w.type];
  if (status) return turnEvent(w, turnId, status);
  if (w.type === 'agent.session.turn.item.added') return messageEvent(w, turnId);
  return textEvent(w, turnId);
}

function turnEvent(w: Wire, turnId: string, status: TurnStatus): AgentEvent {
  const createdAt = typeof w.turn?.created_at === 'number' ? w.turn.created_at * 1000 : null;
  return { type: 'turn', turnId, status, createdAt };
}

function textEvent(w: Wire, turnId: string): AgentEvent | null {
  if (!str(w.item_id)) return null;
  if (w.type === 'agent.session.turn.output_text.delta' && typeof w.delta === 'string') {
    return { type: 'delta', turnId, itemId: w.item_id, delta: w.delta };
  }
  if (w.type === 'agent.session.turn.output_text.done' && typeof w.text === 'string') {
    return { type: 'text', turnId, itemId: w.item_id, text: w.text };
  }
  return null;
}

/**
 * Split a server-sent-events buffer into complete frames' `data` payloads (joined when a frame
 * has several `data:` lines) and the unfinished rest.
 */
export function splitSse(buffer: string): { frames: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const frames: string[] = [];
  let start = 0;
  for (;;) {
    const end = normalized.indexOf('\n\n', start);
    if (end < 0) break;
    const data = normalized
      .slice(start, end)
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''));
    if (data.length) frames.push(data.join('\n'));
    start = end + 2;
  }
  return { frames, rest: normalized.slice(start) };
}

/** Read a streamed response body as AgentEvents until it ends or `signal` aborts. */
export async function* readAgentEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<AgentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const stop = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener('abort', stop, { once: true });
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = splitSse(buffer);
      buffer = rest;
      for (const frame of frames) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(frame);
        } catch {
          continue;
        }
        const event = toAgentEvent(parsed);
        if (event) yield event;
      }
    }
  } finally {
    signal.removeEventListener('abort', stop);
    stop();
  }
}
