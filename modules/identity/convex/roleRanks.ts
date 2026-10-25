// Component functions for the Discord role id → guild rank map. Called only by apps/api through
// `components.identity`, never by clients: the app layer authenticates and authorizes first.
import { type Infer, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { guildRank } from './schema';

const entry = v.object({ discordRoleId: v.string(), rank: guildRank });

type Entry = Infer<typeof entry>;
const byRoleId = (a: Entry, b: Entry) => a.discordRoleId.localeCompare(b.discordRoleId);

/** The guild's role → rank entries, ordered by Discord role id. */
export const list = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const docs = await ctx.db
      .query('roleRanks')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .collect();
    return docs.map(({ discordRoleId, rank }) => ({ discordRoleId, rank })).sort(byRoleId);
  },
});

/** Replace the guild's whole map with `entries`; a repeated role id keeps its last rank. */
export const replace = mutation({
  args: { guildId: v.string(), entries: v.array(entry) },
  handler: async (ctx, { guildId, entries }) => {
    const existing = await ctx.db
      .query('roleRanks')
      .withIndex('by_guild', (q) => q.eq('guildId', guildId))
      .collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    const next = new Map(entries.map((e) => [e.discordRoleId, e.rank]));
    for (const [discordRoleId, rank] of next) {
      await ctx.db.insert('roleRanks', { guildId, discordRoleId, rank });
    }
    return [...next].map(([discordRoleId, rank]) => ({ discordRoleId, rank })).sort(byRoleId);
  },
});
