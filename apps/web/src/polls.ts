// Polls on the site (#63): the home page's open poll and the /polls page show the same
// `vintage-poll-card`, built here from what `poll-get` answers. The server decides who may see
// a poll and its tally (`resultsHidden`); this only turns that answer into the card's settings.
import type { Poll, PollResults } from '@vintage/polls/contract';
import type { PollCardMethod, PollCardOption } from '@vintage/ui-kit';
import { formatMonthDay, formatWeekday } from './dates';

/** What `poll-get` answers: the poll (its tally only when the caller may see it) and my ballot. */
export interface PollGet {
  poll: Poll & { results: PollResults | null; resultsHidden: boolean };
  myVote: string[] | null;
  ballots: number;
}

/** Everything a `vintage-poll-card` needs for one poll. */
export interface PollCardModel {
  id: string;
  question: string;
  description: string;
  method: PollCardMethod;
  maxChoices: number | null;
  readonly: boolean;
  resultsHidden: boolean;
  ballots: number;
  options: PollCardOption[];
  myChoices: string[];
  winners: string[];
  note: string;
}

const AUDIENCE: Record<string, string> = {
  member: 'members and up',
  recruit: 'recruits and up',
  raider: 'raiders and up',
  leader: 'leaders and officers',
  officer: 'officers',
};

const when = (ms: number) => `${formatWeekday(ms)} ${formatMonthDay(ms)}`;

/** "7 ballots · raiders and up · closes Fri Oct 30", or "closed Sun Oct 25". */
export function pollNote(got: PollGet): string {
  const { poll, ballots } = got;
  const parts = [`${ballots} ballot${ballots === 1 ? '' : 's'}`];
  parts.push(AUDIENCE[poll.eligibleTier] ?? poll.eligibleTier);
  if (poll.anonymous) parts.push('anonymous');
  if (poll.status === 'open' && poll.closesAt) parts.push(`closes ${when(poll.closesAt)}`);
  if (poll.status === 'closed' && poll.closedAt) parts.push(`closed ${when(poll.closedAt)}`);
  if (poll.resultsHidden) {
    parts.push(
      poll.status === 'open' && poll.resultsVisible === 'after-close'
        ? 'results when it closes'
        : 'results are for officers',
    );
  }
  return parts.join(' · ');
}

export function pollCardModel(got: PollGet): PollCardModel {
  const { poll, myVote, ballots } = got;
  const tally = poll.resultsHidden ? null : poll.results;
  return {
    id: poll.id,
    question: poll.question,
    description: poll.description ?? '',
    method: poll.method,
    maxChoices: poll.maxChoices,
    readonly: poll.status !== 'open',
    resultsHidden: poll.resultsHidden || !tally,
    ballots: tally?.ballots ?? ballots,
    options: poll.options.map((o) => ({
      id: o.id,
      label: o.emoji ? `${o.emoji} ${o.label}` : o.label,
      votes: tally?.options.find((t) => t.optionId === o.id)?.votes ?? 0,
    })),
    myChoices: myVote ?? [],
    winners: poll.status === 'closed' && tally ? tally.winners : [],
    note: pollNote(got),
  };
}
