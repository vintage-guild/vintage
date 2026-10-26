import { CommandRegistry } from '@lushly-dev/fast-element/command.js';
import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { PollsDeskPoll, VintagePollsDesk } from './polls-desk';
import './polls-desk';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

type Run = (name: string, input: unknown, options?: { confirmToken?: string }) => CommandResult;

function useClient(run: Run) {
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown, options?: { confirmToken?: string }) =>
      run(name, input, options),
    ) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return client;
}

const base = {
  method: 'single' as const,
  eligibleTier: 'raider',
  anonymous: false,
  resultsVisible: 'live' as const,
  quorum: null,
  opensAt: null,
  closedAt: null,
  options: [
    { id: 'o1', label: 'Tuesday' },
    { id: 'o2', label: 'Thursday' },
  ],
};

const OPEN: PollsDeskPoll = {
  ...base,
  id: 'p-open',
  question: 'Which night?',
  status: 'open',
  resultsVisible: 'after-close',
  closesAt: Date.UTC(2026, 10, 1, 1),
  ballots: 3,
  results: {
    ballots: 3,
    quorumMet: true,
    winners: ['o2'],
    options: [
      { optionId: 'o1', votes: 1 },
      { optionId: 'o2', votes: 2 },
    ],
  },
};

const CLOSED: PollsDeskPoll = {
  ...base,
  id: 'p-closed',
  question: 'Promote Kol?',
  status: 'closed',
  eligibleTier: 'officer',
  anonymous: true,
  resultsVisible: 'officers',
  quorum: 4,
  closesAt: null,
  closedAt: Date.UTC(2026, 9, 25),
  ballots: 3,
  options: [
    { id: 'o1', label: 'Yes' },
    { id: 'o2', label: 'No' },
  ],
  results: {
    ballots: 3,
    quorumMet: false,
    winners: ['o1'],
    options: [
      { optionId: 'o1', votes: 2 },
      { optionId: 'o2', votes: 1 },
    ],
  },
};

async function mountDesk(polls: PollsDeskPoll[] = [OPEN, CLOSED]) {
  const el = await mount<VintagePollsDesk>(
    '<vintage-polls-desk time-zone="UTC"></vintage-polls-desk>',
  );
  el.polls = polls;
  await settle();
  return el;
}

describe('vintage-polls-desk', () => {
  it('shows open polls with the live tally and closed ones with their result', async () => {
    const el = await mountDesk();
    const text = shadowText(el);
    expect(text).toContain('1 open');
    expect(text).toContain('pick one · raiders and up · members see results at close · 3 ballots');
    expect(text).toContain('Thursday 2 · 67%');
    expect(text).toContain(
      'pick one · officers · anonymous · results for officers only · 3 ballots · quorum 4',
    );
    expect(text).toContain('Yes won with 3 ballots. Quorum not met, so it doesn’t count.');
    expect(text).toContain('Yes ✓');
    expect(text).not.toContain('Thursday ✓');
  });

  it('closes a poll only after the officer confirms the preview', async () => {
    const client = useClient((_name, _input, options) =>
      options?.confirmToken
        ? { success: true, data: { poll: { id: 'p-open' } } }
        : {
            success: true,
            data: {
              preview: { ballots: 3, results: OPEN.results },
              confirmToken: 'tok',
              expiresInMs: 300_000,
            },
          },
    );
    const el = await mountDesk();
    const changed: string[] = [];
    el.addEventListener('polls-changed', () => changed.push('changed'));

    await el.close('p-open');
    await settle();
    expect(el.pending).toMatchObject({ pollId: 'p-open', kind: 'close', token: 'tok' });
    expect(shadowText(el)).toContain(
      'Close Which night? It closes with 3 ballots, Thursday winning. The result is frozen',
    );
    expect(changed).toEqual([]);

    await el.confirm();
    expect(client.run).toHaveBeenLastCalledWith(
      'poll-close',
      { pollId: 'p-open' },
      { confirmToken: 'tok' },
    );
    expect(el.pending).toBeNull();
    expect(el.statusText).toBe('Closed “Which night?”');
    expect(changed).toEqual(['changed']);
  });

  it('keeps a poll open when the officer backs out of cancelling', async () => {
    const client = useClient(() => ({
      success: true,
      data: { preview: { willCancel: 'Which night?', ballots: 3 }, confirmToken: 'tok' },
    }));
    const el = await mountDesk();
    await el.cancel('p-open');
    expect(el.pending?.summary).toBe(
      'No result is recorded; 3 ballots won’t count. Votes are kept for history.',
    );
    el.keep();
    expect(el.pending).toBeNull();
    expect(el.statusText).toBe('Kept “Which night?” open');
    expect(client.run).toHaveBeenCalledTimes(1);
  });

  it('shows the server’s refusal instead of a preview', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only the poll creator or a raid leader can change this poll',
      },
    }));
    const el = await mountDesk();
    await el.close('p-open');
    expect(el.pending).toBeNull();
    expect(el.statusKind).toBe('error');
    expect(el.statusText).toContain('Only the poll creator or a raid leader');
  });

  it('runs the sweep and opens a draft', async () => {
    const client = useClient((name) =>
      name === 'poll-sweep'
        ? { success: true, data: { opened: ['a'], closed: ['b', 'c'] } }
        : { success: true, data: null },
    );
    const el = await mountDesk([{ ...OPEN, id: 'p-draft', status: 'draft', results: null }]);
    expect(shadowText(el)).toContain('Open now');
    await el.sweep();
    expect(el.statusText).toBe('Sweep done: opened 1, closed 2');
    await el.open('p-draft');
    expect(client.run).toHaveBeenLastCalledWith('poll-open', { pollId: 'p-draft' });
  });

  it('is reachable as vintage.poll-close and vintage.poll-sweep', async () => {
    const client = useClient(() => ({ success: true, data: { confirmToken: 't', preview: {} } }));
    await mountDesk();
    expect((await CommandRegistry.execute('vintage.poll-close', 'p-open')).success).toBe(true);
    expect((await CommandRegistry.execute('vintage.poll-sweep')).success).toBe(true);
    expect(client.run).toHaveBeenCalledTimes(2);
  });
});

describe('vintage-polls-desk for a raid leader', () => {
  it('says the result is held back instead of showing empty bars', async () => {
    const el = await mountDesk([{ ...CLOSED, results: null }]);
    const text = shadowText(el);
    expect(text).toContain('The result is for officers.');
    expect(el.shadowRoot!.querySelector('.tally')).toBeNull();
  });
});
