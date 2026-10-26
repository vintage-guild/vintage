// Component functions for signups. Called only by apps/api through `components.raids`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { signupFields } from './schema';

const toSignup = (doc: Doc<'signups'>) => {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id as string, ...rest };
};

const { guildId: _g, eventId: _e, memberId: _m, ...patchable } = signupFields;
const signupPatch = v.object(patchable).partial();

export const list = query({
  args: { guildId: v.string(), eventId: v.string() },
  handler: async (ctx, { guildId, eventId }) => {
    const docs = await ctx.db
      .query('signups')
      .withIndex('by_guild_event', (q) => q.eq('guildId', guildId).eq('eventId', eventId))
      .collect();
    return docs.sort((a, b) => a.signedUpAt - b.signedUpAt).map(toSignup);
  },
});

export const get = query({
  args: { guildId: v.string(), signupId: v.string() },
  handler: async (ctx, { guildId, signupId }) => {
    const id = ctx.db.normalizeId('signups', signupId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toSignup(doc) : null;
  },
});

export const byMember = query({
  args: { guildId: v.string(), eventId: v.string(), memberId: v.string() },
  handler: async (ctx, { guildId, eventId, memberId }) => {
    const doc = await ctx.db
      .query('signups')
      .withIndex('by_guild_event_member', (q) =>
        q.eq('guildId', guildId).eq('eventId', eventId).eq('memberId', memberId),
      )
      .first();
    return doc ? toSignup(doc) : null;
  },
});

export const insert = mutation({
  args: signupFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('signups', args);
    return toSignup((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: { guildId: v.string(), signupId: v.string(), patch: signupPatch },
  handler: async (ctx, { guildId, signupId, patch }) => {
    const id = ctx.db.normalizeId('signups', signupId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('signup not found');
    await ctx.db.patch(doc._id, patch);
    return toSignup({ ...doc, ...patch });
  },
});

export const remove = mutation({
  args: { guildId: v.string(), signupId: v.string() },
  handler: async (ctx, { guildId, signupId }) => {
    const id = ctx.db.normalizeId('signups', signupId);
    const doc = id ? await ctx.db.get(id) : null;
    if (doc && doc.guildId === guildId) await ctx.db.delete(doc._id);
  },
});
