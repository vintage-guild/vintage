// Component functions for pending confirmations and stored tool results. Called only by apps/api.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { confirmationFields, confirmationStatus, toolResultFields } from './schema';

const toConfirmation = (doc: Doc<'confirmations'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const insert = mutation({
  args: confirmationFields,
  handler: async (ctx, args) =>
    toConfirmation((await ctx.db.get(await ctx.db.insert('confirmations', args)))!),
});

export const get = query({
  args: { guildId: v.string(), confirmationId: v.string() },
  handler: async (ctx, { guildId, confirmationId }) => {
    const id = ctx.db.normalizeId('confirmations', confirmationId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toConfirmation(doc) : null;
  },
});

export const update = mutation({
  args: {
    guildId: v.string(),
    confirmationId: v.string(),
    patch: v.object({
      status: v.optional(confirmationStatus),
      result: v.optional(v.any()),
      finishedAt: v.optional(v.union(v.number(), v.null())),
    }),
  },
  handler: async (ctx, { guildId, confirmationId, patch }) => {
    const id = ctx.db.normalizeId('confirmations', confirmationId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!id || !doc || doc.guildId !== guildId) {
      throw new Error(`confirmation ${confirmationId} not found`);
    }
    await ctx.db.patch(id, patch);
    return toConfirmation((await ctx.db.get(id))!);
  },
});

export const byRun = query({
  args: { guildId: v.string(), runId: v.string() },
  handler: async (ctx, { guildId, runId }) =>
    (
      await ctx.db
        .query('confirmations')
        .withIndex('by_guild_run', (q) => q.eq('guildId', guildId).eq('runId', runId))
        .collect()
    )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toConfirmation),
});

export const expired = query({
  args: { guildId: v.string(), now: v.number() },
  handler: async (ctx, { guildId, now }) =>
    (
      await ctx.db
        .query('confirmations')
        .withIndex('by_guild_status_expires', (q) =>
          q.eq('guildId', guildId).eq('status', 'pending').lt('expiresAt', now),
        )
        .take(100)
    ).map(toConfirmation),
});

export const getToolResult = query({
  args: { guildId: v.string(), runId: v.string(), callId: v.string() },
  handler: async (ctx, { guildId, runId, callId }) => {
    const doc = await ctx.db
      .query('toolResults')
      .withIndex('by_guild_run_call', (q) =>
        q.eq('guildId', guildId).eq('runId', runId).eq('callId', callId),
      )
      .unique();
    if (!doc) return null;
    const { _id, _creationTime, ...rest } = doc;
    return rest;
  },
});

export const putToolResult = mutation({
  args: toolResultFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('toolResults')
      .withIndex('by_guild_run_call', (q) =>
        q.eq('guildId', args.guildId).eq('runId', args.runId).eq('callId', args.callId),
      )
      .unique();
    if (!existing) await ctx.db.insert('toolResults', args);
  },
});
