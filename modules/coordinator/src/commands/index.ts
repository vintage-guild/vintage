import { error, success } from '@vintage/guild-kit';
import { GUILD_RANKS } from '@vintage/identity/contract';
import { z } from 'zod';
import { renderSignupPost } from '../domain/card';
import { planTick } from '../domain/plan';
import { hashMessage } from '../domain/render';
import { command } from '../store';
import { raidNightPoll } from './raid-night';

export { renderRosterReply } from '../domain/card';
export type {
  CoordinatorDeps,
  CoordinatorDiscord,
  CoordinatorPolls,
  CoordinatorRaids,
  CoordinatorStore,
  TickEvent,
  TickMember,
  TickPorts,
  TickSource,
  TickState,
} from '../store';
export { runTick, type TickReport } from '../tick';

/** A Discord snowflake id (channel, user, role). */
const snowflake = z.string().regex(/^\d{17,20}$/, 'a Discord id: 17–20 digits');

export const coordinatorStatus = command({
  name: 'coordinator-status',
  description:
    'Whether the coordinator is running, its settings, and for each upcoming raid what it has ' +
    'done and what it will do next.',
  tier: 'leader',
  input: z.object({}),
  handler: async (_input, { guildId, deps, now }) => {
    const at = now();
    const state = await deps.tickSource.load(guildId, at);
    const due = planTick(state, at, (tick) => hashMessage(renderSignupPost(tick, state.members)));
    const upcoming = state.events.map(({ event }) => ({
      eventId: event.id,
      name: event.name,
      startsAt: event.startsAt,
      status: event.status,
      done: state.actions
        .filter((a) => a.eventId === event.id && a.status !== 'pending')
        .map((a) => ({ rule: a.rule, status: a.status, at: a.finishedAt })),
      dueNow: due
        .filter((a) => a.tick.event.id === event.id)
        .map((a) => (a.kind === 'refresh' ? 'refresh' : a.rule)),
    }));
    const { config } = state;
    const reasoning = config.paused
      ? 'Paused: run coordinator-resume to restart it'
      : !config.signupChannelId
        ? 'Not configured: set signupChannelId with coordinator-config-set'
        : `Running; ${upcoming.length} upcoming raid${upcoming.length === 1 ? '' : 's'}`;
    return success({ config, upcoming }, { reasoning });
  },
});

export const coordinatorPause = command({
  name: 'coordinator-pause',
  description: 'Stop the coordinator: no posts, reminders, or locks until coordinator-resume.',
  tier: 'leader',
  mutation: true,
  input: z.object({}),
  handler: async (_input, { guildId, deps, now }) =>
    success(await deps.coordinator.setConfig(guildId, { paused: true }, now()), {
      reasoning: 'Coordinator paused',
    }),
});

export const coordinatorResume = command({
  name: 'coordinator-resume',
  description:
    'Restart a paused coordinator. Anything that came due while paused goes out on the next tick.',
  tier: 'leader',
  mutation: true,
  input: z.object({}),
  handler: async (_input, { guildId, deps, now }) =>
    success(await deps.coordinator.setConfig(guildId, { paused: false }, now()), {
      reasoning: 'Coordinator running',
    }),
});

export const coordinatorRun = command({
  name: 'coordinator-run',
  description:
    'Run a coordinator tick now instead of waiting for the schedule (it runs every few minutes). ' +
    'Safe to repeat: nothing is sent twice.',
  tier: 'leader',
  mutation: true,
  input: z.object({}),
  handler: async (_input, { guildId, deps }) => {
    const config = await deps.coordinator.getConfig(guildId);
    if (config.paused) {
      return error('COORDINATOR_PAUSED', 'The coordinator is paused', {
        suggestion: 'Run coordinator-resume first',
        retryable: false,
      });
    }
    await deps.scheduler.runTickNow(guildId);
    return success(
      { scheduled: true },
      { reasoning: 'Tick started; check coordinator-status shortly' },
    );
  },
});

export const coordinatorConfigSet = command({
  name: 'coordinator-config-set',
  description:
    'Set where the coordinator posts (signup and officer channels), whose answers it chases ' +
    '(expectedRanks), and whether it DMs non-responders.',
  tier: 'officer',
  mutation: true,
  input: z.object({
    signupChannelId: snowflake.nullable().optional(),
    opsChannelId: snowflake.nullable().optional(),
    expectedRanks: z.array(z.enum(GUILD_RANKS)).min(1).optional(),
    dmReminders: z.boolean().optional(),
  }),
  handler: async (input, { guildId, deps, now }) => {
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const config = await deps.coordinator.setConfig(guildId, patch, now());
    return success(config, { reasoning: 'Coordinator settings saved' });
  },
});

export const coordinatorLog = command({
  name: 'coordinator-log',
  description:
    "What the coordinator did for a raid and why: posts, reminders, DMs, locks. Answers 'why did the bot ping me?'.",
  tier: 'member',
  input: z.object({
    eventId: z.string().min(1),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  handler: async ({ eventId, limit }, { guildId, deps }) =>
    success(await deps.coordinator.listActions(guildId, { eventIds: [eventId], limit })),
});

export const coordinatorRepost = command({
  name: 'coordinator-repost',
  description:
    "Replace a raid's signup post with a fresh one (the old message is deleted). Use it after the " +
    'post was deleted or its layout changed.',
  tier: 'leader',
  mutation: true,
  input: z.object({ eventId: z.string().min(1) }),
  handler: async ({ eventId }, { guildId, deps, now }) => {
    const [post] = (await deps.coordinator.listActions(guildId, { eventIds: [eventId] })).filter(
      (a) => a.rule === 'post' && a.status === 'sent',
    );
    if (!post) {
      return error('NO_POST', 'That raid has no signup post yet', {
        suggestion: 'The next coordinator tick posts it; run coordinator-run to post it now',
        retryable: false,
      });
    }
    await deps.coordinator.completeAction(
      guildId,
      post.id,
      { status: 'failed', detail: 'repost requested' },
      now(),
    );
    await deps.scheduler.runTickNow(guildId);
    return success({ eventId }, { reasoning: 'A fresh post goes out on the next tick' });
  },
});

/** Every coordinator command, registered by apps/api through guild-kit. */
export const coordinatorCommands = [
  coordinatorStatus,
  coordinatorPause,
  coordinatorResume,
  coordinatorRun,
  coordinatorConfigSet,
  coordinatorLog,
  coordinatorRepost,
  raidNightPoll,
] as const;
