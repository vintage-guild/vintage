import { describe, expect, it } from 'vitest';
import type { Poll } from '../src/contract';
import { createMemoryPollsStore } from '../src/testing';

const draft = (guildId: string, overrides: Partial<Omit<Poll, 'id'>> = {}): Omit<Poll, 'id'> => ({
  guildId,
  question: 'Which night?',
  description: null,
  options: [
    { id: 'a', label: 'Tuesday', emoji: null, value: null },
    { id: 'b', label: 'Thursday', emoji: null, value: null },
  ],
  method: 'single',
  maxChoices: null,
  eligibleTier: 'raider',
  anonymous: false,
  resultsVisible: 'live',
  quorum: null,
  status: 'open',
  opensAt: null,
  closesAt: null,
  createdBy: 'm1',
  closedBy: null,
  createdAt: 1,
  closedAt: null,
  tags: [],
  configVersion: 1,
  results: null,
  ...overrides,
});

const vote = (pollId: string, memberId: string, guildId = 'g1') => ({
  guildId,
  pollId,
  memberId,
  choices: ['a'],
  weight: 1,
  castAt: 1,
  updatedAt: 1,
});

describe('memory polls store', () => {
  it('keeps guilds apart', async () => {
    const store = createMemoryPollsStore();
    const poll = await store.insertPoll(draft('g1'));
    expect(await store.getPoll('g2', poll.id)).toBeNull();
    expect(await store.listPolls('g2')).toEqual([]);
    await expect(store.updatePoll('g2', poll.id, { status: 'closed' })).rejects.toThrow();
  });

  it('allows one vote per member per poll', async () => {
    const store = createMemoryPollsStore();
    const poll = await store.insertPoll(draft('g1'));
    await store.insertVote(vote(poll.id, 'm1'));
    await expect(store.insertVote(vote(poll.id, 'm1'))).rejects.toThrow(/already voted/);
    await store.insertVote(vote(poll.id, 'm2'));
    expect(await store.countVotes('g1', poll.id)).toBe(2);
    expect((await store.getVoteByMember('g1', poll.id, 'm2'))?.memberId).toBe('m2');
  });

  it('filters by status, tag, and close time, soonest first and open-ended last', async () => {
    const store = createMemoryPollsStore();
    const late = await store.insertPoll(draft('g1', { closesAt: 300, tags: ['raid-night'] }));
    const soon = await store.insertPoll(draft('g1', { closesAt: 100 }));
    const never = await store.insertPoll(draft('g1'));
    await store.insertPoll(draft('g1', { status: 'closed', closesAt: 50 }));

    const open = await store.listPolls('g1', { statuses: ['open'] });
    expect(open.map((p) => p.id)).toEqual([soon.id, late.id, never.id]);
    expect((await store.listPolls('g1', { tag: 'raid-night' })).map((p) => p.id)).toEqual([
      late.id,
    ]);
    expect(
      (await store.listPolls('g1', { statuses: ['open'], closesBy: 200 })).map((p) => p.id),
    ).toEqual([soon.id]);
  });

  it('deletes a vote only in its own guild', async () => {
    const store = createMemoryPollsStore();
    const poll = await store.insertPoll(draft('g1'));
    const v = await store.insertVote(vote(poll.id, 'm1'));
    await store.deleteVote('g2', v.id);
    expect(await store.countVotes('g1', poll.id)).toBe(1);
    await store.deleteVote('g1', v.id);
    expect(await store.countVotes('g1', poll.id)).toBe(0);
  });
});
