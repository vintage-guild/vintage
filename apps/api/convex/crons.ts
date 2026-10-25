import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

/** Keep ranks and tiers in step with Discord roles (PLAN §3.4, #8). */
crons.interval('role-sync', { minutes: 15 }, internal.roleSync.syncAllMembers);

export default crons;
