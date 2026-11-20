// The guild roster: public (it's Blizzard's public armory data), synced by a cron through two
// system-only commands (the sync never calls Blizzard directly; apps/api's action does, then
// hands the results back here — same split as armory-sweep/armory-record).
import { success, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import { ROSTER_SYNC_BATCH, type RosterListing } from '../contract';
import { command } from '../store';

export const armoryGuildRoster = command({
  name: 'armory-guild-roster',
  description:
    'Every character currently in the guild’s in-game roster (Blizzard’s own membership, not ' +
    'a member’s claim): level, class, race, guild rank, active spec, professions, portrait, ' +
    'a link to its armory page, and, for recruits and up, the guild member who claims it ' +
    '(`memberId`: whoever linked it to the armory, else whose registered character has its ' +
    'full name; null when none, and always null below recruit). Open to everyone. Sorted by ' +
    'guild rank, then name. Synced from Blizzard in ' +
    'the background (armory-guild-roster-sync); a character shows "pending" until its first ' +
    'enrichment pass, and "error" when the armory fetch failed (the guild roster listing is ' +
    'kept either way).',
  tier: 'public',
  input: z.object({}),
  handler: async (_input, { guildId, deps, caller }) => {
    const byRank = (a: RosterListing, b: RosterListing) =>
      a.guildRank - b.guildRank || a.name.localeCompare(b.name);
    // Recipes are hundreds per character; armory-recipe-search reads them instead.
    const entries = (await deps.armoryRoster.listEntries(guildId)).map(
      ({ recipes: _recipes, ...entry }) => entry,
    );
    // Which Discord member plays which character is the guild's to know, like member-list.
    if (!tierAllows(caller.tier, 'recruit')) {
      return success(entries.map((e) => ({ ...e, memberId: null })).sort(byRank));
    }
    const [links, characters] = await Promise.all([
      deps.armory.listLinks(guildId),
      deps.armoryCharacters.listCharacters(guildId),
    ]);
    const ownerOf = new Map(characters.map((c) => [c.id, c.memberId]));
    const memberBySlug = new Map<string, string>();
    for (const link of links) {
      const memberId = ownerOf.get(link.characterId);
      if (memberId) memberBySlug.set(link.slug, memberId);
    }
    // A registered "First Last" is the armory's `first-last`; a link wins over a name match.
    for (const c of characters) {
      const slug = c.name.trim().toLowerCase().split(/\s+/).join('-');
      if (!memberBySlug.has(slug)) memberBySlug.set(slug, c.memberId);
    }
    const listed: RosterListing[] = entries
      .map((e) => ({ ...e, memberId: memberBySlug.get(e.slug) ?? null }))
      .sort(byRank);
    return success(listed);
  },
});

export const armoryGuildRosterSync = command({
  name: 'armory-guild-roster-sync',
  description:
    'Ask Blizzard for the guild’s current in-game roster and enrich the stalest entries ' +
    `(never checked first, up to ${ROSTER_SYNC_BATCH} per run). Run by the cron every 30 ` +
    'minutes.',
  tier: 'officer',
  systemOnly: true,
  mutation: true,
  input: z.object({}),
  handler: async (_input, { guildId, deps }) => {
    await deps.armoryRosterEffects.sync(guildId);
    return success({ requested: true });
  },
});

const text = (max: number) => z.string().max(max);
const nullableText = (max: number) => text(max).nullable();
const url = (max: number) =>
  z
    .url({ protocol: /^https$/ })
    .max(max)
    .nullable();

const memberSchema = z.object({
  blizzardId: z.number().int(),
  name: text(48),
  surname: text(48),
  slug: text(96),
  level: z.number().int().min(0).max(200),
  guildRank: z.number().int().min(0),
});

const professionSchema = z.object({
  name: text(48),
  level: z.number().int().min(0),
  maxLevel: z.number().int().min(0).nullable(),
});

const recipeSchema = z.object({
  id: z.number().int(),
  name: text(120),
  profession: text(48),
});

const enrichedSchema = z.object({
  slug: text(96),
  result: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('found'),
      className: nullableText(48),
      raceName: nullableText(48),
      activeSpec: nullableText(48),
      professions: z.array(professionSchema).max(16),
      recipes: z.array(recipeSchema).max(1500).default([]),
      avatarUrl: url(500),
      profileUrl: url(300),
    }),
    z.object({ status: z.literal('error'), error: text(300) }),
  ]),
});

export const armoryGuildRosterRecord = command({
  name: 'armory-guild-roster-record',
  description:
    'Record one sync’s results: the guild’s current member list from Blizzard (inserts new ' +
    'characters as pending, drops ones no longer in the guild) and whichever members’ details ' +
    'were just re-fetched. Run by the sync action.',
  tier: 'officer',
  systemOnly: true,
  mutation: true,
  input: z.object({
    members: z.array(memberSchema).max(2000),
    enriched: z.array(enrichedSchema).max(ROSTER_SYNC_BATCH),
  }),
  handler: async ({ members, enriched }, { guildId, deps, now }) => {
    const at = now();
    const existing = await deps.armoryRoster.listEntries(guildId);
    const bySlug = new Map(existing.map((e) => [e.slug, e]));
    const current = new Set(members.map((m) => m.slug));

    let inserted = 0;
    let removed = 0;
    for (const entry of existing) {
      if (current.has(entry.slug)) continue;
      await deps.armoryRoster.deleteEntry(guildId, entry.id);
      bySlug.delete(entry.slug);
      removed++;
    }
    for (const member of members) {
      const found = bySlug.get(member.slug);
      if (!found) {
        const created = await deps.armoryRoster.insertEntry({
          guildId,
          blizzardId: member.blizzardId,
          name: member.name,
          surname: member.surname,
          slug: member.slug,
          level: member.level,
          guildRank: member.guildRank,
          status: 'pending',
          className: null,
          raceName: null,
          activeSpec: null,
          professions: [],
          recipes: [],
          avatarUrl: null,
          profileUrl: null,
          error: null,
          checkedAt: null,
        });
        bySlug.set(member.slug, created);
        inserted++;
      } else if (found.level !== member.level || found.guildRank !== member.guildRank) {
        bySlug.set(
          member.slug,
          await deps.armoryRoster.updateEntry(guildId, found.id, {
            level: member.level,
            guildRank: member.guildRank,
          }),
        );
      }
    }

    let enrichedCount = 0;
    for (const { slug, result } of enriched) {
      const target = bySlug.get(slug);
      if (!target) continue; // Dropped from the guild mid-sync.
      const patch =
        result.status === 'found'
          ? {
              status: 'found' as const,
              className: result.className,
              raceName: result.raceName,
              activeSpec: result.activeSpec,
              professions: result.professions,
              recipes: result.recipes,
              avatarUrl: result.avatarUrl,
              profileUrl: result.profileUrl,
              error: null,
              checkedAt: at,
            }
          : { status: 'error' as const, error: result.error, checkedAt: at };
      bySlug.set(slug, await deps.armoryRoster.updateEntry(guildId, target.id, patch));
      enrichedCount++;
    }

    return success(
      { inserted, removed, enriched: enrichedCount },
      { reasoning: `${inserted} new, ${removed} removed, ${enrichedCount} enriched` },
    );
  },
});
