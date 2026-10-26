import { type Caller, error, TIERS, type Tier, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  MIN_ELIGIBLE_TIER,
  POLL_LIMITS,
  type Poll,
  type PollResults,
  type PollStatus,
} from '../contract';
import { tally } from '../domain/tally';
import type { PollsDeps } from '../store';

export const pollNotFound = () =>
  error('POLL_NOT_FOUND', 'No such poll', {
    suggestion: 'Use poll-list to find the poll id',
    retryable: false,
  });

export const notSignedIn = () =>
  error('NOT_SIGNED_IN', 'Sign in with Discord first', {
    suggestion: 'Sign in on the website, or link your Discord account',
    retryable: false,
  });

export const notYours = () =>
  error('FORBIDDEN', 'Only the poll creator or a raid leader can change this poll', {
    suggestion: 'Ask a raid leader, or create your own poll with poll-create',
    retryable: false,
  });

export const wrongStatus = (poll: Poll, want: PollStatus[]) =>
  error('POLL_STATUS', `"${poll.question}" is ${poll.status}`, {
    suggestion:
      want.length === 1 ? `This needs a ${want[0]} poll` : `This needs a ${want.join(' or ')} poll`,
    retryable: false,
  });

/** Raid leaders and officers manage any poll; others only their own. */
export const isLeader = (caller: Caller) => tierAllows(caller.tier, 'leader');
export const isOfficer = (caller: Caller) => tierAllows(caller.tier, 'officer');
export const canManage = (caller: Caller, poll: Poll) =>
  isLeader(caller) || (caller.memberId !== undefined && caller.memberId === poll.createdBy);

/** May this caller vote on, or even see, the poll? Polls above your tier don't exist for you. */
export const canSee = (caller: Caller, poll: Poll) => tierAllows(caller.tier, poll.eligibleTier);

/** The tally is visible to officers always; to everyone else per `resultsVisible`. */
export function canSeeTally(caller: Caller, poll: Poll): boolean {
  if (isOfficer(caller)) return true;
  if (poll.status === 'closed') return poll.resultsVisible !== 'officers';
  return poll.status === 'open' && poll.resultsVisible === 'live';
}

/** Who made the change: the member, or the surface for system jobs (the sweep cron). */
export const actorOf = (caller: Caller) => caller.memberId ?? caller.surface;

/** Load a poll the caller can see, or the not-found answer. */
export async function findPoll(
  deps: PollsDeps,
  guildId: string,
  caller: Caller,
  pollId: string,
): Promise<Poll | null> {
  const poll = await deps.polls.getPoll(guildId, pollId);
  return poll && canSee(caller, poll) ? poll : null;
}

/** Freeze the result, mark the poll closed, and tell the bus. Shared by poll-close and the sweep. */
export async function closePoll(
  deps: PollsDeps,
  poll: Poll,
  at: number,
  closedBy: string | null,
): Promise<{ poll: Poll; results: PollResults }> {
  const results = tally(poll, await deps.polls.listVotes(poll.guildId, poll.id));
  const closed = await deps.polls.updatePoll(poll.guildId, poll.id, {
    status: 'closed',
    results,
    closedBy,
    closedAt: at,
  });
  await deps.pollEvents.emit(poll.guildId, 'poll-closed', {
    pollId: poll.id,
    tags: poll.tags,
    results,
  });
  return { poll: closed, results };
}

/** Mark a draft open and tell the bus. Shared by poll-create, poll-open, and the sweep. */
export async function openPoll(deps: PollsDeps, poll: Poll, at: number): Promise<Poll> {
  const opened = await deps.polls.updatePoll(poll.guildId, poll.id, {
    status: 'open',
    opensAt: poll.opensAt ?? at,
  });
  await deps.pollEvents.emit(poll.guildId, 'poll-opened', {
    pollId: opened.id,
    question: opened.question,
    closesAt: opened.closesAt,
    eligibleTier: opened.eligibleTier,
    tags: opened.tags,
  });
  return opened;
}

/** Epoch ms, or an ISO 8601 date-time with an offset (`2026-11-10T20:00:00-05:00`). */
export const instantSchema = z
  .union([z.number().int().positive(), z.iso.datetime({ offset: true })])
  .transform((value) => (typeof value === 'number' ? value : Date.parse(value)));

/** Tiers a poll may let vote: `member` and up. */
export const eligibleTierSchema = z
  .enum(TIERS)
  .refine((t: Tier) => tierAllows(t, MIN_ELIGIBLE_TIER), {
    message: `eligibleTier must be ${MIN_ELIGIBLE_TIER} or higher`,
  });

export const optionInputSchema = z.union([
  z.string().trim().min(1).max(POLL_LIMITS.optionLabel),
  z.object({
    label: z.string().trim().min(1).max(POLL_LIMITS.optionLabel),
    emoji: z.string().trim().min(1).max(64).nullable().optional(),
    value: z.string().max(200).nullable().optional(),
  }),
]);

export const optionsSchema = z
  .array(optionInputSchema)
  .min(POLL_LIMITS.minOptions)
  .max(POLL_LIMITS.maxOptions)
  .transform((options) =>
    options.map((o, i) => {
      const input = typeof o === 'string' ? { label: o } : o;
      return {
        id: `o${i + 1}`,
        label: input.label,
        emoji: input.emoji ?? null,
        value: input.value ?? null,
      };
    }),
  )
  .refine((options) => new Set(options.map((o) => o.label.toLowerCase())).size === options.length, {
    message: 'Option labels must be unique',
  });

export const tagsSchema = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Tags are kebab-case, e.g. raid-night')
      .max(POLL_LIMITS.tag),
  )
  .max(POLL_LIMITS.tags);

/** What a caller may see of a poll: the tally only when `canSeeTally` allows it. */
export interface PollView extends Omit<Poll, 'results'> {
  results: PollResults | null;
  resultsHidden: boolean;
}

export function viewOf(caller: Caller, poll: Poll, live?: PollResults): PollView {
  const visible = canSeeTally(caller, poll);
  const results = poll.status === 'closed' ? poll.results : (live ?? null);
  return { ...poll, results: visible ? results : null, resultsHidden: !visible };
}
