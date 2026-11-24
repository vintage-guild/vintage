// Component functions for raid events. Called only by apps/api through `components.raids`.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
import { eventFields, raidStatus } from './schema';

const SHORT_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const SHORT_CODE_LENGTH = 6;
const SHORT_CODE_MAX_RETRIES = 10;
const SHORT_CODE_BYTE_LIMIT =
  Math.floor(256 / SHORT_CODE_ALPHABET.length) * SHORT_CODE_ALPHABET.length;

function randomShortCode(): string {
  const n = SHORT_CODE_ALPHABET.length;
  let out = '';
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint8Array(16);
    while (out.length < SHORT_CODE_LENGTH) {
      globalThis.crypto.getRandomValues(buf);
      for (const byte of buf) {
        if (byte >= SHORT_CODE_BYTE_LIMIT) continue;
        out += SHORT_CODE_ALPHABET[byte % n]!;
        if (out.length === SHORT_CODE_LENGTH) break;
      }
    }
    return out;
  }
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += SHORT_CODE_ALPHABET[Math.floor(Math.random() * n) % n]!;
  }
  return out;
}

async function allocateShortCode(ctx: MutationCtx, guildId: string): Promise<string> {
  for (let attempt = 0; attempt < SHORT_CODE_MAX_RETRIES; attempt++) {
    const candidate = randomShortCode();
    const existing = await ctx.db
      .query('raidEvents')
      .withIndex('by_guild_short_code', (q) => q.eq('guildId', guildId).eq('shortCode', candidate))
      .first();
    if (!existing) return candidate;
  }
  throw new Error('could not allocate a unique shortCode');
}

const toEvent = (doc: Doc<'raidEvents'>) => {
  const {
    _id,
    _creationTime,
    kind,
    access,
    notes,
    rosterApprovedAt,
    rosterApprovedBy,
    updatedAt,
    updatedBy,
    shortCode,
    ...rest
  } = doc;
  return {
    id: _id as string,
    ...rest,
    kind: kind ?? ('raid' as const),
    access: access ?? ('guild' as const),
    notes: notes ?? null,
    rosterApprovedAt: rosterApprovedAt ?? null,
    rosterApprovedBy: rosterApprovedBy ?? null,
    updatedAt: updatedAt ?? null,
    updatedBy: updatedBy ?? null,
    shortCode: shortCode ?? null,
  };
};

const { guildId: _guildId, ...patchable } = eventFields;
const eventPatch = v.object(patchable).partial();

export const list = query({
  args: {
    guildId: v.string(),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    scheduleId: v.optional(v.string()),
    statuses: v.optional(v.array(raidStatus)),
  },
  handler: async (ctx, { guildId, from, to, scheduleId, statuses }) => {
    const docs =
      scheduleId === undefined
        ? await ctx.db
            .query('raidEvents')
            .withIndex('by_guild_start', (q) => {
              const g = q.eq('guildId', guildId);
              const lower = from === undefined ? g : g.gte('startsAt', from);
              return to === undefined ? lower : lower.lt('startsAt', to);
            })
            .collect()
        : await ctx.db
            .query('raidEvents')
            .withIndex('by_guild_schedule_start', (q) => {
              const g = q.eq('guildId', guildId).eq('scheduleId', scheduleId);
              const lower = from === undefined ? g : g.gte('startsAt', from);
              return to === undefined ? lower : lower.lt('startsAt', to);
            })
            .collect();
    return docs.filter((d) => !statuses || statuses.includes(d.status)).map(toEvent);
  },
});

export const get = query({
  args: { guildId: v.string(), eventId: v.string() },
  handler: async (ctx, { guildId, eventId }) => {
    const id = ctx.db.normalizeId('raidEvents', eventId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && doc.guildId === guildId ? toEvent(doc) : null;
  },
});

export const byShortCode = query({
  args: { guildId: v.string(), shortCode: v.string() },
  handler: async (ctx, { guildId, shortCode }) => {
    const normalized = shortCode.trim().toLowerCase();
    if (!normalized) return null;
    const doc = await ctx.db
      .query('raidEvents')
      .withIndex('by_guild_short_code', (q) => q.eq('guildId', guildId).eq('shortCode', normalized))
      .first();
    return doc ? toEvent(doc) : null;
  },
});

export const insert = mutation({
  args: eventFields,
  handler: async (ctx, args) => {
    const shortCode = args.shortCode
      ? args.shortCode.trim().toLowerCase()
      : await allocateShortCode(ctx, args.guildId);
    const id = await ctx.db.insert('raidEvents', { ...args, shortCode });
    return toEvent((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: { guildId: v.string(), eventId: v.string(), patch: eventPatch },
  handler: async (ctx, { guildId, eventId, patch }) => {
    const id = ctx.db.normalizeId('raidEvents', eventId);
    const doc = id ? await ctx.db.get(id) : null;
    if (!doc || doc.guildId !== guildId) throw new Error('raid not found');
    await ctx.db.patch(doc._id, patch);
    return toEvent({ ...doc, ...patch });
  },
});

/** One-time backfill: assign a unique 6-char shortCode to older raids that lack one. */
export const backfillShortCodes = mutation({
  args: { guildId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { guildId, limit }) => {
    const max = Math.max(1, Math.min(limit ?? 200, 500));
    const docs = guildId
      ? await ctx.db
          .query('raidEvents')
          .withIndex('by_guild_start', (q) => q.eq('guildId', guildId))
          .collect()
      : await ctx.db.query('raidEvents').collect();
    let updated = 0;
    let remaining = 0;
    for (const doc of docs) {
      if (doc.shortCode) continue;
      if (updated >= max) {
        remaining++;
        continue;
      }
      const shortCode = await allocateShortCode(ctx, doc.guildId);
      await ctx.db.patch(doc._id, { shortCode });
      updated++;
    }
    return { scanned: docs.length, updated, remaining };
  },
});
