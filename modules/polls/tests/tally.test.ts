import { describe, expect, it } from 'vitest';
import type { Poll, PollMethod } from '../src/contract';
import { cleanChoices, tally } from '../src/domain/tally';

const poll = (
  method: PollMethod,
  ids: string[] = ['a', 'b', 'c'],
  extra: Partial<Pick<Poll, 'maxChoices' | 'quorum'>> = {},
) => ({
  method,
  options: ids.map((id) => ({ id, label: id.toUpperCase(), emoji: null, value: null })),
  maxChoices: null,
  quorum: null,
  ...extra,
});

const ballots = (...choices: string[][]) => choices.map((c) => ({ choices: c, weight: 1 }));
const counts = (result: { options: { optionId: string; votes: number }[] }) =>
  Object.fromEntries(result.options.map((o) => [o.optionId, o.votes]));

describe('cleanChoices', () => {
  it('drops unknown and repeated options, keeping first-seen order', () => {
    expect(cleanChoices(poll('ranked'), ['c', 'x', 'a', 'c'])).toEqual(['c', 'a']);
  });

  it('keeps one choice for single and caps multi at maxChoices', () => {
    expect(cleanChoices(poll('single'), ['b', 'a'])).toEqual(['b']);
    expect(cleanChoices(poll('multi', undefined, { maxChoices: 2 }), ['a', 'b', 'c'])).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('tally: single', () => {
  it('counts votes per option in option order and picks the winner', () => {
    const result = tally(poll('single'), ballots(['b'], ['a'], ['b']));
    expect(counts(result)).toEqual({ a: 1, b: 2, c: 0 });
    expect(result).toMatchObject({ ballots: 3, winners: ['b'], quorumMet: true, rounds: null });
  });

  it('reports every option on a tie', () => {
    expect(tally(poll('single'), ballots(['a'], ['b'])).winners).toEqual(['a', 'b']);
  });

  it('has no winner and no ballots when nobody voted', () => {
    expect(tally(poll('single'), [])).toMatchObject({ ballots: 0, winners: [] });
  });

  it('ignores votes for a removed option, so they are not ballots', () => {
    const result = tally(poll('single', ['a', 'b']), ballots(['gone'], ['a']));
    expect(result).toMatchObject({ ballots: 1, winners: ['a'] });
  });

  it('applies vote weight', () => {
    const result = tally(poll('single'), [
      { choices: ['a'], weight: 1 },
      { choices: ['b'], weight: 3 },
    ]);
    expect(result.winners).toEqual(['b']);
  });
});

describe('tally: multi', () => {
  it('counts each approved option', () => {
    const result = tally(poll('multi'), ballots(['a', 'b'], ['b', 'c'], ['b']));
    expect(counts(result)).toEqual({ a: 1, b: 3, c: 1 });
    expect(result.winners).toEqual(['b']);
  });
});

describe('tally: quorum', () => {
  it('still reports the leader but flags a missed quorum', () => {
    const result = tally(poll('single', undefined, { quorum: 3 }), ballots(['a'], ['a']));
    expect(result).toMatchObject({ ballots: 2, quorumMet: false, winners: ['a'] });
  });

  it('is met at exactly the quorum', () => {
    expect(tally(poll('single', undefined, { quorum: 2 }), ballots(['a'], ['b'])).quorumMet).toBe(
      true,
    );
  });
});

describe('tally: ranked (instant-runoff)', () => {
  it('wins outright with a first-round majority', () => {
    const result = tally(poll('ranked'), ballots(['a', 'b'], ['a', 'c'], ['b', 'a']));
    expect(result.winners).toEqual(['a']);
    expect(result.rounds).toHaveLength(1);
  });

  it('transfers eliminated ballots to the next preference', () => {
    // First round a 2, b 2, c 1: c goes out and its ballot moves to b.
    const result = tally(poll('ranked'), ballots(['a'], ['a'], ['b'], ['b'], ['c', 'b']));
    expect(result.winners).toEqual(['b']);
    expect(result.rounds?.map((r) => r.eliminated)).toEqual([['c'], []]);
    expect(counts(result)).toEqual({ a: 2, b: 2, c: 1 });
  });

  it('removes every option tied for last in one round', () => {
    const result = tally(
      poll('ranked', ['a', 'b', 'c', 'd']),
      ballots(['a'], ['a'], ['b', 'a'], ['c', 'b'], ['d', 'b']),
    );
    expect(result.rounds?.[0]?.eliminated).toEqual(['b', 'c', 'd']);
    expect(result.winners).toEqual(['a']);
  });

  it('ends in a tie when everyone left is level', () => {
    const result = tally(poll('ranked', ['a', 'b']), ballots(['a'], ['b']));
    expect(result.winners).toEqual(['a', 'b']);
  });

  it('ignores exhausted ballots when judging the majority', () => {
    // a 2 of 4 is not a majority; b and c go out with no further preferences, leaving a.
    const result = tally(poll('ranked'), ballots(['a'], ['a'], ['b'], ['c']));
    expect(result.winners).toEqual(['a']);
    expect(result.rounds?.at(-1)?.counts).toEqual([{ optionId: 'a', votes: 2 }]);
  });

  it('has no winner when nobody voted', () => {
    expect(tally(poll('ranked'), [])).toMatchObject({ winners: [], rounds: [] });
  });
});
