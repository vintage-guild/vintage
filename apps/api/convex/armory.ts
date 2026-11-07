// Armory fetches outside the command's transaction: armory-link, armory-refresh, and the sweep
// schedule `refresh` with link ids (ArmoryEffects in stores.ts); it asks Blizzard's Forever
// profile API about each character and hands what it found to `armory-record`. Without
// BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET every fetch records an error saying so.
// BLIZZARD_REGION picks the region (us, eu, kr, tw; default us).
//   npx convex run armory:refresh '{"linkIds":["…"]}'
//   npx convex run armory:sweep

import { type ArmoryClient, fetchArmory } from '@vintage/armory/commands';
import type { ArmoryFetchResult } from '@vintage/armory/contract';
import { createForeverApi, parseRegion } from '@vintage/forever-api';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { GUILD_ID, runSystemCommand } from './commands';
import { armoryStore } from './stores';

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

let client: { key: string; api: ArmoryClient } | null = null;

/** One client per deployment config, so its token is reused across fetches in this isolate. */
function armoryClient(): ArmoryClient | string {
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
