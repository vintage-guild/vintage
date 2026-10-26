import { Updates } from '@lushly-dev/fast-element';
import type { CommandResult } from '@vintage/guild-kit';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PollGet } from '../polls';
import { setSession } from '../session';

const poll = (id: string, question: string, status: 'open' | 'closed'): PollGet => ({
  poll: {
    id,
    guildId: 'vintage',
    question,
    description: null,
    options: [
      { id: 'o1', label: 'Tuesday', emoji: null, value: null },
      { id: 'o2', label: 'Thursday', emoji: null, value: null },
    ],
    method: 'single',
    maxChoices: null,
    eligibleTier: 'raider',
    anonymous: false,
    resultsVisible: 'live',
    quorum: null,
    status,
    opensAt: null,
    closesAt: null,
    createdBy: 'm1',
    closedBy: null,
    createdAt: 0,
    closedAt: status === 'closed' ? 1 : null,
    tags: [],
    configVersion: 1,
    results: {
      method: 'single',
      ballots: 2,
      quorumMet: true,
      options: [
        { optionId: 'o1', votes: 1 },
        { optionId: 'o2', votes: 1 },
      ],
      winners: ['o1'],
      rounds: null,
    },
    resultsHidden: false,
  },
  myVote: null,
  ballots: 2,
});

const POLLS: Record<string, PollGet> = {
  a: poll('a', 'Which night?', 'open'),
  b: poll('b', 'Loot method?', 'closed'),
};

function useClient() {
  const read = vi.fn(async (name: string, input?: unknown): Promise<CommandResult<unknown>> => {
    const i = (input ?? {}) as { statuses?: string[]; pollId?: string };
    if (name === 'poll-list') {
      return i.statuses?.includes('closed')
        ? { success: true, data: [{ id: 'b', closedAt: 1 }] }
        : { success: true, data: [{ id: 'a' }] };
    }
    if (name === 'poll-get') return { success: true, data: POLLS[i.pollId ?? ''] };
    return { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } };
  });
  return setCommandClient({ read, run: vi.fn() } as unknown as CommandClient);
}

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Updates.next();
    await new Promise((r) => setTimeout(r, 0));
  }
};

let restore: CommandClient | undefined;
beforeEach(() => {
  history.replaceState(null, '', '/polls');
});
afterEach(() => {
  if (restore) setCommandClient(restore);
  setSession(null);
  document.body.replaceChildren();
});

describe('/polls', () => {
  it('shows open polls as voting cards and closed ones with their result, for members', async () => {
    restore = useClient();
    setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'raider' } as never);
    await import('./polls');
    document.body.innerHTML = '<vintage-polls-page></vintage-polls-page>';
    await flush();
    const page = document.querySelector('vintage-polls-page')!;
    const cards = [...page.shadowRoot!.querySelectorAll('vintage-poll-card')];
    expect(cards.map((c) => c.getAttribute('question'))).toEqual(['Which night?', 'Loot method?']);
    expect(cards.map((c) => c.hasAttribute('readonly'))).toEqual([false, true]);
  });

  it('shows visitors the sign-in card and asks the server nothing', async () => {
    restore = useClient();
    await import('./polls');
    document.body.innerHTML = '<vintage-polls-page></vintage-polls-page>';
    await flush();
    const page = document.querySelector('vintage-polls-page')!;
    expect(page.shadowRoot!.querySelector('vintage-sign-in-card')).not.toBeNull();
    expect(page.shadowRoot!.querySelector('vintage-poll-card')).toBeNull();
  });
});
