// Component functions for the coordinator action log. Called only by apps/api.
// `claim` runs as one Convex transaction, so two ticks can never both claim the same action.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { actionStatus } from './schema';

const toAction = (doc: Doc<'actions'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const list = query({
  args: {
    guildId: v.string(),
    eventIds: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { guildId, eventIds, limit }) => {
    const docs = eventIds
      ? (
          await Promise.all(
            eventIds.map((eventId) =>
              ctx.db
                .query('actions')
                .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
                .collect(),
            ),
          )
        ).flat()
      : await ctx.db
          .query('actions')
          .withIndex('by_guild_claimed', (q) => q.eq('guildId', guildId))
          .order('desc')
          .take(limit ?? 200);
    return docs
      .sort((a, b) => b.claimedAt - a.claimedAt)
      .slice(0, limit ?? docs.length)
      .map(toAction);
  },
});

export const claim = mutation({
  args: {
    guildId: v.string(),
    eventId: v.string(),
    rule: v.string(),
    target: v.string(),
    now: v.number(),
    staleMs: v.number(),
  },
  handler: async (ctx, { now, staleMs, ...key }) => {
    const existing = await ctx.db
      .query('actions')
      .withIndex('by_key', (q) =>
        q
          .eq('guildId', key.guildId)
          .eq('eventId', key.eventId)
          .eq('rule', key.rule)
          .eq('target', key.target),
      )
      .first();
    if (existing) {
      const settled = existing.status === 'sent' || existing.status === 'skipped';
      const fresh = existing.status === 'pending' && now - existing.claimedAt < staleMs;
      if (settled || fresh) return null;
      await ctx.db.patch(existing._id, { status: 'pending', claimedAt: now, finishedAt: null });
      return {
        action: toAction({ ...existing, status: 'pending', claimedAt: now, finishedAt: null }),
        retry: true,
      };
    }
    const id = await ctx.db.insert('actions', {
      ...key,
      status: 'pending',
      discordMessageId: null,
      detail: null,
      renderHash: null,
      claimedAt: now,
      finishedAt: null,
    });
    return { action: toAction((await ctx.db.get(id))!), retry: false };
  },
});

export const complete = mutation({
  args: {
    guildId: v.string(),
    actionId: v.string(),
    status: actionStatus,
    discordMessageId: v.union(v.string(), v.null()),
    detail: v.union(v.string(), v.null()),
    renderHash: v.union(v.string(), v.null()),
    now: v.number(),
  },
  handler: async (
    ctx,
    { guildId, actionId, status, discordMessageId, detail, renderHash, now },
  ) => {
    const id = ctx.db.normalizeId('actions', actionId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('action not found');
    const patch = {
      status,
      discordMessageId: discordMessageId ?? doc.discordMessageId,
      detail,
      renderHash: renderHash ?? doc.renderHash,
      finishedAt: now,
    };
    await ctx.db.patch(doc._id, patch);
    return toAction({ ...doc, ...patch });
  },
});

export const setRenderHash = mutation({
  args: { guildId: v.string(), actionId: v.string(), renderHash: v.string() },
  handler: async (ctx, { guildId, actionId, renderHash }) => {
    const id = ctx.db.normalizeId('actions', actionId);
    const doc = id ? await ctx.db.get(id) : null;
    if (doc && doc.guildId === guildId) await ctx.db.patch(doc._id, { renderHash });
  },
});
