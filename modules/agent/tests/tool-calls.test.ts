import { describe, expect, it } from 'vitest';
import { CONFIRM_WINDOW_MS, usageKey } from '../src/contract';
import { recordToolCall, type ToolCallOutcome } from '../src/domain/tool-calls';
import { createMemoryAgentStore } from '../src/testing';

const NOW = Date.UTC(2026, 9, 27, 18, 30);
const GUILD = 'guild-test';

async function queuedRun(
  store: ReturnType<typeof createMemoryAgentStore>,
  memberId: string | null = 'm1',
) {
  return store.insertRun({
    guildId: GUILD,
    kind: 'ask',
    memberId,
    surface: 'web',
    threadKey: null,
    label: null,
    prompt: 'q',
    status: 'running',
    answer: null,
    error: null,
    model: null,
    sessionId: null,
    toolCalls: [],
    confirmationIds: [],
    inputTokens: null,
    createdAt: NOW,
    finishedAt: null,
  });
}

const prepared = (confirmToken: string | null): ToolCallOutcome => ({
  success: true,
  output: '{"pendingConfirmation":true}',
  command: 'signup-set',
  confirmation: {
    command: 'signup-set',
    input: { eventId: 'r1', status: 'tentative' },
    confirmToken,
    preview: null,
    summary: 'signup-set: eventId r1, status tentative',
  },
});

describe('recordToolCall', () => {
  it('stores a prepared change as the asking member, logs the call, and keeps the token', async () => {
    const store = createMemoryAgentStore();
    const run = await queuedRun(store);
    const reply = await recordToolCall(
      store,
      { guildId: GUILD, runId: run.id, callId: 'c1', name: 'afd-call' },
      NOW,
      async () => prepared('tok'),
    );
    expect(reply).toEqual({ success: true, output: '{"pendingConfirmation":true}' });
    const saved = await store.getRun(GUILD, run.id);
    expect(saved?.toolCalls).toEqual([{ name: 'afd-call', command: 'signup-set', success: true }]);
    const [confirmation] = await store.listConfirmations(GUILD, run.id);
    expect(confirmation).toMatchObject({
      memberId: 'm1',
      confirmToken: 'tok',
      status: 'pending',
      expiresAt: NOW + CONFIRM_WINDOW_MS.destructive,
    });
    expect(saved?.confirmationIds).toEqual([confirmation?.id]);
  });

  it('runs a call id once: a retry returns the stored reply and makes no second change', async () => {
    const store = createMemoryAgentStore();
    const run = await queuedRun(store);
    let executed = 0;
    const execute = async () => {
      executed++;
      return prepared(null);
    };
    const key = { guildId: GUILD, runId: run.id, callId: 'c1', name: 'afd-call' };
    const first = await recordToolCall(store, key, NOW, execute);
    const again = await recordToolCall(store, key, NOW + 1000, execute);
    expect(again).toEqual(first);
    expect(executed).toBe(1);
    expect(await store.listConfirmations(GUILD, run.id)).toHaveLength(1);
    expect((await store.getRun(GUILD, run.id))?.toolCalls).toHaveLength(1);
    const [confirmation] = await store.listConfirmations(GUILD, run.id);
    expect(confirmation?.expiresAt).toBe(NOW + CONFIRM_WINDOW_MS.other);
  });

  it('answers an error when the member left or the run is gone, without executing', async () => {
    const store = createMemoryAgentStore();
    const run = await queuedRun(store);
    const left = await recordToolCall(
      store,
      { guildId: GUILD, runId: run.id, callId: 'c1', name: 'afd-call' },
      NOW,
      async () => null,
    );
    expect(left).toMatchObject({
      success: false,
      error: 'The asking member is no longer in the guild',
    });

    let executed = false;
    const gone = await recordToolCall(
      store,
      { guildId: GUILD, runId: 'run-missing', callId: 'c2', name: 'afd-call' },
      NOW,
      async () => {
        executed = true;
        return prepared(null);
      },
    );
    expect(gone.success).toBe(false);
    expect(executed).toBe(false);

    const systemRun = await queuedRun(store, null);
    await recordToolCall(
      store,
      { guildId: GUILD, runId: systemRun.id, callId: 'c3', name: 'afd-call' },
      NOW,
      async () => {
        executed = true;
        return prepared(null);
      },
    );
    expect(executed).toBe(false);
    expect(await store.listConfirmations(GUILD, systemRun.id)).toEqual([]);
  });
});

describe('usage counters', () => {
  it('count per guild and calendar month', async () => {
    const store = createMemoryAgentStore();
    const october = usageKey('decision', NOW);
    expect(october).toBe('decision:2026-10');
    expect(await store.bumpUsage(GUILD, october)).toBe(1);
    expect(await store.bumpUsage(GUILD, october)).toBe(2);
    expect(await store.getUsage(GUILD, october)).toBe(2);
    expect(await store.getUsage('other-guild', october)).toBe(0);
    expect(await store.getUsage(GUILD, usageKey('decision', Date.UTC(2026, 10, 1)))).toBe(0);
  });
});
