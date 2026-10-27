// Component functions for applications and their config. Called only by apps/api through
// `components.applications`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { applicationFields, configFields, labels, status } from './schema';

const toApplication = (doc: Doc<'applications'>) => {
  const { _id, _creationTime, onboardedAt, ...rest } = doc;
  // Applications accepted before #135 got the onboarding DM at accept time: count them as onboarded.
  const legacy = onboardedAt === undefined && doc.status === 'accepted' ? doc.reviewedAt : null;
  return { id: _id as string, ...rest, onboardedAt: onboardedAt ?? legacy };
};

export const insert = mutation({
  args: applicationFields,
  handler: async (ctx, args) =>
    toApplication((await ctx.db.get(await ctx.db.insert('applications', args)))!),
});

export const get = query({
  args: { guildId: v.string(), applicationId: v.string() },
  handler: async (ctx, { guildId, applicationId }) => {
    const id = ctx.db.normalizeId('applications', applicationId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toApplication(doc) : null;
  },
});

export const update = mutation({
  args: {
    guildId: v.string(),
    applicationId: v.string(),
    patch: v.object({
      status: v.optional(status),
      labels: v.optional(labels),
      reply: v.optional(v.union(v.string(), v.null())),
      reviewedBy: v.optional(v.union(v.string(), v.null())),
      reviewedAt: v.optional(v.union(v.number(), v.null())),
      postChannelId: v.optional(v.union(v.string(), v.null())),
      postMessageId: v.optional(v.union(v.string(), v.null())),
      onboardedAt: v.optional(v.union(v.number(), v.null())),
      updatedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { guildId, applicationId, patch }) => {
    const id = ctx.db.normalizeId('applications', applicationId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!id || !doc || doc.guildId !== guildId) {
      throw new Error(`application ${applicationId} not found`);
    }
    await ctx.db.patch(id, patch);
    return toApplication((await ctx.db.get(id))!);
  },
});

/** Newest first, the same order as the memory store. */
export const list = query({
  args: {
    guildId: v.string(),
    discordId: v.optional(v.string()),
    statuses: v.optional(v.array(status)),
    since: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { guildId, discordId, statuses, since, limit }) => {
    const from = since ?? 0;
    const base =
      discordId !== undefined
        ? ctx.db
            .query('applications')
            .withIndex('by_guild_discord_created', (q) =>
              q.eq('guildId', guildId).eq('discordId', discordId).gte('createdAt', from),
            )
        : ctx.db
            .query('applications')
            .withIndex('by_guild_created', (q) => q.eq('guildId', guildId).gte('createdAt', from));
    const rows = await base
      .order('desc')
      .filter((q) =>
        statuses?.length ? q.or(...statuses.map((s) => q.eq(q.field('status'), s))) : true,
      )
      .take(Math.min(limit ?? 100, 200));
    return rows.map(toApplication);
  },
});

export const getConfig = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const doc = await ctx.db
      .query('config')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .unique();
    if (!doc) return null;
    const { _id, _creationTime, ...rest } = doc;
    return rest;
  },
});

export const putConfig = mutation({
  args: configFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('config')
      .withIndex('by_guild', (q) => q.eq('guildId', args.guildId))
      .unique();
    if (existing) await ctx.db.replace(existing._id, args);
    else await ctx.db.insert('config', args);
    return args;
  },
});
