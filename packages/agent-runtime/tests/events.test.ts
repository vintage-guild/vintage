// The session event stream, from payloads shaped like the live API's (probe, 2026-10-26).
import { describe, expect, it } from 'vitest';
import { readAgentEvents, splitSse, toAgentEvent } from '../src/events';

const turn = (type: string, createdAt = 1793083401) => ({
  type: `agent.session.turn.${type}`,
  event_id: 'evt_1',
  session_id: 'sess_1',
  turn_id: 'turn_1',
  turn: { id: 'turn_1', status: type, created_at: createdAt, error: null, usage: null },
});
const added = (phase: string | null, role = 'assistant') => ({
  type: 'agent.session.turn.item.added',
  turn_id: 'turn_1',
  output_index: 0,
  item: { type: 'message', id: 'msg_1', role, content: [], status: 'in_progress', phase },
});
const delta = {
  type: 'agent.session.turn.output_text.delta',
  turn_id: 'turn_1',
  item_id: 'msg_1',
  delta: 'I’ll',
};
const done = {
  type: 'agent.session.turn.output_text.done',
  turn_id: 'turn_1',
  item_id: 'msg_1',
  text: 'I’ll check.',
};

describe('toAgentEvent', () => {
  it('keeps the turn, message, text, and idle events progress needs', () => {
    expect(toAgentEvent(turn('created'))).toEqual({
      type: 'turn',
      turnId: 'turn_1',
      status: 'queued',
      createdAt: 1793083401000,
    });
    expect(toAgentEvent(turn('completed'))).toMatchObject({ type: 'turn', status: 'completed' });
    expect(toAgentEvent(added('commentary'))).toEqual({
      type: 'message',
      turnId: 'turn_1',
      itemId: 'msg_1',
      role: 'assistant',
      phase: 'commentary',
    });
    expect(toAgentEvent(added('final_answer'))).toMatchObject({ phase: 'final_answer' });
    expect(toAgentEvent(delta)).toEqual({
      type: 'delta',
      turnId: 'turn_1',
      itemId: 'msg_1',
      delta: 'I’ll',
    });
    expect(toAgentEvent(done)).toEqual({
      type: 'text',
      turnId: 'turn_1',
      itemId: 'msg_1',
      text: 'I’ll check.',
    });
    expect(toAgentEvent({ type: 'agent.session.idle', session: {} })).toEqual({ type: 'idle' });
  });

  it('drops what progress does not use', () => {
    expect(
      toAgentEvent({ type: 'agent.session.turn.content_part.added', turn_id: 't', item_id: 'm' }),
    ).toBeNull();
    expect(toAgentEvent({ type: 'agent.session.requires_action', session: {} })).toBeNull();
    expect(
      toAgentEvent({
        type: 'agent.session.turn.item.added',
        turn_id: 't',
        item: { type: 'function_call', id: 'x' },
      }),
    ).toBeNull();
    expect(toAgentEvent(null)).toBeNull();
    expect(toAgentEvent('text')).toBeNull();
  });
});

describe('splitSse', () => {
  it('returns complete frames and keeps the unfinished rest', () => {
    const { frames, rest } = splitSse(
      'event: a\ndata: {"x":1}\n\nevent: b\r\ndata: {"y":\r\ndata: 2}\r\n\r\nevent: c\ndata: {"z"',
    );
    expect(frames).toEqual(['{"x":1}', '{"y":\n2}']);
    expect(rest).toBe('event: c\ndata: {"z"');
  });
});

describe('readAgentEvents', () => {
  it('reads events across chunk boundaries', async () => {
    const frame = (data: unknown) => `event: e\ndata: ${JSON.stringify(data)}\n\n`;
    const text = frame(turn('created')) + frame(added('commentary')) + frame(delta) + frame(done);
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split mid-frame, as the network does.
        controller.enqueue(encoder.encode(text.slice(0, 50)));
        controller.enqueue(encoder.encode(text.slice(50)));
        controller.close();
      },
    });
    const seen: string[] = [];
    for await (const event of readAgentEvents(body, new AbortController().signal))
      seen.push(event.type);
    expect(seen).toEqual(['turn', 'message', 'delta', 'text']);
  });
});

describe('readAgentEvents, stopped', () => {
  it('ends when the signal aborts, even while the stream stays open', async () => {
    const frame = `event: e\ndata: ${JSON.stringify(turn('created'))}\n\n`;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frame));
        // Never closes, like a live session stream between turns.
      },
    });
    const controller = new AbortController();
    const seen: string[] = [];
    for await (const event of readAgentEvents(body, controller.signal)) {
      seen.push(event.type);
      controller.abort();
    }
    expect(seen).toEqual(['turn']);
  });
});
