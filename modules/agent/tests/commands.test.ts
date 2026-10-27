import type { Caller, CommandResult } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { agentCommands } from '../src/commands';
import { CONFIRM_WINDOW_MS, defaultAgentConfig, threadKeyOf } from '../src/contract';
import { askInput } from '../src/domain/instructions';
import { dayStart, monthStart, refuseAsk } from '../src/domain/limits';
import type { AgentDeps } from '../src/store';
import { createMemoryAgentDeps } from '../src/testing';

const NOW = Date.UTC(2026, 9, 27, 18, 30);

let clock: ReturnType<typeof fixedClock>;
let harness: ReturnType<typeof createMemoryAgentDeps>;
let registry: ReturnType<typeof testRegistry<AgentDeps>>;

const raider = makeCaller('raider', { surface: 'discord' });
const other = makeCaller('raider', { memberId: 'member-other', discordId: 'discord-other' });
const officer = makeCaller('officer');

beforeEach(() => {
  clock = fixedClock(NOW);
  harness = createMemoryAgentDeps();
  registry = testRegistry<AgentDeps>([...agentCommands], clock);
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller }, harness.deps);
const code = (result: CommandResult<unknown>) => (result.success ? 'OK' : result.error?.code);
const data = <T>(result: CommandResult<unknown>) => {
  if (!result.success) throw new Error(`failed: ${result.error?.code}`);
  return result.data as T;
};

const finish = (runId: string) =>
  harness.deps.agent.updateRun(raider.guildId, runId, {
    status: 'answered',
    finishedAt: clock.now(),
  });

describe('agent-ask', () => {
  it('queues the question as a run and enqueues it', async () => {
    const result = data<{ runId: string; status: string }>(
      await run('agent-ask', { question: '  am I in Thursday?  ', thread: 'chan-1' }, raider),
    );
    expect(result.status).toBe('queued');
    expect(harness.enqueued).toEqual([{ guildId: raider.guildId, runId: result.runId }]);
    const saved = harness.deps.agent.runs.get(result.runId);
    expect(saved).toMatchObject({
      kind: 'ask',
      memberId: raider.memberId,
      surface: 'discord',
      prompt: 'am I in Thursday?',
      threadKey: threadKeyOf('discord', 'chan-1', raider.memberId as string),
      model: 'gpt-6.1-terra',
    });
  });

  it('refuses while the member still has a question in flight', async () => {
    const first = data<{ runId: string }>(await run('agent-ask', { question: 'one' }, raider));
    expect(code(await run('agent-ask', { question: 'two' }, raider))).toBe('AGENT_BUSY');
    await finish(first.runId);
    expect(code(await run('agent-ask', { question: 'two' }, raider))).toBe('OK');
  });

  it('stops counting a stuck question as busy after five minutes', async () => {
    await run('agent-ask', { question: 'one' }, raider);
    clock.advance(6 * 60 * 1000);
    expect(code(await run('agent-ask', { question: 'two' }, raider))).toBe('OK');
  });

  it('enforces the per-member daily cap, resetting at midnight UTC', async () => {
    await harness.deps.agent.setConfig(raider.guildId, { memberDailyAsks: 2 }, NOW, null);
    for (const q of ['a', 'b']) {
      await finish(data<{ runId: string }>(await run('agent-ask', { question: q }, raider)).runId);
    }
    expect(code(await run('agent-ask', { question: 'c' }, raider))).toBe('AGENT_DAILY_LIMIT');
    expect(code(await run('agent-ask', { question: 'c' }, other))).toBe('OK');
    clock.advance(6 * 60 * 60 * 1000);
    expect(code(await run('agent-ask', { question: 'c' }, raider))).toBe('OK');
  });

  it('enforces the guild monthly cap and the pause switch', async () => {
    await harness.deps.agent.setConfig(raider.guildId, { guildMonthlyAsks: 1 }, NOW, null);
    await finish(data<{ runId: string }>(await run('agent-ask', { question: 'a' }, raider)).runId);
    expect(code(await run('agent-ask', { question: 'b' }, other))).toBe('AGENT_MONTHLY_LIMIT');
    await run('agent-pause', {}, officer);
    expect(code(await run('agent-ask', { question: 'b' }, other))).toBe('AGENT_PAUSED');
  });

  it('is not open to the public or to a caller without a member id', async () => {
    expect(code(await run('agent-ask', { question: 'hi' }, makeCaller('public')))).toBe(
      'COMMAND_NOT_FOUND',
    );
    const system = { ...officer, memberId: undefined } as Caller;
    expect(code(await run('agent-ask', { question: 'hi' }, system))).toBe('NOT_A_MEMBER');
  });
});

describe('agent-run-get and agent-runs', () => {
  it('shows a member their own runs, officers anyone, never the session or tokens', async () => {
    const { runId } = data<{ runId: string }>(await run('agent-ask', { question: 'q' }, raider));
    await harness.deps.agent.updateRun(raider.guildId, runId, { sessionId: 'sess_secret' });
    const mine = data<Record<string, unknown>>(await run('agent-run-get', { runId }, raider));
    expect(mine).not.toHaveProperty('sessionId');
    expect(code(await run('agent-run-get', { runId }, other))).toBe('RUN_NOT_FOUND');
    expect(code(await run('agent-run-get', { runId }, officer))).toBe('OK');

    expect(data<unknown[]>(await run('agent-runs', {}, other))).toEqual([]);
    expect(data<unknown[]>(await run('agent-runs', { memberId: raider.memberId }, other))).toEqual(
      [],
    );
    expect(
      data<unknown[]>(await run('agent-runs', { memberId: raider.memberId }, officer)),
    ).toHaveLength(1);
  });
});

async function prepare(confirmToken: string | null = null) {
  const { runId } = data<{ runId: string }>(await run('agent-ask', { question: 'q' }, raider));
  const confirmation = await harness.deps.agent.insertConfirmation({
    guildId: raider.guildId,
    runId,
    memberId: raider.memberId as string,
    command: 'signup-set',
    input: { eventId: 'r1', status: 'tentative' },
    confirmToken,
    preview: null,
    summary: 'signup-set: eventId r1, status tentative',
    status: 'pending',
    createdAt: NOW,
    expiresAt: NOW + (confirmToken ? CONFIRM_WINDOW_MS.destructive : CONFIRM_WINDOW_MS.other),
    result: null,
    finishedAt: null,
  });
  await harness.deps.agent.updateRun(raider.guildId, runId, { confirmationIds: [confirmation.id] });
  return { runId, confirmation };
}

describe('agent-confirm', () => {
  it('runs the prepared command as the member who confirms, once', async () => {
    const { confirmation, runId } = await prepare();
    const result = await run('agent-confirm', { confirmationId: confirmation.id }, raider);
    expect(code(result)).toBe('OK');
    expect(harness.ran).toEqual([
      { caller: raider, name: 'signup-set', input: { eventId: 'r1', status: 'tentative' } },
    ]);
    expect(code(await run('agent-confirm', { confirmationId: confirmation.id }, raider))).toBe(
      'CONFIRMATION_CLOSED',
    );
    const view = data<{ confirmations: Record<string, unknown>[] }>(
      await run('agent-run-get', { runId }, raider),
    );
    expect(view.confirmations[0]).toMatchObject({ status: 'done' });
    expect(view.confirmations[0]).not.toHaveProperty('confirmToken');
  });

  it('passes the destructive token through and records a failure', async () => {
    harness = createMemoryAgentDeps(() => ({
      success: false,
      error: { code: 'CONFIRMATION_INVALID', message: 'expired', retryable: true },
    }));
    const { confirmation } = await prepare('tok-123');
    const result = await run('agent-confirm', { confirmationId: confirmation.id }, raider);
    expect(code(result)).toBe('CONFIRMATION_INVALID');
    expect(harness.ran[0]?.confirmToken).toBe('tok-123');
    expect(harness.deps.agent.confirmations.get(confirmation.id)?.status).toBe('failed');
  });

  it('refuses other members, even officers, and expired changes', async () => {
    const { confirmation } = await prepare();
    expect(code(await run('agent-confirm', { confirmationId: confirmation.id }, other))).toBe(
      'CONFIRMATION_NOT_FOUND',
    );
    expect(code(await run('agent-confirm', { confirmationId: confirmation.id }, officer))).toBe(
      'CONFIRMATION_NOT_FOUND',
    );
    clock.advance(CONFIRM_WINDOW_MS.other + 1);
    expect(code(await run('agent-confirm', { confirmationId: confirmation.id }, raider))).toBe(
      'CONFIRMATION_EXPIRED',
    );
    expect(harness.ran).toEqual([]);
  });

  it('declines without running', async () => {
    const { confirmation } = await prepare();
    expect(code(await run('agent-decline', { confirmationId: confirmation.id }, raider))).toBe(
      'OK',
    );
    expect(code(await run('agent-confirm', { confirmationId: confirmation.id }, raider))).toBe(
      'CONFIRMATION_CLOSED',
    );
    expect(harness.ran).toEqual([]);
  });
});

describe('officer controls', () => {
  it('pause, resume, config, and status are officer-only', async () => {
    expect(code(await run('agent-pause', {}, raider))).toBe('COMMAND_NOT_FOUND');
    expect(code(await run('agent-config-set', {}, officer))).toBe('NOTHING_TO_CHANGE');
    const config = data<{ effort: string; memberDailyAsks: number }>(
      await run('agent-config-set', { effort: 'low', memberDailyAsks: 5 }, officer),
    );
    expect(config).toMatchObject({ effort: 'low', memberDailyAsks: 5 });
    expect(code(await run('agent-config-set', { model: 'claude' }, officer))).toBe(
      'VALIDATION_ERROR',
    );
    await run('agent-ask', { question: 'q' }, raider);
    const status = data<{ config: { paused: boolean }; usage: Record<string, number> }>(
      await run('agent-status', {}, officer),
    );
    expect(status.usage).toMatchObject({ asksToday: 1, asksThisMonth: 1, decisionsThisMonth: 0 });
    await run('agent-pause', {}, officer);
    expect(
      data<{ config: { paused: boolean } }>(await run('agent-status', {}, officer)).config.paused,
    ).toBe(true);
    await run('agent-resume', {}, officer);
    expect(
      data<{ config: { paused: boolean } }>(await run('agent-status', {}, officer)).config.paused,
    ).toBe(false);
  });
});

describe('domain', () => {
  it('computes UTC day and month starts', () => {
    expect(new Date(dayStart(NOW)).toISOString()).toBe('2026-10-27T00:00:00.000Z');
    expect(new Date(monthStart(NOW)).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('checks pause before anything else', () => {
    const config = { ...defaultAgentConfig('g'), paused: true, memberDailyAsks: 0 };
    const counts = { memberInFlight: 1, memberToday: 9, guildThisMonth: 9 };
    expect(refuseAsk(config, counts)?.code).toBe('AGENT_PAUSED');
    expect(refuseAsk({ ...config, paused: false }, counts)?.code).toBe('AGENT_BUSY');
  });

  it('tells the agent where, when, and who', () => {
    const input = askInput('when is raid?', { surface: 'discord', now: NOW, memberName: 'Kol' });
    expect(input).toContain('Surface: discord');
    expect(input).toContain(`unix ${NOW / 1000}`);
    expect(input).toContain('Member: Kol');
    expect(input.endsWith('when is raid?')).toBe(true);
  });
});
