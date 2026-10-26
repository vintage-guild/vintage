// Pure: a poll and its votes → the result. No I/O, no clock; the same input always gives the
// same output, so commands, the Discord renderer, and the website can all call it.

import type { OptionTally, Poll, PollResults, RankedRound, Vote } from '../contract';

type TallyPoll = Pick<Poll, 'method' | 'options' | 'maxChoices' | 'quorum'>;
type TallyVote = Pick<Vote, 'choices' | 'weight'>;

/**
 * A ballot's usable choices: known option ids, each once, first occurrence wins (so ranked
 * order is kept). `single` keeps one, `multi` keeps up to `maxChoices`.
 */
export function cleanChoices(poll: TallyPoll, choices: readonly string[]): string[] {
  const known = new Set(poll.options.map((o) => o.id));
  const clean: string[] = [];
  for (const c of choices) {
    if (known.has(c) && !clean.includes(c)) clean.push(c);
  }
  if (poll.method === 'single') return clean.slice(0, 1);
  if (poll.method === 'multi' && poll.maxChoices !== null) return clean.slice(0, poll.maxChoices);
  return clean;
}

const leaders = (counts: OptionTally[]): string[] => {
  const top = Math.max(0, ...counts.map((c) => c.votes));
  return top === 0 ? [] : counts.filter((c) => c.votes === top).map((c) => c.optionId);
};

function countFirst(
  ballots: { choices: string[]; weight: number }[],
  standing: string[],
): OptionTally[] {
  const counts = new Map(standing.map((id) => [id, 0]));
  for (const ballot of ballots) {
    const first = ballot.choices.find((c) => counts.has(c));
    if (first !== undefined) counts.set(first, (counts.get(first) ?? 0) + ballot.weight);
  }
  return standing.map((optionId) => ({ optionId, votes: counts.get(optionId) ?? 0 }));
}

/**
 * Instant-runoff. Each round counts every ballot for its highest-ranked option still standing;
 * ballots with none left are exhausted. An option with more than half of the live ballots
 * wins. Otherwise every option tied for last goes out together, unless that would remove
 * everyone left, in which case they all win (a tie).
 */
function instantRunoff(
  poll: TallyPoll,
  ballots: { choices: string[]; weight: number }[],
): { winners: string[]; rounds: RankedRound[] } {
  let standing = poll.options.map((o) => o.id);
  const rounds: RankedRound[] = [];
  if (ballots.length === 0) return { winners: [], rounds };

  for (;;) {
    const counts = countFirst(ballots, standing);
    const live = counts.reduce((sum, c) => sum + c.votes, 0);
    const majority = counts.find((c) => c.votes * 2 > live);
    if (majority || standing.length === 1) {
      rounds.push({ counts, eliminated: [] });
      return { winners: majority ? [majority.optionId] : standing, rounds };
    }
    const low = Math.min(...counts.map((c) => c.votes));
    const out = counts.filter((c) => c.votes === low).map((c) => c.optionId);
    if (out.length === standing.length) {
      rounds.push({ counts, eliminated: [] });
      return { winners: live === 0 ? [] : standing, rounds };
    }
    rounds.push({ counts, eliminated: out });
    standing = standing.filter((id) => !out.includes(id));
  }
}

/** Tally a poll. Votes for removed or unknown options are ignored; empty ballots don't count. */
export function tally(poll: TallyPoll, votes: readonly TallyVote[]): PollResults {
  const ballots = votes
    .map((v) => ({ choices: cleanChoices(poll, v.choices), weight: v.weight }))
    .filter((b) => b.choices.length > 0);
  const quorumMet = poll.quorum === null || ballots.length >= poll.quorum;
  const base = { method: poll.method, ballots: ballots.length, quorumMet };

  if (poll.method === 'ranked') {
    const { winners, rounds } = instantRunoff(poll, ballots);
    const options = countFirst(
      ballots,
      poll.options.map((o) => o.id),
    );
    return { ...base, options, winners, rounds };
  }

  const counts = new Map(poll.options.map((o) => [o.id, 0]));
  for (const ballot of ballots) {
    for (const choice of ballot.choices)
      counts.set(choice, (counts.get(choice) ?? 0) + ballot.weight);
  }
  const options = poll.options.map((o) => ({ optionId: o.id, votes: counts.get(o.id) ?? 0 }));
  return { ...base, options, winners: leaders(options), rounds: null };
}
