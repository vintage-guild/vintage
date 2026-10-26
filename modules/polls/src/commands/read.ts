import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { POLL_STATUSES } from '../contract';
import { tally } from '../domain/tally';
import { command } from '../store';
import { canSee, canSeeTally, findPoll, pollNotFound, viewOf } from './shared';

export const pollGet = command({
  name: 'poll-get',
  description:
    'One poll, your own vote, and the ballot count. The tally is included when you may see it ' +
    '(per the poll’s resultsVisible; officers always).',
  tier: 'member',
  input: z.object({ pollId: z.string().min(1) }),
  handler: async ({ pollId }, { caller, guildId, deps }) => {
    const poll = await findPoll(deps, guildId, caller, pollId);
    if (!poll) return pollNotFound();
    const votes = await deps.polls.listVotes(guildId, pollId);
    const mine = caller.memberId ? votes.find((v) => v.memberId === caller.memberId) : undefined;
    return success({
      poll: viewOf(caller, poll, poll.status === 'open' ? tally(poll, votes) : undefined),
      myVote: mine?.choices ?? null,
      ballots: votes.length,
    });
  },
});

export const pollList = command({
  name: 'poll-list',
  description:
    'Polls you may vote on, soonest to close first. Filter by status (open by default) or tag. ' +
    'Each includes the ballot count; tallies are left to poll-get and poll-results.',
  tier: 'member',
  input: z.object({
    statuses: z.array(z.enum(POLL_STATUSES)).min(1).default(['open']),
    tag: z.string().trim().toLowerCase().min(1).optional(),
  }),
  handler: async ({ statuses, tag }, { caller, guildId, deps }) => {
    const polls = (
      await deps.polls.listPolls(guildId, { statuses, ...(tag ? { tag } : {}) })
    ).filter((p) => canSee(caller, p));
    const rows = await Promise.all(
      polls.map(async (p) => ({
        ...viewOf(caller, p),
        ballots: await deps.polls.countVotes(guildId, p.id),
      })),
    );
    return success(rows);
  },
});

export const pollResults = command({
  name: 'poll-results',
  description:
    'The tally for a poll, and who voted for what when the poll is not anonymous. Live results ' +
    'show only when the poll allows it; officers always see the tally but never the voters of ' +
    'an anonymous poll.',
  tier: 'member',
  input: z.object({ pollId: z.string().min(1) }),
  handler: async ({ pollId }, { caller, guildId, deps }) => {
    const poll = await findPoll(deps, guildId, caller, pollId);
    if (!poll) return pollNotFound();
    if (!canSeeTally(caller, poll)) {
      return error(
        'RESULTS_HIDDEN',
        poll.status === 'open'
          ? 'Results show when the poll closes'
          : 'Results of this poll are for officers',
        { suggestion: 'Use poll-get to see your own vote and the ballot count', retryable: false },
      );
    }
    const votes = await deps.polls.listVotes(guildId, pollId);
    const results = poll.status === 'closed' && poll.results ? poll.results : tally(poll, votes);
    if (poll.anonymous) return success({ pollId, status: poll.status, results, voters: null });

    const voters = await Promise.all(
      votes.map(async (v) => ({
        memberId: v.memberId,
        displayName: (await deps.pollMembers.getMember(guildId, v.memberId))?.displayName ?? null,
        choices: v.choices,
      })),
    );
    return success({ pollId, status: poll.status, results, voters });
  },
});
