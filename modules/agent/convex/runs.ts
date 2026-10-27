// Component functions for the run ledger. Called only by apps/api through `components.agent`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, type QueryCtx, query } from './_generated/server';
import { pageContext, runFields, runKind, runStatus, toolCall } from './schema';

/** A run with every field: rows from before #167 have no progress fields or tool-call times. */
const toRun = (doc: Doc<'runs'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return {
    id: _id as string,
    ...rest,
    toolCalls: rest.toolCalls.map((c) => ({
      ...c,
      summary: c.summary ?? null,
      error: c.error ?? null,
      startedAt: c.startedAt ?? null,
      finishedAt: c.finishedAt ?? null,
    })),
    context: rest.context ?? null,
    notes: rest.notes ?? [],
    draft: rest.draft ?? null,
    cancelRequested: rest.cancelRequested ?? false,
  };
};

const filterArgs = {
  guildId: v.string(),
  memberId: v.optional(v.string()),
  threadKey: v.optional(v.string()),
  kind: v.optional(runKind),
  statuses: v.optional(v.array(runStatus)),
  since: v.optional(v.number()),
};

type Filter = {
  guildId: string;
  memberId?: string;
  threadKey?: string;
  kind?: Doc<'runs'>['kind'];
  statuses?: Doc<'runs'>['status'][];
  since?: number;
};

/** Newest first, on the narrowest index the filter allows. Same order as the memory store. */
function select(ctx: QueryCtx, f: Filter) {
  const since = f.since ?? 0;
  const base =
    f.threadKey !== undefined
      ? ctx.db.query('runs').withIndex('by_guild_thread_created', (q) =>
          q
            .eq('guildId', f.guildId)
            .eq('threadKey', f.threadKey as string)
            .gte('createdAt', since),
        )
      : f.memberId !== undefined
        ? ctx.db.query('runs').withIndex('by_guild_member_created', (q) =>
            q
              .eq('guildId', f.guildId)
              .eq('memberId', f.memberId as string)
              .gte('createdAt', since),
          )
        : f.kind !== undefined
          ? ctx.db.query('runs').withIndex('by_guild_kind_created', (q) =>
              q
                .eq('guildId', f.guildId)
                .eq('kind', f.kind as Doc<'runs'>['kind'])
                .gte('createdAt', since),
            )
          : ctx.db
              .query('runs')
              .withIndex('by_guild_created', (q) =>
                q.eq('guildId', f.guildId).gte('createdAt', since),
              );
  return base.order('desc').filter((q) => {
    const conditions = [];
    // The thread index already pins the member: a thread key ends with its member id.
    if (f.threadKey === undefined && f.memberId !== undefined && f.kind !== undefined)
      conditions.push(q.eq(q.field('kind'), f.kind));
    if (f.threadKey !== undefined && f.kind !== undefined)
      conditions.push(q.eq(q.field('kind'), f.kind));
    if (f.threadKey !== undefined && f.memberId !== undefined)
      conditions.push(q.eq(q.field('memberId'), f.memberId));
    if (f.statuses?.length) {
      conditions.push(q.or(...f.statuses.map((s) => q.eq(q.field('status'), s))));
    }
    return conditions.length ? q.and(...conditions) : true;
  });
}

export const insert = mutation({
  args: runFields,
  handler: async (ctx, args) => toRun((await ctx.db.get(await ctx.db.insert('runs', args)))!),
});

export const get = query({
  args: { guildId: v.string(), runId: v.string() },
  handler: async (ctx, { guildId, runId }) => {
    const id = ctx.db.normalizeId('runs', runId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toRun(doc) : null;
  },
});

export const update = mutation({
  args: {
    guildId: v.string(),
    runId: v.string(),
    patch: v.object({
      kind: v.optional(runKind),
      memberId: v.optional(v.union(v.string(), v.null())),
      surface: v.optional(v.string()),
      threadKey: v.optional(v.union(v.string(), v.null())),
      label: v.optional(v.union(v.string(), v.null())),
      prompt: v.optional(v.string()),
      status: v.optional(runStatus),
      answer: v.optional(v.union(v.string(), v.null())),
      error: v.optional(v.union(v.string(), v.null())),
      model: v.optional(v.union(v.string(), v.null())),
      sessionId: v.optional(v.union(v.string(), v.null())),
      toolCalls: v.optional(v.array(toolCall)),
      confirmationIds: v.optional(v.array(v.string())),
      inputTokens: v.optional(v.union(v.number(), v.null())),
      finishedAt: v.optional(v.union(v.number(), v.null())),
      context: v.optional(v.union(pageContext, v.null())),
      notes: v.optional(v.array(v.string())),
      draft: v.optional(v.union(v.string(), v.null())),
      cancelRequested: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { guildId, runId, patch }) => {
    const id = ctx.db.normalizeId('runs', runId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!id || !doc || doc.guildId !== guildId) throw new Error(`run ${runId} not found`);
    await ctx.db.patch(id, patch);
    return toRun((await ctx.db.get(id))!);
  },
});

export const list = query({
  args: { ...filterArgs, limit: v.optional(v.number()) },
  handler: async (ctx, { limit, ...filter }) =>
    (await select(ctx, filter).take(Math.min(limit ?? 50, 200))).map(toRun),
});

export const count = query({
  args: filterArgs,
  handler: async (ctx, filter) => (await select(ctx, filter).collect()).length,
});
