// Convex persistence and Discord delivery for deduplicated ops-channel cron alerts (#262).
import { createDiscordRest } from '@vintage/discord-kit';
import type { GenericActionCtx } from 'convex/server';
import { v } from 'convex/values';
import {
  type CronFailureAlert,
  OPS_ALERT_COOLDOWN_MS,
  type OpsAlertOutcome,
  type OpsAlertSnapshot,
  reportOpsAlert,
} from '../src/ops-alerts';
import { internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import { GUILD_ID } from './commands';

const snapshot = v.object({
  lastSentAt: v.number(),
  lastError: v.string(),
});

/** Atomically claim an alert slot if the key hasn't alerted within `cooldownMs`. */
export const claim = internalMutation({
  args: {
    guildId: v.string(),
    key: v.string(),
    now: v.number(),
    cooldownMs: v.number(),
    error: v.string(),
  },
  handler: async (
    ctx,
    { guildId, key, now, cooldownMs, error },
  ): Promise<{ claimed: true; previous: OpsAlertSnapshot | null } | { claimed: false }> => {
    const existing = await ctx.db
      .query('opsAlerts')
      .withIndex('by_guild_key', (q) => q.eq('guildId', guildId).eq('key', key))
      .first();
    if (existing && now - existing.lastSentAt < cooldownMs) {
      return { claimed: false };
    }
    const previous = existing
      ? { lastSentAt: existing.lastSentAt, lastError: existing.lastError }
      : null;
    if (existing) {
      await ctx.db.patch(existing._id, { lastSentAt: now, lastError: error });
    } else {
      await ctx.db.insert('opsAlerts', { guildId, key, lastSentAt: now, lastError: error });
    }
    return { claimed: true, previous };
  },
});

/** Restore the prior alert timestamp if posting to Discord failed. */
export const release = internalMutation({
  args: {
    guildId: v.string(),
    key: v.string(),
    previous: v.union(snapshot, v.null()),
  },
  handler: async (ctx, { guildId, key, previous }) => {
    const existing = await ctx.db
      .query('opsAlerts')
      .withIndex('by_guild_key', (q) => q.eq('guildId', guildId).eq('key', key))
      .first();
    if (!existing) return;
    if (previous) {
      await ctx.db.patch(existing._id, previous);
    } else {
      await ctx.db.delete(existing._id);
    }
  },
});

/** Post a deduplicated failure notice to the guild's ops channel from any Convex internalAction. */
export function reportCronFailure(
  ctx: GenericActionCtx<DataModel>,
  alert: CronFailureAlert,
  now = Date.now(),
  cooldownMs = OPS_ALERT_COOLDOWN_MS,
): Promise<OpsAlertOutcome> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return Promise.resolve('skipped');
  const rest = createDiscordRest({ token });
  return reportOpsAlert(
    {
      getOpsChannel: async (guildId) =>
        (await ctx.runQuery(internal.coordinator.config, { guildId })).opsChannelId,
      claim: (guildId, key, at, windowMs, error) =>
        ctx.runMutation(internal.opsAlerts.claim, {
          guildId,
          key,
          now: at,
          cooldownMs: windowMs,
          error,
        }),
      release: async (guildId, key, previous) => {
        await ctx.runMutation(internal.opsAlerts.release, { guildId, key, previous });
      },
      post: async (channelId, message) => {
        await rest.createMessage(channelId, message);
      },
    },
    GUILD_ID,
    alert,
    now,
    cooldownMs,
  );
}
