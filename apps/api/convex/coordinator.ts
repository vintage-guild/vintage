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
import { coordinatorStore, tickSource } from './stores';

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

function discordPorts(token: string): CoordinatorDiscord {
  const rest = createDiscordRest({ token });
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
        },
        discord: discordPorts(token),
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
