// Armory fetches outside the command's transaction: armory-link, armory-refresh, and the sweep
// schedule `refresh` with link ids (ArmoryEffects in stores.ts); it asks Blizzard's Forever
// profile API about each character and hands what it found to `armory-record`. The guild
// roster works the same way, but `rosterSync` first asks Blizzard's guild roster endpoint for
// the current membership, then enriches a stale batch (RosterEffects in stores.ts), handing
// both to `armory-guild-roster-record`. Without BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET
// every fetch records an error saying so. BLIZZARD_REGION picks the region (us, eu, kr, tw;
// default us). BLIZZARD_GUILD_SLUG picks the guild for the roster sync (default vintage).
//   npx convex run armory:refresh '{"linkIds":["…"]}'
//   npx convex run armory:sweep
//   npx convex run armory:rosterSync '{"guildId":"vintage"}'
//   npx convex run armory:rosterMigrateRecipes   (once, after recipes moved to their own table)
//   npx convex run armory:catalogSweep           (the recipe catalog; the cron runs it daily)

import {
  catalogProfessions,
  chunkBySize,
  fetchArmory,
  fetchCatalog,
  fetchRosterEntry,
  serializedBytes,
  toRosterMembers,
} from '@vintage/armory/commands';
import {
  type ArmoryFetchResult,
  ROSTER_RECORD_BYTES,
  ROSTER_STALE_MS,
  ROSTER_SYNC_BATCH,
  type RosterFetchResult,
} from '@vintage/armory/contract';
import { createForeverApi, type ForeverApi, parseRegion } from '@vintage/forever-api';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { GUILD_ID, runSystemCommand } from './commands';
import { armoryStore, rosterStore } from './stores';

/** The links to fetch, as name and surname; ids that are gone are left out. */
export const load = internalQuery({
  args: { linkIds: v.array(v.string()) },
  handler: async (ctx, { linkIds }) => {
    const store = armoryStore(ctx);
    const links = await Promise.all(linkIds.map((id) => store.getLink(GUILD_ID, id)));
    return links.flatMap((l) =>
      l ? [{ id: l.id, slug: l.slug, name: l.name, surname: l.surname }] : [],
    );
  },
});

/** Write one fetch's result through `armory-record` (system only). */
export const record = internalMutation({
  args: { linkId: v.string(), slug: v.string(), result: v.any() },
  handler: (ctx, args) => runSystemCommand(ctx, 'armory-record', args),
});

/** The cron's entry point: `armory-sweep` schedules fetches for stale links. */
export const sweep = internalMutation({
  args: {},
  handler: (ctx) => runSystemCommand(ctx, 'armory-sweep', {}),
});

let client: { key: string; api: ForeverApi } | null = null;

/** One client per deployment config, so its token is reused across fetches in this isolate. */
function armoryClient(): ForeverApi | string {
  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return 'Vintage isn’t connected to Blizzard’s API yet (BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET)';
  }
  const region = parseRegion(process.env.BLIZZARD_REGION ?? 'us');
  if (!region) return `BLIZZARD_REGION must be us, eu, kr, or tw`;
  const key = `${region}:${clientId}`;
  if (client?.key !== key) {
    client = { key, api: createForeverApi({ region, clientId, clientSecret }) };
  }
  return client.api;
}

export const refresh = internalAction({
  args: { linkIds: v.array(v.string()) },
  handler: async (ctx, { linkIds }): Promise<Record<string, ArmoryFetchResult['status']>> => {
    const links = await ctx.runQuery(internal.armory.load, { linkIds });
    const api = armoryClient();
    const outcome: Record<string, ArmoryFetchResult['status']> = {};
    // One character at a time: 25 per sweep stays far inside Blizzard's 100 requests a second.
    for (const link of links) {
      const result: ArmoryFetchResult =
        typeof api === 'string'
          ? { status: 'error', error: api }
          : await fetchArmory(api, link.name, link.surname);
      const recorded = await ctx.runMutation(internal.armory.record, {
        linkId: link.id,
        slug: link.slug,
        result,
      });
      // A refused record (a field past its bound) leaves the link as it was; say so, or the
      // sweep would retry it every 12 hours without anyone knowing why.
      if (!recorded.success) {
        console.error(`armory ${link.slug}: record refused: ${recorded.error?.code}`);
      }
      outcome[link.slug] = recorded.success ? result.status : 'error';
    }
    return outcome;
  },
});

/** The guild-roster entries' Blizzard id and last check, for staleness. */
export const rosterStatus = internalQuery({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) =>
    (await rosterStore(ctx).listEntries(guildId)).map((e) => ({
      blizzardId: e.blizzardId,
      checkedAt: e.checkedAt,
    })),
});

/**
 * One-off after recipes moved to their own table: moves the legacy recipes 10 entries per
 * transaction, scheduling itself until the roster is done (each entry's next update moves them
 * too). Run once: `npx convex run armory:rosterMigrateRecipes`; watch the logs for the total.
 */
export const rosterMigrateRecipes = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), moved: v.optional(v.number()) },
  handler: async (ctx, { cursor = null, moved = 0 }) => {
    const page = await ctx.runMutation(components.armory.roster.migrateLegacyRecipes, {
      guildId: GUILD_ID,
      paginationOpts: { cursor, numItems: 10 },
    });
    const total = moved + page.moved;
    if (page.isDone) {
      console.log(`armory roster: moved recipes off ${total} entries`);
      return;
    }
    await ctx.scheduler.runAfter(0, internal.armory.rosterMigrateRecipes, {
      cursor: page.continueCursor,
      moved: total,
    });
  },
});

/** Write one roster sync's results through `armory-guild-roster-record` (system only). */
export const rosterRecord = internalMutation({
  args: {
    members: v.array(v.any()),
    enriched: v.array(v.object({ slug: v.string(), result: v.any() })),
  },
  handler: (ctx, args) => runSystemCommand(ctx, 'armory-guild-roster-record', args),
});

/** Write one profession's catalog through `armory-catalog-record` (system only). */
export const catalogRecord = internalMutation({
  args: { profession: v.string(), professionId: v.number(), categories: v.any() },
  handler: (ctx, args) => runSystemCommand(ctx, 'armory-catalog-record', args),
});

/** The cron's entry point: `armory-catalog-sync` schedules `catalogSync`. */
export const catalogSweep = internalMutation({
  args: {},
  handler: (ctx) => runSystemCommand(ctx, 'armory-catalog-sync', {}),
});

/**
 * Read every profession's recipe catalog from Blizzard's game data and record it, one profession
 * per call so a big one (Blacksmithing: 507 recipes) never shares an argument with the rest.
 * Gathering skills (their "recipes" are abilities) and Blizzard's "Test Profession" are skipped. A
 * profession that fails keeps its last catalog.
 */
export const catalogSync = internalAction({
  args: { guildId: v.string() },
  handler: async (ctx) => {
    const api = armoryClient();
    if (typeof api === 'string') {
      console.error(`armory catalog sync: ${api}`);
      return;
    }
    const index = await api.professionIndex();
    if (!index) {
      console.error('armory catalog sync: no profession index');
      return;
    }
    let recorded = 0;
    for (const { id, name } of catalogProfessions(index)) {
      try {
        const categories = await fetchCatalog(api, id);
        if (categories.length === 0) continue;
        const result = await ctx.runMutation(internal.armory.catalogRecord, {
          profession: name,
          professionId: id,
          categories,
        });
        if (result.success) recorded++;
        else console.error(`armory catalog sync: ${name}: record refused: ${result.error?.code}`);
      } catch (err) {
        console.error(`armory catalog sync: ${name}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`armory catalog sync: ${recorded} profession(s) recorded`);
  },
});

/** The cron's entry point: `armory-guild-roster-sync` schedules this action. */
export const rosterSweep = internalMutation({
  args: {},
  handler: (ctx) => runSystemCommand(ctx, 'armory-guild-roster-sync', {}),
});

export const rosterSync = internalAction({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const api = armoryClient();
    if (typeof api === 'string') {
      console.error(`armory roster sync: ${api}`);
      return;
    }
    const slug = process.env.BLIZZARD_GUILD_SLUG ?? 'vintage';
    const roster = await api.guildRoster(slug);
    if (!roster) {
      console.error(`armory roster sync: guild "${slug}" not found`);
      return;
    }
    const members = toRosterMembers(roster);
    if (members.length === 0) {
      // armory-guild-roster-record refuses this too; skip the fetches.
      console.error(`armory roster sync: guild "${slug}" answered no members`);
      return;
    }

    const known = await ctx.runQuery(internal.armory.rosterStatus, { guildId });
    // By Blizzard's id, so a rename isn't mistaken for a new, never-checked character.
    const checkedAt = new Map(known.map((e) => [e.blizzardId, e.checkedAt]));
    const at = Date.now();
    const last = (m: (typeof members)[number]) => checkedAt.get(m.blizzardId) ?? null;
    const due = members
      .filter((m) => {
        const t = last(m);
        return t === null || t <= at - ROSTER_STALE_MS;
      })
      .sort((a, b) => (last(a) ?? -1) - (last(b) ?? -1));
    const batch = due.slice(0, ROSTER_SYNC_BATCH);

    const enriched: { slug: string; result: RosterFetchResult }[] = [];
    // One character at a time: a batch of 60 stays far inside Blizzard's rate limit.
    for (const m of batch) {
      enriched.push({
        slug: m.slug,
        result: await fetchRosterEntry(api, api.region, m.name, m.surname),
      });
    }

    // Every call carries the full member list (reconciling it again is a no-op), so splitting
    // the enrichments by size never drops anyone from the roster.
    for (const chunk of chunkBySize(enriched, ROSTER_RECORD_BYTES - serializedBytes(members))) {
      const recorded = await ctx.runMutation(internal.armory.rosterRecord, {
        members,
        enriched: chunk,
      });
      if (!recorded.success) {
        console.error(`armory roster sync: record refused: ${recorded.error?.code}`);
        return;
      }
    }
  },
});
