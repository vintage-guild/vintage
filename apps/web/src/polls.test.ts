import { describe, expect, it } from 'vitest';
import { type PollGet, pollCardModel, pollNote } from './polls';

const got = (overrides: Partial<PollGet['poll']> = {}, extra: Partial<PollGet> = {}): PollGet => ({
  poll: {
    id: 'p1',
    guildId: 'vintage',
    question: 'Which night?',
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
    status: 'open',
    opensAt: null,
    closesAt: null,
    createdBy: 'm1',
    closedBy: null,
    createdAt: 0,
    closedAt: null,
    tags: [],
    configVersion: 1,
    results: {
      method: 'single',
      ballots: 3,
      quorumMet: true,
      options: [
        { optionId: 'o1', votes: 1 },
        { optionId: 'o2', votes: 2 },
      ],
      winners: ['o2'],
      rounds: null,
    },
    resultsHidden: false,
    ...overrides,
  },
  myVote: ['o2'],
  ballots: 3,
  ...extra,
});

describe('pollCardModel', () => {
  it('passes the live tally, my ballot, and no winner while open', () => {
    const model = pollCardModel(got());
    expect(model).toMatchObject({
      readonly: false,
      resultsHidden: false,
      ballots: 3,
      myChoices: ['o2'],
      winners: [],
    });
    expect(model.options.map((o) => o.votes)).toEqual([1, 2]);
  });

  it('shows no counts when the server hides the tally', () => {
    const model = pollCardModel(
      got({ resultsHidden: true, results: null, resultsVisible: 'after-close' }),
    );
    expect(model.resultsHidden).toBe(true);
    expect(model.options.map((o) => o.votes)).toEqual([0, 0]);
    expect(model.note).toContain('results when it closes');
  });

  it('marks the winner once closed, and is read-only', () => {
    const model = pollCardModel(got({ status: 'closed', closedAt: Date.UTC(2026, 9, 26) }));
    expect(model).toMatchObject({ readonly: true, winners: ['o2'] });
  });

  it('keeps an officers-only result hidden after close', () => {
    const model = pollCardModel(
      got({ status: 'closed', resultsVisible: 'officers', resultsHidden: true, results: null }),
    );
    expect(model).toMatchObject({ resultsHidden: true, winners: [] });
    expect(model.note).toContain('results are for officers');
  });

  it('carries the method and pick limit for the card', () => {
    expect(pollCardModel(got({ method: 'multi', maxChoices: 2 }))).toMatchObject({
      method: 'multi',
      maxChoices: 2,
    });
  });
});

describe('pollNote', () => {
  it('says ballots, audience, and anonymity', () => {
    expect(pollNote(got({ anonymous: true }))).toBe('3 ballots · raiders and up · anonymous');
    expect(pollNote(got({}, { ballots: 1 }))).toBe('1 ballot · raiders and up');
  });
});

describe('routing helpers', async () => {
  const { pollIdFromPath } = await import('./pages/polls');
  const { tabFromUrl } = await import('./pages/officers');

  it('reads the poll id from /polls/<id>', () => {
    expect(pollIdFromPath('/polls/j971cq')).toBe('j971cq');
    expect(pollIdFromPath('/polls/j971cq/')).toBe('j971cq');
    expect(pollIdFromPath('/polls')).toBe('');
    expect(pollIdFromPath('/polls/')).toBe('');
  });

  it('opens the tab named in ?tab=, only when it is built', () => {
    expect(tabFromUrl('?tab=polls')).toBe('polls');
    expect(tabFromUrl('?tab=calendar')).toBe('calendar');
    expect(tabFromUrl('?tab=coordinator')).toBe('coordinator');
    expect(tabFromUrl('?tab=progress')).toBe('progress');
    expect(tabFromUrl('?tab=roster')).toBe('roster');
    expect(tabFromUrl('?tab=loot')).toBe('tonight');
    expect(tabFromUrl('')).toBe('tonight');
  });
});
