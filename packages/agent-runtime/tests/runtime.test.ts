import { commandsFor, success } from '@vintage/guild-kit';
import { makeCaller, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CALL_TOOL,
  createOpenAIAgents,
  createRegistryTools,
  DETAIL_TOOL,
  DISCOVER_TOOL,
  finalText,
  isTransient,
  publicTurnError,
  runTurn,
  type StartTurnRequest,
  summarize,
} from '../src/index';
import { createFakeAgentRuntime } from '../src/testing';

const request: StartTurnRequest = {
  sessionId: null,
  model: 'gpt-6.1-terra',
  effort: 'medium',
  instructions: 'Be brief.',
  tools: [],
  input: 'When is the next raid?',
  metadata: { guildId: 'g1' },
};

const noSleep = async () => undefined;

describe('runTurn', () => {
  it('answers each round of function calls, then returns the final answer', async () => {
    const runtime = createFakeAgentRuntime([
      {
        rounds: [[{ name: 'raid_next' }], [{ name: 'a' }, { name: 'b' }]],
        answer: 'Molten Core, Thursday.',
      },
    ]);
    const seen: string[] = [];
    const outcome = await runTurn({
      runtime,
      request,
      sleep: noSleep,
      executeTool: async (call) => {
        seen.push(call.name);
        return { success: true, output: `{"tool":"${call.name}"}` };
      },
    });
    expect(outcome).toMatchObject({ status: 'completed', text: 'Molten Core, Thursday.' });
    expect(seen).toEqual(['raid_next', 'a', 'b']);
    expect(runtime.submitted.map((r) => r.output)).toEqual([
      '{"tool":"raid_next"}',
      '{"tool":"a"}',
      '{"tool":"b"}',
    ]);
    expect(outcome.toolCalls).toHaveLength(3);
  });

  it('reports a tool that throws as a failed result and keeps going', async () => {
    const runtime = createFakeAgentRuntime([{ rounds: [[{ name: 'boom' }]], answer: 'sorry' }]);
    const outcome = await runTurn({
      runtime,
      request,
      sleep: noSleep,
      executeTool: async () => {
        throw new Error('kaboom');
      },
    });
    expect(outcome.status).toBe('completed');
    expect(runtime.submitted[0]).toMatchObject({ success: false, error: 'kaboom' });
  });

  it('caps tool calls per question', async () => {
    const runtime = createFakeAgentRuntime([
      { rounds: [[{ name: 'x' }], [{ name: 'x' }], [{ name: 'x' }]], answer: 'done' },
    ]);
    let ran = 0;
    await runTurn({
      runtime,
      request,
      sleep: noSleep,
      maxToolCalls: 2,
      executeTool: async () => {
        ran++;
        return { success: true, output: '{}' };
      },
    });
    expect(ran).toBe(2);
    expect(runtime.submitted[2]).toMatchObject({ success: false });
  });

  it('treats a failed turn as failure even though the session is idle', async () => {
    const runtime = createFakeAgentRuntime([{ fail: 'model error' }]);
    const outcome = await runTurn({
      runtime,
      request,
      sleep: noSleep,
      executeTool: async () => ({ success: true, output: '' }),
    });
    expect(outcome).toMatchObject({ status: 'failed', error: 'model error' });
  });

  it('starts a new session when the saved one will not take input', async () => {
    const runtime = createFakeAgentRuntime([{ answer: 'first' }, { answer: 'second' }]);
    const first = await runTurn({
      runtime,
      request,
      sleep: noSleep,
      executeTool: async () => ({ success: true, output: '' }),
    });
    runtime.expire(first.sessionId as string);
    const second = await runTurn({
      runtime,
      request: { ...request, sessionId: first.sessionId },
      sleep: noSleep,
      executeTool: async () => ({ success: true, output: '' }),
    });
    expect(second).toMatchObject({ status: 'completed', text: 'second', restarted: true });
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('never answers a follow-up with the previous turn (input is accepted before its turn starts)', async () => {
    const runtime = createFakeAgentRuntime(
      [
        { answer: 'Molten Core is Thursday.' },
        { rounds: [[{ name: 'signup' }]], answer: 'Press Confirm.' },
      ],
      { lagPolls: 2 },
    );
    const execute = async () => ({ success: true, output: '{}' });
    const first = await runTurn({ runtime, request, sleep: noSleep, executeTool: execute });
    const second = await runTurn({
      runtime,
      request: { ...request, sessionId: first.sessionId, input: 'Sign me up as tentative.' },
      sleep: noSleep,
      executeTool: execute,
    });
    expect(second).toMatchObject({ status: 'completed', text: 'Press Confirm.', restarted: false });
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.toolCalls.map((c) => c.name)).toEqual(['signup']);
  });

  it('retries a dropped connection while polling, but not a 4xx answer', async () => {
    const runtime = createFakeAgentRuntime([{ answer: 'ok' }, { answer: 'never' }]);
    const real = runtime.state.bind(runtime);
    let drops = 2;
    runtime.state = async (id) => {
      if (drops-- > 0) throw new TypeError('connection reset');
      return real(id);
    };
    const ok = await runTurn({
      runtime,
      request,
      sleep: noSleep,
      executeTool: async () => ({ success: true, output: '' }),
    });
    expect(ok).toMatchObject({ status: 'completed', text: 'ok' });

    runtime.state = async () => {
      throw Object.assign(new Error('bad request'), { status: 400 });
    };
    const bad = await runTurn({
      runtime,
      request,
      sleep: noSleep,
      executeTool: async () => ({ success: true, output: '' }),
    });
    expect(bad).toMatchObject({ status: 'failed', error: 'bad request' });
  });

  it('cancels and times out when the session never settles', async () => {
    let clock = 0;
    const runtime = createFakeAgentRuntime([]);
    runtime.state = async () => ({ status: 'in_progress', functionCalls: [], error: null });
    const outcome = await runTurn({
      runtime,
      request,
      timeoutMs: 1000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      executeTool: async () => ({ success: true, output: '' }),
    });
    expect(outcome.status).toBe('timeout');
    expect(runtime.cancelled).toEqual([outcome.sessionId]);
  });
});

type Deps = { log: string[] };
const command = commandsFor<Deps>();
const commands = [
  command({
    name: 'raid-list',
    description: 'Upcoming raids.',
    tier: 'member',
    input: z.object({}),
    handler: async () => success([{ id: 'r1', name: 'Molten Core' }]),
  }),
  command({
    name: 'signup-set',
    description: 'Answer for a raid.',
    tier: 'member',
    mutation: true,
    input: z.object({ eventId: z.string(), status: z.enum(['going', 'tentative']) }),
    handler: async (input, { deps }) => {
      deps.log.push(`signup ${input.status}`);
      return success(input);
    },
  }),
  command({
    name: 'raid-cancel',
    description: 'Cancel a raid.',
    tier: 'member',
    destructive: true,
    input: z.object({ eventId: z.string() }),
    handler: async (input, { deps, dryRun }) => {
      if (!dryRun) deps.log.push(`cancel ${input.eventId}`);
      return success({ wouldCancel: input.eventId });
    },
  }),
  command({
    name: 'agent-ask',
    description: 'Ask the agent.',
    tier: 'member',
    mutation: true,
    input: z.object({}),
    handler: async () => success(null),
  }),
  command({
    name: 'guild-roles-set',
    description: 'Officers only.',
    tier: 'officer',
    mutation: true,
    input: z.object({}),
    handler: async () => success(null),
  }),
];

function tools() {
  const deps: Deps = { log: [] };
  const caller = makeCaller('raider', { surface: 'agent' });
  const t = createRegistryTools({
    registry: testRegistry(commands),
    deps,
    caller,
    hidden: (name) => name.startsWith('agent-'),
  });
  return { t, deps };
}

describe('createRegistryTools', () => {
  it('discovers only what the member may run, minus hidden commands', async () => {
    const { t } = tools();
    const result = await t.execute(DISCOVER_TOOL, {});
    const names = (JSON.parse(result.output) as { name: string }[]).map((c) => c.name);
    expect(names).toEqual(['raid-cancel', 'raid-list', 'signup-set']);
  });

  it('describes a command input as JSON Schema', async () => {
    const { t } = tools();
    const result = await t.execute(DETAIL_TOOL, { name: 'signup-set' });
    const detail = JSON.parse(result.output);
    expect(detail.needsConfirmation).toBe(true);
    expect(detail.input.properties.status.enum).toEqual(['going', 'tentative']);
    expect((await t.execute(DETAIL_TOOL, { name: 'guild-roles-set' })).success).toBe(false);
  });

  it('runs read commands and returns their result', async () => {
    const { t } = tools();
    const result = await t.execute(CALL_TOOL, { name: 'raid-list', input: {} });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.output).data[0].name).toBe('Molten Core');
    expect(result.confirmation).toBeNull();
  });

  it('never runs a mutation: it prepares a confirmation', async () => {
    const { t, deps } = tools();
    const result = await t.execute(CALL_TOOL, {
      name: 'signup-set',
      input: { eventId: 'r1', status: 'tentative' },
    });
    expect(deps.log).toEqual([]);
    expect(result.confirmation).toMatchObject({
      command: 'signup-set',
      input: { eventId: 'r1', status: 'tentative' },
      confirmToken: null,
      summary: 'signup-set: status tentative',
    });
    expect(JSON.parse(result.output).pendingConfirmation).toBe(true);
  });

  it('previews a destructive command with its confirm token, without running it', async () => {
    const { t, deps } = tools();
    const result = await t.execute(CALL_TOOL, { name: 'raid-cancel', input: { eventId: 'r1' } });
    expect(deps.log).toEqual([]);
    expect(result.confirmation?.preview).toEqual({ wouldCancel: 'r1' });
    expect(result.confirmation?.confirmToken).toEqual(expect.any(String));
    // The agent sees the preview but never the token.
    expect(result.output).not.toContain(result.confirmation?.confirmToken as string);
  });

  it('rejects invalid input, hidden commands, and commands above the tier', async () => {
    const { t } = tools();
    expect(
      (await t.execute(CALL_TOOL, { name: 'signup-set', input: { eventId: 'r1', status: 'x' } }))
        .confirmation,
    ).toBeNull();
    expect(
      JSON.parse((await t.execute(CALL_TOOL, { name: 'agent-ask', input: {} })).output).error.code,
    ).toBe('COMMAND_NOT_FOUND');
    expect((await t.execute(CALL_TOOL, { name: 'guild-roles-set', input: {} })).success).toBe(
      false,
    );
  });

  it('accepts arguments as a JSON string', async () => {
    const { t } = tools();
    const result = await t.execute(CALL_TOOL, JSON.stringify({ name: 'raid-list', input: {} }));
    expect(result.success).toBe(true);
  });
});

describe('createOpenAIAgents', () => {
  it('creates a session with function tools and the beta header', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const runtime = createOpenAIAgents({
      apiKey: 'sk-test',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: 'sess_1', status: 'in_progress', error: null }), {
          status: 201,
        });
      }) as typeof fetch,
    });
    const { sessionId } = await runtime.start({
      ...request,
      tools: [{ name: 'raid_next', description: 'd', parameters: { type: 'object' } }],
    });
    expect(sessionId).toBe('sess_1');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['OpenAI-Beta']).toBe('agents=v1');
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).toMatchObject({
      environment: { type: 'none' },
      agent: { model: 'gpt-6.1-terra', reasoning: { effort: 'medium' } },
      input: 'When is the next raid?',
    });
    expect(body.agent.tools[0]).toMatchObject({ type: 'function', name: 'raid_next' });
    expect(body.spend_control).toBeUndefined();
  });

  it('reads function calls and the final answer in the API shape', async () => {
    const replies: Record<string, unknown> = {
      'GET /agents/sessions/s1': {
        id: 's1',
        status: 'requires_action',
        error: null,
        required_actions: [
          { type: 'function_call', turn_id: 't1', call_id: 'c1', name: 'raid_next', arguments: {} },
        ],
      },
      'GET /agents/sessions/s1/turns?order=desc&limit=1': {
        data: [{ id: 't1', status: 'completed', error: null }],
      },
      'GET /agents/sessions/s1/items?order=desc&limit=20': {
        data: [
          {
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            content: [{ type: 'output_text', text: 'Thursday.' }],
          },
          { type: 'function_call_output' },
          {
            type: 'message',
            role: 'assistant',
            phase: 'commentary',
            content: [{ type: 'output_text', text: 'Checking.' }],
          },
        ],
      },
    };
    const posted: unknown[] = [];
    const runtime = createOpenAIAgents({
      apiKey: 'sk-test',
      baseUrl: '',
      fetch: (async (url: string, init: RequestInit) => {
        if (init.method === 'POST') {
          posted.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 202 });
        }
        return new Response(JSON.stringify(replies[`${init.method} ${url}`]), { status: 200 });
      }) as typeof fetch,
    });
    const state = await runtime.state('s1');
    expect(state.functionCalls).toEqual([
      { turnId: 't1', callId: 'c1', name: 'raid_next', arguments: {} },
    ]);
    await runtime.submitToolResults('s1', [
      { turnId: 't1', callId: 'c1', success: true, output: '{}' },
    ]);
    expect(posted[0]).toEqual({
      events: [
        {
          type: 'agent.session.input.tool_result',
          turn_id: 't1',
          call_id: 'c1',
          success: true,
          output: '{}',
        },
      ],
    });
    expect(await runtime.answer('s1')).toEqual({
      turnId: 't1',
      turnStatus: 'completed',
      text: 'Thursday.',
      error: null,
    });
  });

  it('sends an idempotency key with tool results', async () => {
    const seen: Record<string, string>[] = [];
    const runtime = createOpenAIAgents({
      apiKey: 'sk-test',
      baseUrl: '',
      fetch: (async (_url: string, init: RequestInit) => {
        seen.push(init.headers as Record<string, string>);
        return new Response(null, { status: 202 });
      }) as typeof fetch,
    });
    await runtime.submitToolResults('s1', [
      { turnId: 't', callId: 'c1', success: true, output: '' },
    ]);
    expect(seen[0]?.['Idempotency-Key']).toBe('tool-results:c1');
    expect(isTransient(new TypeError('reset'))).toBe(true);
    expect(isTransient({ status: 503 })).toBe(true);
    expect(isTransient({ status: 404 })).toBe(false);
  });

  it('tells members a safe reason, never the raw error', () => {
    const raw = 'Agents API GET /agents/sessions/sess_SECRET 400: {"error":{"message":"bad"}}';
    expect(publicTurnError({ status: 'failed', error: raw })).toBe(
      'The agent service returned an error (400)',
    );
    expect(publicTurnError({ status: 'failed', error: raw })).not.toContain('sess_');
    expect(publicTurnError({ status: 'timeout', error: 'no answer after 120000 ms' })).toMatch(
      /too long/,
    );
    expect(
      publicTurnError({ status: 'failed', error: 'Agents API POST /x 429: slow down' }),
    ).toMatch(/busy/);
    expect(publicTurnError({ status: 'failed', error: 'connection reset' })).toBe(
      'The agent could not answer',
    );
  });

  it('treats a destructive command as a change even when it says mutation: false', async () => {
    const odd = command({
      name: 'thing-wipe',
      description: 'Wipe.',
      tier: 'member',
      destructive: true,
      mutation: false,
      input: z.object({}),
      handler: async (_i, { deps, dryRun }) => {
        if (!dryRun) deps.log.push('wiped');
        return success({ wouldWipe: true });
      },
    });
    const deps: Deps = { log: [] };
    const t = createRegistryTools({
      registry: testRegistry([odd]),
      deps,
      caller: makeCaller('member'),
    });
    const result = await t.execute(CALL_TOOL, { name: 'thing-wipe', input: {} });
    expect(result.confirmation?.confirmToken).toEqual(expect.any(String));
    expect(result.output).not.toContain(result.confirmation?.confirmToken as string);
    expect(deps.log).toEqual([]);
  });

  it('falls back to the last assistant message when there is no final answer', () => {
    expect(
      finalText([
        {
          type: 'message',
          role: 'assistant',
          phase: null,
          content: [{ type: 'output_text', text: 'hi' }],
        },
      ]),
    ).toBe('hi');
    expect(finalText([])).toBeNull();
  });
});

describe('summarize', () => {
  it('leaves ids out of the line a member reads', () => {
    expect(
      summarize('signup-set', {
        eventId: 'j57',
        characterId: 'j574',
        status: 'accepted',
        note: 'late',
      }),
    ).toBe('signup-set: status accepted, note late');
    expect(summarize('raid-cancel', { eventId: 'j57' })).toBe('raid-cancel');
  });
});

describe('runTurn progress and stopping', () => {
  const ok = async () => ({ success: true, output: '{}' });

  it('reports the agent notes, then the answer as it is written', async () => {
    const runtime = createFakeAgentRuntime([
      {
        notes: ['Checking the signups.'],
        rounds: [[{ name: 'signup_list' }]],
        answer: 'Aeryn and Kol.',
      },
    ]);
    const reports: { notes: string[]; draft: string | null }[] = [];
    const outcome = await runTurn({
      runtime,
      request,
      sleep: noSleep,
      progressMs: 0,
      executeTool: ok,
      onProgress: (p) => void reports.push(structuredClone(p)),
    });
    expect(outcome).toMatchObject({ status: 'completed', text: 'Aeryn and Kol.' });
    expect(runtime.streamed).toHaveLength(1);
    // A partial note first, then the whole note, then the answer growing to its end.
    expect(reports[0]).toEqual({ notes: ['Checking th'], draft: null });
    expect(reports).toContainEqual({ notes: ['Checking the signups.'], draft: null });
    expect(reports.at(-1)).toEqual({ notes: ['Checking the signups.'], draft: 'Aeryn and Kol.' });
  });

  it('ignores the earlier turns a reused session replays', async () => {
    const runtime = createFakeAgentRuntime(
      [
        { notes: ['Old note.'], answer: 'First.' },
        { notes: ['New note.'], answer: 'Second.' },
      ],
      { lagPolls: 0 },
    );
    const first = await runTurn({ runtime, request, sleep: noSleep, executeTool: ok });
    const reports: { notes: string[]; draft: string | null }[] = [];
    await runTurn({
      runtime,
      request: { ...request, sessionId: first.sessionId },
      sleep: noSleep,
      executeTool: ok,
      onProgress: (p) => void reports.push(structuredClone(p)),
    });
    expect(reports.at(-1)).toEqual({ notes: ['New note.'], draft: 'Second.' });
    expect(reports.flatMap((r) => r.notes)).not.toContain('Old note.');
  });

  it('stops a turn the member cancelled, upstream too', async () => {
    const runtime = createFakeAgentRuntime([
      { rounds: [[{ name: 'a' }], [{ name: 'b' }]], answer: 'never sent' },
    ]);
    let calls = 0;
    const outcome = await runTurn({
      runtime,
      request,
      sleep: noSleep,
      executeTool: async () => {
        calls++;
        return { success: true, output: '{}' };
      },
      isCancelled: async () => calls >= 1,
    });
    expect(outcome).toMatchObject({ status: 'cancelled', text: null, error: null });
    expect(calls).toBe(1);
    expect(runtime.cancelled).toEqual([outcome.sessionId]);
    expect(publicTurnError(outcome)).toBe('Stopped');
  });

  it('tells each tool call when the loop first saw it', async () => {
    const runtime = createFakeAgentRuntime([{ rounds: [[{ name: 'a' }]], answer: 'ok' }]);
    const seen: (number | undefined)[] = [];
    await runTurn({
      runtime,
      request,
      sleep: noSleep,
      now: () => 1234,
      executeTool: async (call) => {
        seen.push(call.seenAt);
        return { success: true, output: '{}' };
      },
    });
    expect(seen).toEqual([1234]);
  });
});

describe('runTurn progress when the stream misbehaves', () => {
  const ok = async () => ({ success: true, output: '{}' });
  type Report = { notes: string[]; draft: string | null };

  it('lands the last notes and the answer before returning, when the stream trails the loop', async () => {
    const runtime = createFakeAgentRuntime([{ notes: ['Reading.'], answer: 'Done here.' }], {
      trails: true,
    });
    const reports: Report[] = [];
    const outcome = await runTurn({
      runtime,
      request,
      sleep: noSleep,
      progressMs: 0,
      executeTool: ok,
      onProgress: (p) => void reports.push(structuredClone(p)),
    });
    // When runTurn resolves, the caller records the outcome: progress must already be in.
    expect(outcome.status).toBe('completed');
    expect(reports.at(-1)).toEqual({ notes: ['Reading.'], draft: 'Done here.' });
  });

  it('never holds the answer for a stream that ignores abort or a write that never returns', async () => {
    const base = createFakeAgentRuntime([{ answer: 'Still answered.' }]);
    const stuck = {
      ...base,
      // Opens, sends nothing, and ignores the abort signal.
      events: () => ({
        [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => undefined) }),
      }),
    };
    const started = Date.now();
    const outcome = await runTurn({
      runtime: stuck,
      request,
      sleep: noSleep,
      progressGraceMs: 10,
      executeTool: ok,
      onProgress: () => new Promise<void>(() => undefined),
    });
    expect(outcome).toMatchObject({ status: 'completed', text: 'Still answered.' });
    expect(Date.now() - started).toBeLessThan(2500);

    const hung = createFakeAgentRuntime([{ notes: ['Hmm.'], answer: 'Also answered.' }]);
    const second = await runTurn({
      runtime: hung,
      request,
      sleep: noSleep,
      progressMs: 0,
      executeTool: ok,
      onProgress: () => new Promise<void>(() => undefined),
    });
    expect(second).toMatchObject({ status: 'completed', text: 'Also answered.' });
  });

  it('keeps a new session’s progress even when the clocks disagree', async () => {
    const runtime = createFakeAgentRuntime([{ notes: ['Checking.'], answer: 'Fine.' }]);
    const reports: Report[] = [];
    await runTurn({
      runtime,
      request,
      sleep: noSleep,
      // Ten minutes ahead of the API, or a start that took that long.
      now: () => Date.now() + 10 * 60 * 1000,
      progressMs: 0,
      executeTool: ok,
      onProgress: (p) => void reports.push(structuredClone(p)),
    });
    expect(reports.at(-1)).toEqual({ notes: ['Checking.'], draft: 'Fine.' });
  });
});
