import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { POLL_LIMITS, type Poll } from '../contract';
import { command } from '../store';
import { findPoll, notSignedIn, pollNotFound } from './shared';

const invalidChoices = (message: string, suggestion: string) =>
  error('INVALID_CHOICES', message, { suggestion, retryable: false });

const pollClosed = (poll: Poll) =>
  error('POLL_CLOSED', `"${poll.question}" is not taking votes`, {
    suggestion:
      poll.status === 'draft' ? 'It has not opened yet' : 'Use poll-results to see how it went',
    retryable: false,
  });

/** Open and not past its close time (the sweep may not have run yet). */
const takingVotes = (poll: Poll, at: number) =>
  poll.status === 'open' && (poll.closesAt === null || poll.closesAt > at);

/** Why a ballot is not valid for the poll, or null when it is. */
function checkChoices(poll: Poll, choices: string[]) {
  const known = new Set(poll.options.map((o) => o.id));
  const unknown = choices.filter((c) => !known.has(c));
  if (unknown.length) {
    return invalidChoices(
      `Not options on this poll: ${unknown.join(', ')}`,
      'Use the option ids from poll-get',
    );
  }
  if (new Set(choices).size !== choices.length) {
    return invalidChoices('An option is listed twice', 'List each option once');
  }
  if (poll.method === 'single' && choices.length !== 1) {
    return invalidChoices('Pick exactly one option', 'This poll takes a single choice');
  }
  if (poll.method === 'multi' && poll.maxChoices !== null && choices.length > poll.maxChoices) {
    return invalidChoices(
      `Pick at most ${poll.maxChoices} options`,
      `This poll allows ${poll.maxChoices} choices`,
    );
  }
  return null;
}

const sameChoices = (a: string[], b: string[], ordered: boolean) =>
  a.length === b.length &&
  (ordered ? a.every((c, i) => c === b[i]) : a.every((c) => b.includes(c)));

export const voteCast = command({
  name: 'vote-cast',
  description:
    'Vote on an open poll, or change your vote. choices are option ids: one for single polls, ' +
    'up to maxChoices for multi, and in preference order for ranked. One ballot per member; ' +
    'the same vote from Discord or the website replaces the last one.',
  tier: 'member',
  mutation: true,
  input: z.object({
    pollId: z.string().min(1),
    choices: z.array(z.string().min(1)).min(1).max(POLL_LIMITS.maxOptions),
  }),
  handler: async ({ pollId, choices }, { caller, guildId, deps, now }) => {
    if (!caller.memberId) return notSignedIn();
    const poll = await findPoll(deps, guildId, caller, pollId);
    if (!poll) return pollNotFound();
    const at = now();
    if (!takingVotes(poll, at)) return pollClosed(poll);
    const invalid = checkChoices(poll, choices);
    if (invalid) return invalid;

    const existing = await deps.polls.getVoteByMember(guildId, pollId, caller.memberId);
    const changed = !existing || !sameChoices(existing.choices, choices, poll.method === 'ranked');
    const vote = existing
      ? changed
        ? await deps.polls.updateVote(guildId, existing.id, { choices, updatedAt: at })
        : existing
      : await deps.polls.insertVote({
          guildId,
          pollId,
          memberId: caller.memberId,
          choices,
          weight: 1,
          castAt: at,
          updatedAt: at,
        });
    if (changed) {
      await deps.pollEvents.emit(guildId, 'vote-cast', {
        pollId,
        memberId: poll.anonymous ? null : caller.memberId,
        from: existing?.choices ?? null,
        to: choices,
      });
    }
    const labels = choices.map((c) => poll.options.find((o) => o.id === c)?.label ?? c);
    return success(
      { pollId, choices: vote.choices, labels },
      { reasoning: `You voted for ${labels.join(', ')}` },
    );
  },
});

export const voteRetract = command({
  name: 'vote-retract',
  description: 'Take back your vote on an open poll.',
  tier: 'member',
  mutation: true,
  input: z.object({ pollId: z.string().min(1) }),
  handler: async ({ pollId }, { caller, guildId, deps, now }) => {
    if (!caller.memberId) return notSignedIn();
    const poll = await findPoll(deps, guildId, caller, pollId);
    if (!poll) return pollNotFound();
    if (!takingVotes(poll, now())) return pollClosed(poll);
    const existing = await deps.polls.getVoteByMember(guildId, pollId, caller.memberId);
    if (!existing) return success({ pollId, retracted: false });
    await deps.polls.deleteVote(guildId, existing.id);
    await deps.pollEvents.emit(guildId, 'vote-cast', {
      pollId,
      memberId: poll.anonymous ? null : caller.memberId,
      from: existing.choices,
      to: null,
    });
    return success({ pollId, retracted: true });
  },
});
