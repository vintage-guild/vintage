// The coordinator tick (PLAN §6.1, #16): runs from crons.ts every 5 minutes, or on demand via
// `coordinator-run`. Planning and idempotency live in @vintage/coordinator (runTick); this file
// adapts its ports to Convex and the Discord REST API.
//   npx convex run coordinator:tick
import { type CoordinatorDiscord, runTick, type TickReport } from '@vintage/coordinator/commands';
import { createDiscordRest } from '@vintage/discord-kit';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { GUILD_ID, runSystemCommand } from './commands';
import { decisionsFor } from './decisions';
import { coordinatorStore, pollsStore, tickSource } from './stores';

export const state = internalQuery({
  args: { guildId: v.string(), now: v.number() },
  handler: (ctx, { guildId, now }) => tickSource(ctx).load(guildId, now),
});

export const config = internalQuery({
  args: { guildId: v.string() },
  handler: (ctx, { guildId }) => coordinatorStore(ctx).getConfig(guildId),
});

/** Raids work runs as raids commands with the system caller, through the same registry. */
export const materialize = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await runSystemCommand(ctx, 'schedule-materialize', {});
    if (!result.success) throw new Error(`schedule-materialize failed: ${result.error?.message}`);
  },
});

/**
 * A raid night's poll picked a time: create the raid as the system caller and mark the night
 * `created` in the same transaction, so a retried tick can never create it twice.
 */
export const createForRaidNight = internalMutation({
  args: {
    guildId: v.string(),
    raidNightId: v.string(),
    raid: v.object({
      name: v.string(),
      instance: v.string(),
      size: v.union(v.literal(10), v.literal(20), v.literal(40)),
      startsAt: v.number(),
      durationMinutes: v.number(),
    }),
    detail: v.string(),
  },
  handler: async (ctx, { guildId, raidNightId, raid, detail }) => {
    const result = await runSystemCommand(ctx, 'raid-create', raid);
    if (!result.success) throw new Error(`raid-create failed: ${result.error?.message}`);
    const { id } = result.data as { id: string };
    await coordinatorStore(ctx).updateRaidNight(guildId, raidNightId, {
      outcome: 'created',
      raidEventId: id,
      detail,
    });
    return { id };
  },
});

export const raidNights = internalQuery({
  args: { guildId: v.string() },
  handler: (ctx, { guildId }) =>
    coordinatorStore(ctx).listRaidNights(guildId, { outcome: 'pending' }),
});

export const updateRaidNight = internalMutation({
  args: {
    guildId: v.string(),
    raidNightId: v.string(),
    outcome: v.union(v.literal('cancelled'), v.literal('unresolved')),
    detail: v.string(),
  },
  handler: (ctx, { guildId, raidNightId, outcome, detail }) =>
    coordinatorStore(ctx).updateRaidNight(guildId, raidNightId, { outcome, detail }),
});

export const poll = internalQuery({
  args: { guildId: v.string(), pollId: v.string() },
  handler: (ctx, { guildId, pollId }) => pollsStore(ctx).getPoll(guildId, pollId),
});

export const lock = internalMutation({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const result = await runSystemCommand(ctx, 'roster-lock', { eventId });
    if (!result.success) throw new Error(`roster-lock failed: ${result.error?.message}`);
  },
});

export const claim = internalMutation({
  args: {
    guildId: v.string(),
    eventId: v.string(),
    rule: v.string(),
    target: v.string(),
    now: v.number(),
    staleMs: v.number(),
  },
  handler: (ctx, { now, staleMs, ...key }) => coordinatorStore(ctx).claimAction(key, now, staleMs),
});

export const complete = internalMutation({
  args: {
    guildId: v.string(),
    actionId: v.string(),
    status: v.union(v.literal('sent'), v.literal('skipped'), v.literal('failed')),
    discordMessageId: v.union(v.string(), v.null()),
    detail: v.union(v.string(), v.null()),
    renderHash: v.union(v.string(), v.null()),
    now: v.number(),
  },
  handler: (ctx, { guildId, actionId, now, ...result }) =>
    coordinatorStore(ctx).completeAction(guildId, actionId, result, now),
});

export const setRenderHash = internalMutation({
  args: { guildId: v.string(), actionId: v.string(), renderHash: v.string() },
  handler: (ctx, { guildId, actionId, renderHash }) =>
    coordinatorStore(ctx).setRenderHash(guildId, actionId, renderHash),
});

/** Server events go to the Discord server DISCORD_GUILD_ID names; without it they fail clearly. */
function discordPorts(token: string, discordGuildId: string | undefined): CoordinatorDiscord {
  const rest = createDiscordRest({ token });
  const guild = () => {
    if (!discordGuildId) throw new Error('set DISCORD_GUILD_ID to create server events');
    return discordGuildId;
  };
  const created = (message: unknown) => ({ id: (message as { id: string }).id });
  return {
    post: async (channelId, message) => created(await rest.createMessage(channelId, message)),
    edit: async (channelId, messageId, message) => {
      await rest.request('PATCH', `/channels/${channelId}/messages/${messageId}`, {
        body: message,
      });
    },
    remove: async (channelId, messageId) => {
      await rest.request('DELETE', `/channels/${channelId}/messages/${messageId}`);
    },
    dm: async (discordUserId, message) => {
      const channel = created(
        await rest.request('POST', '/users/@me/channels', {
          body: { recipient_id: discordUserId },
        }),
      );
      return created(await rest.createMessage(channel.id, message));
    },
    createEvent: (event) => rest.createScheduledEvent(guild(), event),
    editEvent: async (discordEventId, patch) => {
      await rest.editScheduledEvent(guild(), discordEventId, patch);
    },
  };
}

export const tick = internalAction({
  args: {},
  handler: async (ctx): Promise<TickReport> => {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) return { skipped: 'DISCORD_BOT_TOKEN is not set', outcomes: [] };
    const report = await runTick(
      {
        store: {
          getConfig: (guildId) => ctx.runQuery(internal.coordinator.config, { guildId }),
          setConfig: () => Promise.reject(new Error('a tick never changes config')),
          listActions: () => Promise.reject(new Error('a tick reads actions through state')),
          claimAction: (key, now, staleMs) =>
            ctx.runMutation(internal.coordinator.claim, { ...key, now, staleMs }),
          completeAction: (guildId, actionId, result, now) =>
            ctx.runMutation(internal.coordinator.complete, {
              guildId,
              actionId,
              status: result.status,
              discordMessageId: result.discordMessageId ?? null,
              detail: result.detail ?? null,
              renderHash: result.renderHash ?? null,
              now,
            }),
          setRenderHash: async (guildId, actionId, renderHash) => {
            await ctx.runMutation(internal.coordinator.setRenderHash, {
              guildId,
              actionId,
              renderHash,
            });
          },
          listRaidNights: (guildId) => ctx.runQuery(internal.coordinator.raidNights, { guildId }),
          insertRaidNight: () => Promise.reject(new Error('a tick never starts a raid-night poll')),
          updateRaidNight: (guildId, raidNightId, patch) => {
            if (patch.outcome !== 'cancelled' && patch.outcome !== 'unresolved') {
              return Promise.reject(new Error('a tick only cancels or unresolves a raid night'));
            }
            return ctx.runMutation(internal.coordinator.updateRaidNight, {
              guildId,
              raidNightId,
              outcome: patch.outcome,
              detail: patch.detail ?? '',
            });
          },
        },
        polls: {
          get: (guildId, pollId) => ctx.runQuery(internal.coordinator.poll, { guildId, pollId }),
        },
        source: {
          load: (guildId, now) => ctx.runQuery(internal.coordinator.state, { guildId, now }),
        },
        raids: {
          materialize: async () => {
            await ctx.runMutation(internal.coordinator.materialize, {});
          },
          lock: async (_guildId, eventId) => {
            await ctx.runMutation(internal.coordinator.lock, { eventId });
          },
          createForRaidNight: (guildId, raidNightId, raid, detail) =>
            ctx.runMutation(internal.coordinator.createForRaidNight, {
              guildId,
              raidNightId,
              raid,
              detail,
            }),
        },
        discord: discordPorts(token, process.env.DISCORD_GUILD_ID),
        // Server events link to the signup card, or to the site without a Discord server id.
        links: {
          discordGuildId: process.env.DISCORD_GUILD_ID ?? null,
          siteUrl: process.env.VINTAGE_SITE_URL ?? null,
        },
        // Signup-note labels for the digest (#132); null without a key, and the digest prints notes raw.
        decisions: decisionsFor(ctx, 'note-triage'),
      },
      GUILD_ID,
      Date.now(),
    );
    const counts: Record<string, number> = {};
    for (const o of report.outcomes) counts[o.status] = (counts[o.status] ?? 0) + 1;
    console.log(`Coordinator tick: ${report.skipped ?? JSON.stringify(counts)}`);
    return report;
  },
});
