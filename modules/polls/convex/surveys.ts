import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  pollStatus,
  resultsVisibility,
  surveyAnswer,
  surveyFields,
  surveyPostFields,
  surveyQuestion,
  surveyResponseFields,
  surveyResults,
  tier,
} from './schema';

const toSurvey = (doc: Doc<'surveys'>) => ({
  id: String(doc._id),
  guildId: doc.guildId,
  title: doc.title,
  description: doc.description,
  questions: doc.questions,
  eligibleTier: doc.eligibleTier,
  anonymous: doc.anonymous,
  resultsVisible: doc.resultsVisible,
  status: doc.status,
  opensAt: doc.opensAt,
  closesAt: doc.closesAt,
  createdBy: doc.createdBy,
  closedBy: doc.closedBy,
  createdAt: doc.createdAt,
  closedAt: doc.closedAt,
  tags: doc.tags,
  configVersion: doc.configVersion,
  results: doc.results,
});

const toResponse = (doc: Doc<'surveyResponses'>) => ({
  id: String(doc._id),
  guildId: doc.guildId,
  surveyId: doc.surveyId,
  memberId: doc.memberId,
  answers: doc.answers,
  submittedAt: doc.submittedAt,
  updatedAt: doc.updatedAt,
});

const toPost = (doc: Doc<'surveyPosts'>) => ({
  id: String(doc._id),
  guildId: doc.guildId,
  surveyId: doc.surveyId,
  channelId: doc.channelId,
  messageId: doc.messageId,
  renderedKey: doc.renderedKey,
});

export const list = query({
  args: {
    guildId: v.string(),
    statuses: v.optional(v.array(pollStatus)),
    tag: v.optional(v.string()),
    closesBy: v.optional(v.number()),
  },
  handler: async (ctx, { guildId, statuses, tag, closesBy }) => {
    const docs =
      statuses && statuses.length === 1
        ? await ctx.db
            .query('surveys')
            .withIndex('by_guild_status', (q) =>
              q.eq('guildId', guildId).eq('status', statuses[0]!),
            )
            .collect()
        : await ctx.db
            .query('surveys')
            .withIndex('by_guild', (q) => q.eq('guildId', guildId))
            .collect();
    return docs
      .filter(
        (s) =>
          (statuses === undefined || statuses.includes(s.status)) &&
          (tag === undefined || s.tags.includes(tag)) &&
          (closesBy === undefined || (s.closesAt !== null && s.closesAt <= closesBy)),
      )
      .sort(
        (a, b) =>
          (a.closesAt ?? Number.POSITIVE_INFINITY) - (b.closesAt ?? Number.POSITIVE_INFINITY) ||
          a.createdAt - b.createdAt,
      )
      .map(toSurvey);
  },
});

export const get = query({
  args: { guildId: v.string(), surveyId: v.string() },
  handler: async (ctx, { guildId, surveyId }) => {
    const id = ctx.db.normalizeId('surveys', surveyId);
    if (!id) return null;
    const doc = await ctx.db.get(id);
    return doc && doc.guildId === guildId ? toSurvey(doc) : null;
  },
});

export const insert = mutation({
  args: surveyFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('surveys', args);
    return toSurvey((await ctx.db.get(id))!);
  },
});

const surveyPatch = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.union(v.string(), v.null())),
  questions: v.optional(v.array(surveyQuestion)),
  eligibleTier: v.optional(tier),
  anonymous: v.optional(v.boolean()),
  resultsVisible: v.optional(resultsVisibility),
  status: v.optional(pollStatus),
  opensAt: v.optional(v.union(v.number(), v.null())),
  closesAt: v.optional(v.union(v.number(), v.null())),
  closedBy: v.optional(v.union(v.string(), v.null())),
  closedAt: v.optional(v.union(v.number(), v.null())),
  tags: v.optional(v.array(v.string())),
  configVersion: v.optional(v.number()),
  results: v.optional(v.union(surveyResults, v.null())),
});

export const update = mutation({
  args: { guildId: v.string(), surveyId: v.string(), patch: surveyPatch },
  handler: async (ctx, { guildId, surveyId, patch }) => {
    const id = ctx.db.normalizeId('surveys', surveyId) as Id<'surveys'> | null;
    const existing = id ? await ctx.db.get(id) : null;
    if (!existing || existing.guildId !== guildId) throw new Error('survey not found');
    await ctx.db.patch(existing._id, patch);
    return toSurvey((await ctx.db.get(existing._id))!);
  },
});

export const listResponses = query({
  args: { guildId: v.string(), surveyId: v.string() },
  handler: async (ctx, { guildId, surveyId }) => {
    const docs = await ctx.db
      .query('surveyResponses')
      .withIndex('by_guild_survey', (q) => q.eq('guildId', guildId).eq('surveyId', surveyId))
      .collect();
    return docs.sort((a, b) => a.submittedAt - b.submittedAt).map(toResponse);
  },
});

export const countResponses = query({
  args: { guildId: v.string(), surveyId: v.string() },
  handler: async (ctx, { guildId, surveyId }) => {
    const docs = await ctx.db
      .query('surveyResponses')
      .withIndex('by_guild_survey', (q) => q.eq('guildId', guildId).eq('surveyId', surveyId))
      .collect();
    return docs.length;
  },
});

export const responseByMember = query({
  args: { guildId: v.string(), surveyId: v.string(), memberId: v.string() },
  handler: async (ctx, { guildId, surveyId, memberId }) => {
    const doc = await ctx.db
      .query('surveyResponses')
      .withIndex('by_guild_survey_member', (q) =>
        q.eq('guildId', guildId).eq('surveyId', surveyId).eq('memberId', memberId),
      )
      .first();
    return doc ? toResponse(doc) : null;
  },
});

export const upsertResponse = mutation({
  args: surveyResponseFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('surveyResponses')
      .withIndex('by_guild_survey_member', (q) =>
        q.eq('guildId', args.guildId).eq('surveyId', args.surveyId).eq('memberId', args.memberId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        answers: args.answers,
        updatedAt: args.updatedAt,
      });
      return toResponse((await ctx.db.get(existing._id))!);
    }
    const id = await ctx.db.insert('surveyResponses', args);
    return toResponse((await ctx.db.get(id))!);
  },
});

export const listPosts = query({
  args: { guildId: v.string(), surveyId: v.string() },
  handler: async (ctx, { guildId, surveyId }) => {
    const docs = await ctx.db
      .query('surveyPosts')
      .withIndex('by_guild_survey', (q) => q.eq('guildId', guildId).eq('surveyId', surveyId))
      .collect();
    return docs.map(toPost);
  },
});

export const insertPost = mutation({
  args: surveyPostFields,
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('surveyPosts', args);
    return toPost((await ctx.db.get(id))!);
  },
});

export const updatePost = mutation({
  args: {
    guildId: v.string(),
    postId: v.string(),
    patch: v.object({ renderedKey: v.optional(v.string()) }),
  },
  handler: async (ctx, { guildId, postId, patch }) => {
    const id = ctx.db.normalizeId('surveyPosts', postId) as Id<'surveyPosts'> | null;
    const existing = id ? await ctx.db.get(id) : null;
    if (!existing || existing.guildId !== guildId) throw new Error('survey post not found');
    await ctx.db.patch(existing._id, patch);
    return toPost((await ctx.db.get(existing._id))!);
  },
});

export { surveyAnswer };
