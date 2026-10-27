import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { VintageAgentPanel } from './agent-panel';
import {
  type AgentPanelRun,
  changeSummary,
  commandLabel,
  contextLabel,
  toolRows,
  turnView,
} from './agent-panel-model';
import './agent-panel';

const T0 = Date.UTC(2026, 9, 27, 20);

const run = (over: Partial<AgentPanelRun> = {}): AgentPanelRun => ({
  id: 'run-1',
  prompt: 'Who hasn’t answered?',
  status: 'running',
  answer: null,
  error: null,
  notes: [],
  draft: null,
  toolCalls: [],
  confirmations: [],
  context: null,
  cancelRequested: false,
  createdAt: T0,
  finishedAt: null,
  ...over,
});

const call = (command: string | null, name = 'afd-call', over = {}) => ({
  name,
  command,
  success: true,
  summary: command,
  error: null,
  startedAt: T0,
  finishedAt: T0 + 5,
  ...over,
});

describe('the turn model', () => {
  it('names commands in words: reads, statuses, and prepared changes', () => {
    expect(commandLabel('signup-list')).toBe('Read signups');
    expect(commandLabel('raid-get')).toBe('Read raid');
    expect(commandLabel('coordinator-status')).toBe('Checked coordinator status');
    expect(commandLabel('coordinator-log')).toBe('Read coordinator log');
    expect(commandLabel('roster-lock')).toBe('Prepared roster lock');
    expect(changeSummary('signup-set: status accepted')).toBe('Signup set: status accepted');
    expect(changeSummary('roster-lock')).toBe('Roster lock');
  });

  it('folds command rows, counts lookups, and keeps errors', () => {
    const { lookups, rows } = toolRows([
      call(null, 'afd-discover'),
      call(null, 'afd-detail'),
      call('signup-list', 'afd-call', { summary: 'signup-list: status late' }),
      call('raid-get', 'afd-call', { success: false, error: 'No raid r9' }),
    ]);
    expect(lookups).toBe(2);
    expect(rows).toEqual([
      { key: '2', label: 'Read signups', detail: 'status late', failed: false, error: null },
      { key: '3', label: 'Read raid', detail: null, failed: true, error: 'No raid r9' },
    ]);
    expect(turnView(run({ toolCalls: [call('a-list'), call('b-list')] }), T0).folded).toBe(true);
  });

  it('shows working, the draft as it is written, then the answer and how long it took', () => {
    const working = turnView(run({ notes: ['Checking.'], draft: 'Aer' }), T0 + 4200);
    expect(working).toMatchObject({
      active: true,
      statusText: 'Working on it',
      text: 'Aer',
      streaming: true,
      seconds: 4,
      notes: ['Checking.'],
    });
    const done = turnView(
      run({ status: 'answered', answer: 'Aeryn and Kol.', draft: null, finishedAt: T0 + 9000 }),
      T0 + 60_000,
    );
    expect(done).toMatchObject({
      active: false,
      statusText: null,
      text: 'Aeryn and Kol.',
      seconds: 9,
    });
    expect(turnView(run({ cancelRequested: true }), T0).statusText).toBe('Stopping…');
    expect(turnView(run({ status: 'cancelled' }), T0)).toMatchObject({
      statusText: 'Stopped',
      tone: 'muted',
    });
    expect(turnView(run({ status: 'failed', error: 'The agent is busy' }), T0)).toMatchObject({
      statusText: 'The agent is busy',
      tone: 'error',
    });
  });

  it('labels context and approvals', () => {
    expect(
      contextLabel({
        page: "Officers' quarters · Tonight",
        selection: { kind: 'raid', id: 'r1', label: 'Molten Core' },
      }),
    ).toBe('Tonight · Molten Core');
    const view = turnView(
      run({
        confirmations: [
          { id: 'c1', summary: 'roster-lock', status: 'pending' },
          { id: 'c2', summary: 'signup-set: status late', status: 'declined' },
        ],
      }),
      T0,
    );
    expect(view.approvals).toEqual([
      { id: 'c1', summary: 'Roster lock', state: 'pending', outcome: null },
      { id: 'c2', summary: 'Signup set: status late', state: 'declined', outcome: 'Dropped' },
    ]);
  });
});

type Call = { name: string; input: unknown };

/** A client whose agent commands follow a script: each read of the run advances it one step. */
function useAgentClient(steps: AgentPanelRun[], history: AgentPanelRun[] = []) {
  const calls: Call[] = [];
  let step = 0;
  const ok = <T>(data: T): CommandResult<T> => ({ success: true, data });
  const client: CommandClient = {
    read: vi.fn(async (name: string, input?: unknown) => {
      calls.push({ name, input });
      if (name === 'agent-runs') return ok(history);
      if (name === 'agent-status') {
        return ok({ config: { guildMonthlyAsks: 1000 }, usage: { asksThisMonth: 12 } });
      }
      if (name === 'agent-run-get') {
        const current = steps[Math.min(step, steps.length - 1)];
        step++;
        return ok(current);
      }
      return { success: false, error: { code: 'UNKNOWN', message: name } };
    }) as CommandClient['read'],
    run: vi.fn(async (name: string, input?: unknown) => {
      calls.push({ name, input });
      if (name === 'agent-ask') return ok({ runId: 'run-1', status: 'queued' });
      return ok({});
    }) as CommandClient['run'],
  };
  const restore = setCommandClient(client);
  return { calls, restore };
}

describe('<vintage-agent-panel>', () => {
  let restore: CommandClient | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    if (restore) setCommandClient(restore);
    restore = undefined;
    cleanup();
  });

  const context = {
    page: 'Officers’ quarters · Tonight',
    selection: { kind: 'raid', id: 'r1', label: 'Molten Core' },
  };

  it('asks with the page context, shows progress, then the answer', async () => {
    const client = useAgentClient([
      run({ notes: ['I’ll read the signups.'], toolCalls: [call('signup-list')], context }),
      run({
        notes: ['I’ll read the signups.'],
        toolCalls: [call('signup-list')],
        draft: 'Aeryn',
        context,
      }),
      run({
        status: 'answered',
        notes: ['I’ll read the signups.'],
        toolCalls: [call('signup-list')],
        answer: '**Signed up:** Aeryn and Kol.',
        context,
        finishedAt: T0 + 6000,
      }),
    ]);
    restore = client.restore;
    const panel = await mount<VintageAgentPanel>('<vintage-agent-panel></vintage-agent-panel>');
    panel.context = context;
    panel.showUsage = true;
    await settle();
    expect(shadowText(panel)).toContain('Looking at Tonight · Molten Core');

    const asked = await panel.ask('Who hasn’t answered?');
    expect(asked.success).toBe(true);
    const ask = client.calls.find((c) => c.name === 'agent-ask');
    expect(ask?.input).toMatchObject({ question: 'Who hasn’t answered?', context });
    expect((ask?.input as { thread?: string } | undefined)?.thread).toMatch(/^web-/);

    await panel.poll();
    await settle();
    expect(shadowText(panel)).toContain('I’ll read the signups.');
    expect(shadowText(panel)).toContain('Read signups');
    expect(shadowText(panel)).toContain('Working on it');

    await panel.poll();
    await panel.poll();
    await settle();
    expect(panel.active).toBe(false);
    expect(shadowText(panel)).not.toContain('Working on it');
    const markdown = panel.shadowRoot?.querySelector('vintage-markdown');
    expect(markdown?.shadowRoot?.innerHTML).toContain('<strong>Signed up:</strong>');
    expect(panel.usageText).toBe('12 of 1,000 questions this month');
  });

  it('confirms a prepared change and tells the page to read again', async () => {
    const pending = run({
      status: 'answered',
      answer: 'Press Confirm.',
      confirmations: [{ id: 'c1', summary: 'roster-lock', status: 'pending' }],
      finishedAt: T0 + 3000,
    });
    const done = {
      ...pending,
      confirmations: [{ id: 'c1', summary: 'roster-lock', status: 'done' as const }],
    };
    const client = useAgentClient(
      [done],
      [{ ...pending, confirmationIds: ['c1'] } as AgentPanelRun],
    );
    restore = client.restore;
    const panel = await mount<VintageAgentPanel>('<vintage-agent-panel></vintage-agent-panel>');
    await panel.loadHistory();
    await settle();
    const changed = vi.fn();
    panel.addEventListener('agent-changed', changed);

    await panel.confirm('c1');
    await settle();
    expect(client.calls).toContainEqual({ name: 'agent-confirm', input: { confirmationId: 'c1' } });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(shadowText(panel)).toContain('Done: Roster lock');

    // Dropping never tells the page to read again: nothing changed.
    await panel.decline('c1');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('stops a running question and can ask without the page context', async () => {
    const client = useAgentClient([run({ cancelRequested: true }), run({ status: 'cancelled' })]);
    restore = client.restore;
    const panel = await mount<VintageAgentPanel>('<vintage-agent-panel></vintage-agent-panel>');
    panel.context = context;
    panel.dropContext();
    await panel.ask('One thing');
    expect(client.calls.find((c) => c.name === 'agent-ask')?.input).not.toHaveProperty('context');

    await panel.stop();
    expect(client.calls).toContainEqual({ name: 'agent-cancel', input: { runId: 'run-1' } });
    await panel.poll();
    await settle();
    expect(shadowText(panel)).toContain('Stopped');
    expect(panel.active).toBe(false);
  });

  it('reloads the conversation for this browser tab, oldest first', async () => {
    const older = run({ id: 'run-0', prompt: 'First?', status: 'answered', answer: 'One.' });
    const newer = run({ id: 'run-1', prompt: 'Second?', status: 'answered', answer: 'Two.' });
    const client = useAgentClient([], [newer, older]);
    restore = client.restore;
    sessionStorage.setItem('vintage:agent-thread', 'web-kept');
    const panel = await mount<VintageAgentPanel>('<vintage-agent-panel></vintage-agent-panel>');
    await panel.loadHistory();
    expect(client.calls.find((c) => c.name === 'agent-runs')?.input).toMatchObject({
      thread: 'web-kept',
    });
    expect(panel.runs.map((r) => r.prompt)).toEqual(['First?', 'Second?']);

    panel.newChat();
    expect(panel.runs).toEqual([]);
    expect(sessionStorage.getItem('vintage:agent-thread')).not.toBe('web-kept');
  });
});
