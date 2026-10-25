// Component functions for members. Called only by apps/api through `components.identity`,
// never by clients: the app layer authenticates and authorizes first (PLAN §4.3).
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { prefs, tier } from './schema';

const toMember = (doc: Doc<'members'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

export const get = query({
  args: { guildId: v.string(), memberId: v.string() },
  handler: async (ctx, { guildId, memberId }) => {
    const id = ctx.db.normalizeId('members', memberId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toMember(doc) : null;
  },
});

export const byDiscordId = query({
  args: { guildId: v.string(), discordId: v.string() },
  handler: async (ctx, { guildId, discordId }) => {
    const doc = await ctx.db
      .query('members')
      .withIndex('by_guild_discord', (q) => q.eq('guildId', guildId).eq('discordId', discordId))
      .unique();
    return doc ? toMember(doc) : null;
  },
});

export const list = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const docs = await ctx.db
      .query('members')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .collect();
    return docs.map(toMember);
  },
});

export const upsert = mutation({
  args: {
    guildId: v.string(),
    discordId: v.string(),
    displayName: v.string(),
    roleIds: v.array(v.string()),
    tier,
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('members')
      .withIndex('by_guild_discord', (q) =>
        q.eq('guildId', args.guildId).eq('discordId', args.discordId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return toMember({ ...existing, ...args });
    }
    const id = await ctx.db.insert('members', { ...args, prefs: { dmOptOut: false } });
    return toMember((await ctx.db.get(id))!);
  },
});

export const setPrefs = mutation({
  args: { guildId: v.string(), memberId: v.string(), prefs },
  handler: async (ctx, { guildId, memberId, prefs: next }) => {
    const id = ctx.db.normalizeId('members', memberId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('member not found');
    await ctx.db.patch(doc._id, { prefs: next });
    return toMember({ ...doc, prefs: next });
  },
});
