import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

/** Keep ranks and tiers in step with Discord roles (PLAN §3.4, #8). */
crons.interval('role-sync', { minutes: 15 }, internal.roleSync.syncAllMembers);

/** The raid coordinator: post, remind, digest, lock (PLAN §6.1, #16). Idempotent per run. */
crons.interval('coordinator', { minutes: 5 }, internal.coordinator.tick);

/** Open due draft polls and close due open ones (#61). Idempotent per run. */
crons.interval('poll-sweep', { minutes: 5 }, internal.polls.sweep);

/** Delete idle Agents API sessions and close expired confirmations (PLAN §3.10, #129). */
crons.interval('agent-sweep', { hours: 1 }, internal.agent.sweep);

export default crons;
