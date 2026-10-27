// Component functions for insights. Called only by apps/api through `components.insights`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { findingFields, optInFields, runFields } from './schema';

const strip = <T extends { _id: unknown; _creationTime: number }>(doc: T) => {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
};
const toRun = (doc: Doc<'runs'>) => ({ id: doc._id as string, ...strip(doc) });
const toFinding = (doc: Doc<'findings'>) => ({ id: doc._id as string, ...strip(doc) });

export const insertRun = mutation({
  args: runFields,
  handler: async (ctx, args) => toRun((await ctx.db.get(await ctx.db.insert('runs', args)))!),
});

export const getRun = query({
  args: { guildId: v.string(), runId: v.string() },
  handler: async (ctx, { guildId, runId }) => {
    const id = ctx.db.normalizeId('runs', runId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toRun(doc) : null;
  },
});

export const getRunByKey = query({
  args: { guildId: v.string(), runKey: v.string() },
  handler: async (ctx, { guildId, runKey }) => {
    const doc = await ctx.db
      .query('runs')
      .withIndex('by_guild_key', (q) => q.eq('guildId', guildId).eq('runKey', runKey))
      .first();
    return doc ? toRun(doc) : null;
  },
});

export const listRuns = query({
  args: { guildId: v.string(), limit: v.number() },
  handler: async (ctx, { guildId, limit }) =>
    (
      await ctx.db
        .query('runs')
        .withIndex('by_guild_created', (q) => q.eq('guildId', guildId))
        .order('desc')
        .take(Math.min(limit, 50))
    ).map(toRun),
});

export const markSent = mutation({
  args: { guildId: v.string(), runId: v.string(), at: v.number() },
  handler: async (ctx, { guildId, runId, at }) => {
    const id = ctx.db.normalizeId('runs', runId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!id || !doc || doc.guildId !== guildId) throw new Error(`run ${runId} not found`);
    await ctx.db.patch(id, { sentAt: at });
    return toRun((await ctx.db.get(id))!);
  },
});

export const insertFindings = mutation({
  args: { findings: v.array(v.object(findingFields)) },
  handler: async (ctx, { findings }) => {
    for (const f of findings) await ctx.db.insert('findings', f);
  },
});

export const listFindings = query({
  args: { guildId: v.string(), runId: v.string() },
  handler: async (ctx, { guildId, runId }) =>
    (
      await ctx.db
        .query('findings')
        .withIndex('by_guild_run', (q) => q.eq('guildId', guildId).eq('runId', runId))
        .collect()
    )
      .sort((a, b) => b.weight - a.weight)
      .map(toFinding),
});

export const getOptIn = query({
  args: { guildId: v.string(), memberId: v.string() },
  handler: async (ctx, { guildId, memberId }) => {
    const doc = await ctx.db
      .query('optins')
      .withIndex('by_guild_member', (q) => q.eq('guildId', guildId).eq('memberId', memberId))
      .first();
    return doc ? strip(doc) : null;
  },
});

export const setOptIn = mutation({
  args: optInFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('optins')
      .withIndex('by_guild_member', (q) =>
        q.eq('guildId', args.guildId).eq('memberId', args.memberId),
      )
      .first();
    if (existing) await ctx.db.replace(existing._id, args);
    else await ctx.db.insert('optins', args);
    return args;
  },
});

export const listOptedIn = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) =>
    (
      await ctx.db
        .query('optins')
        .withIndex('by_guild_dms', (q) => q.eq('guildId', guildId).eq('dms', true))
        .collect()
    ).map((o) => o.memberId),
});
