import { type Caller, error, success, type Tier, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  POLL_LIMITS,
  POLL_METHODS,
  type Poll,
  type PollMethod,
  RESULTS_VISIBILITY,
} from '../contract';
import { tally } from '../domain/tally';
import { command } from '../store';
import {
  actorOf,
  canManage,
  closePoll,
  eligibleTierSchema,
  findPoll,
  instantSchema,
  isLeader,
  notSignedIn,
  notYours,
  openPoll,
  optionsSchema,
  pollNotFound,
  tagsSchema,
  wrongStatus,
} from './shared';

const invalid = (code: string, message: string, suggestion: string) =>
  error(code, message, { suggestion, retryable: false });

/** Close and open times must make sense together and lie in the future. */
function checkTimes(opensAt: number | null, closesAt: number | null, now: number) {
  if (closesAt !== null && closesAt <= now) {
    return invalid('INVALID_TIME', 'closesAt is in the past', 'Pick a close time in the future');
  }
  if (opensAt !== null && closesAt !== null && opensAt >= closesAt) {
    return invalid(
      'INVALID_TIME',
      'opensAt is not before closesAt',
      'Open the poll before it closes',
    );
  }
  return null;
}

/**
 * Raiders reach raiders and up; members and recruits take a raid leader; nobody targets a
 * tier above their own (polls.plan.md decision 1).
 */
function checkAudience(caller: Caller, eligibleTier: Tier) {
  if (!tierAllows(caller.tier, eligibleTier)) {
    return invalid(
      'TIER_TOO_HIGH',
      `You can't create a poll for ${eligibleTier} and up`,
      'Pick an eligibleTier at or below your own',
    );
  }
  if (!tierAllows(eligibleTier, 'raider') && !isLeader(caller)) {
    return invalid(
      'FORBIDDEN',
      `Only raid leaders can create polls for ${eligibleTier}s`,
      'Use eligibleTier raider, or ask a raid leader',
    );
  }
  return null;
}

function checkMaxChoices(method: PollMethod, maxChoices: number | null, optionCount: number) {
  if (maxChoices === null) return null;
  if (method !== 'multi') {
    return invalid('INVALID_CHOICES', 'maxChoices only applies to multi polls', 'Drop maxChoices');
  }
  if (maxChoices > optionCount) {
    return invalid(
      'INVALID_CHOICES',
      'maxChoices is more than the number of options',
      `Use at most ${optionCount}`,
    );
  }
  return null;
}

export const pollCreate = command({
  name: 'poll-create',
  description:
    'Create a poll: a question, 2–25 options, a method (single, multi, or ranked), who may vote ' +
    '(eligibleTier, raider by default), and optional anonymity, hidden results, quorum, and ' +
    'close time. Opens at once unless open is false or opensAt is later. Raiders create polls ' +
    'for raiders and up; reaching members or recruits takes a raid leader, and nobody can ' +
    'target a tier above their own.',
  tier: 'raider',
  mutation: true,
  input: z.object({
    question: z.string().trim().min(1).max(POLL_LIMITS.question),
    description: z.string().trim().max(POLL_LIMITS.description).nullable().optional(),
    options: optionsSchema,
    method: z.enum(POLL_METHODS).default('single'),
    maxChoices: z.number().int().min(1).max(POLL_LIMITS.maxOptions).nullable().optional(),
    eligibleTier: eligibleTierSchema.default('raider'),
    anonymous: z.boolean().default(false),
    resultsVisible: z.enum(RESULTS_VISIBILITY).default('live'),
    quorum: z.number().int().min(1).nullable().optional(),
    opensAt: instantSchema.nullable().optional(),
    closesAt: instantSchema.nullable().optional(),
    tags: tagsSchema.default([]),
    open: z.boolean().default(true),
  }),
  handler: async (input, { caller, guildId, deps, now }) => {
    if (!caller.memberId && caller.surface !== 'system') return notSignedIn();
    const at = now();
    const opensAt = input.opensAt ?? null;
    const closesAt = input.closesAt ?? null;
    const maxChoices = input.maxChoices ?? null;
    const problem =
      checkAudience(caller, input.eligibleTier) ??
      checkMaxChoices(input.method, maxChoices, input.options.length) ??
      checkTimes(opensAt, closesAt, at);
    if (problem) return problem;

    const draft = await deps.polls.insertPoll({
      guildId,
      question: input.question,
      description: input.description ?? null,
      options: input.options,
      method: input.method,
      maxChoices,
      eligibleTier: input.eligibleTier,
      anonymous: input.anonymous,
      resultsVisible: input.resultsVisible,
      quorum: input.quorum ?? null,
      status: 'draft',
      opensAt,
      closesAt,
      createdBy: actorOf(caller),
      closedBy: null,
      createdAt: at,
      closedAt: null,
      tags: [...new Set(input.tags)],
      configVersion: 1,
      results: null,
    });
    const startNow = input.open && (opensAt === null || opensAt <= at);
    const poll = startNow ? await openPoll(deps, draft, at) : draft;
    return success(poll, {
      reasoning: startNow
        ? `Opened "${poll.question}" for ${poll.eligibleTier}s`
        : `Saved "${poll.question}" as a draft`,
    });
  },
});

export const pollUpdate = command({
  name: 'poll-update',
  description:
    'Change a draft or open poll: question, description, close time, result visibility, quorum, ' +
    'or tags. Options can change only while nobody has voted. The creator or a raid leader.',
  tier: 'raider',
  mutation: true,
  input: z.object({
    pollId: z.string().min(1),
    question: z.string().trim().min(1).max(POLL_LIMITS.question).optional(),
    description: z.string().trim().max(POLL_LIMITS.description).nullable().optional(),
    options: optionsSchema.optional(),
    closesAt: instantSchema.nullable().optional(),
    resultsVisible: z.enum(RESULTS_VISIBILITY).optional(),
    quorum: z.number().int().min(1).nullable().optional(),
    tags: tagsSchema.optional(),
  }),
  handler: async ({ pollId, ...patch }, { caller, guildId, deps, now }) => {
    const poll = await findPoll(deps, guildId, caller, pollId);
    if (!poll) return pollNotFound();
    if (!canManage(caller, poll)) return notYours();
    if (poll.status !== 'draft' && poll.status !== 'open') {
      return wrongStatus(poll, ['draft', 'open']);
    }
    if (patch.options) {
      if ((await deps.polls.countVotes(guildId, pollId)) > 0) {
        return invalid(
          'OPTIONS_LOCKED',
          'Options are locked once someone has voted',
          'Cancel this poll and create a new one to change the options',
        );
      }
      if (poll.maxChoices !== null && poll.maxChoices > patch.options.length) {
        return invalid('INVALID_CHOICES', 'Fewer options than maxChoices', 'Keep more options');
      }
    }
    const timeError =
      patch.closesAt === undefined
        ? null
        : checkTimes(poll.status === 'draft' ? poll.opensAt : null, patch.closesAt, now());
    if (timeError) return timeError;

    const changes: Partial<Poll> = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    if (patch.tags) changes.tags = [...new Set(patch.tags)];
    const updated = await deps.polls.updatePoll(guildId, pollId, {
      ...changes,
      configVersion: poll.configVersion + 1,
    });
    return success(updated);
  },
});

export const pollOpen = command({
  name: 'poll-open',
  description: 'Open a draft poll for voting now. The creator or a raid leader.',
  tier: 'raider',
  mutation: true,
  input: z.object({ pollId: z.string().min(1) }),
  handler: async ({ pollId }, { caller, guildId, deps, now }) => {
    const poll = await findPoll(deps, guildId, caller, pollId);
    if (!poll) return pollNotFound();
    if (!canManage(caller, poll)) return notYours();
    if (poll.status !== 'draft') return wrongStatus(poll, ['draft']);
    if (poll.closesAt !== null && poll.closesAt <= now()) {
      return invalid(
        'INVALID_TIME',
        'This poll would close before it opens',
        'Set a later closesAt',
      );
    }
    return success(await openPoll(deps, { ...poll, opensAt: null }, now()));
  },
});

export const pollClose = command({
  name: 'poll-close',
  description:
    'Close an open poll now and record its result. Shows the result that would be recorded ' +
    'first; confirm to close. The creator or a raid leader. Closing cannot be undone.',
  tier: 'raider',
  destructive: true,
  input: z.object({ pollId: z.string().min(1) }),
  handler: async ({ pollId }, { caller, guildId, deps, dryRun, now }) => {
    const poll = await findPoll(deps, guildId, caller, pollId);
    if (!poll) return pollNotFound();
    if (!canManage(caller, poll)) return notYours();
    if (poll.status !== 'open') return wrongStatus(poll, ['open']);
    if (dryRun) {
      const results = tally(poll, await deps.polls.listVotes(guildId, pollId));
      return success(
        { willClose: poll.question, results },
        { reasoning: `Closes "${poll.question}" with ${results.ballots} ballots` },
      );
    }
    return success(await closePoll(deps, poll, now(), actorOf(caller)));
  },
});

export const pollCancel = command({
  name: 'poll-cancel',
  description:
    'Cancel a draft or open poll with no result. Votes are kept for history. Shows a preview ' +
    'first; confirm to cancel. Raid leaders only.',
  tier: 'leader',
  destructive: true,
  input: z.object({ pollId: z.string().min(1) }),
  handler: async ({ pollId }, { caller, guildId, deps, dryRun, now }) => {
    const poll = await findPoll(deps, guildId, caller, pollId);
    if (!poll) return pollNotFound();
    if (poll.status !== 'draft' && poll.status !== 'open') {
      return wrongStatus(poll, ['draft', 'open']);
    }
    const ballots = await deps.polls.countVotes(guildId, pollId);
    if (dryRun) {
      return success(
        { willCancel: poll.question, ballots },
        { reasoning: `Cancels "${poll.question}"; ${ballots} ballots will not count` },
      );
    }
    const cancelled = await deps.polls.updatePoll(guildId, pollId, {
      status: 'cancelled',
      closedBy: actorOf(caller),
      closedAt: now(),
    });
    return success({ cancelled, ballots });
  },
});

export const pollSweep = command({
  name: 'poll-sweep',
  description:
    'Open drafts whose opensAt has passed and close open polls whose closesAt has passed. Safe ' +
    'to run repeatedly; the cron runs it every few minutes.',
  tier: 'leader',
  mutation: true,
  input: z.object({}),
  handler: async (_input, { guildId, deps, now }) => {
    const at = now();
    const opened: string[] = [];
    const closed: string[] = [];
    for (const draft of await deps.polls.listPolls(guildId, { statuses: ['draft'] })) {
      if (draft.opensAt === null || draft.opensAt > at) continue;
      if (draft.closesAt !== null && draft.closesAt <= at) continue;
      opened.push((await openPoll(deps, draft, at)).id);
    }
    for (const poll of await deps.polls.listPolls(guildId, { statuses: ['open'], closesBy: at })) {
      closed.push((await closePoll(deps, poll, at, null)).poll.id);
    }
    return success(
      { opened, closed },
      { reasoning: `Opened ${opened.length}, closed ${closed.length}` },
    );
  },
});
