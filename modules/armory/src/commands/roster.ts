// The guild roster: public (it's Blizzard's public armory data), synced by a cron through two
// system-only commands (the sync never calls Blizzard directly; apps/api's action does, then
// hands the results back here — same split as armory-sweep/armory-record).
import { error, success, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import { ROSTER_SYNC_BATCH, type RosterEntry, type RosterListing } from '../contract';
import { MAX_ERROR } from '../domain/fetch';
import { type ArmoryDeps, command } from '../store';

type RosterDeps = Pick<ArmoryDeps, 'armoryRoster'>;

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
    const entries = await deps.armoryRoster.listEntries(guildId);
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

/** One enrichment as the sync found it; fields left out of `found` failed and are kept. */
const resultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('found'),
    className: nullableText(48),
    raceName: nullableText(48),
    activeSpec: nullableText(48).optional(),
    professions: z.array(professionSchema).max(16).optional(),
    recipes: z.array(recipeSchema).max(1500).optional(),
    avatarUrl: url(500).optional(),
    profileUrl: url(300),
  }),
  z.object({ status: z.literal('error'), error: text(MAX_ERROR) }),
]);

const OUT_OF_BOUNDS = 'Armory answer out of bounds';

/**
 * A result that doesn't fit `resultSchema` becomes that character's error instead of refusing
 * the whole input, so one bad answer can't stall every sync after it.
 */
const checkedResult = resultSchema.catch((ctx) => {
  // The manifest's JSON Schema export calls this with no context, to show it as the default.
  const issue = ctx?.issues[0];
  const where = issue?.path?.length ? issue.path.join('.') : 'result';
  return {
    status: 'error' as const,
    error: `${OUT_OF_BOUNDS} (${where}: ${issue?.message ?? 'invalid'})`.slice(0, MAX_ERROR),
  };
});

type Member = z.infer<typeof memberSchema>;
type CheckedResult = z.infer<typeof checkedResult>;

const pendingEntry = (guildId: string, m: Member): Omit<RosterEntry, 'id'> => ({
  guildId,
  blizzardId: m.blizzardId,
  name: m.name,
  surname: m.surname,
  slug: m.slug,
  level: m.level,
  guildRank: m.guildRank,
  status: 'pending',
  className: null,
  raceName: null,
  activeSpec: null,
  professions: [],
  avatarUrl: null,
  profileUrl: null,
  error: null,
  checkedAt: null,
});

/**
 * Bring the table's membership in line with Blizzard's: delete who left, insert who joined,
 * update level, rank, and renames. Answers the entries by their current slug.
 */
async function syncMembers(
  deps: RosterDeps,
  guildId: string,
  existing: RosterEntry[],
  members: Member[],
) {
  const byId = new Map(existing.map((e) => [e.blizzardId, e]));
  const bySlug = new Map(existing.map((e) => [e.slug, e]));
  // Blizzard's id first, so a renamed character keeps its row; the slug for rows without one.
  const match = (m: Member) => byId.get(m.blizzardId) ?? bySlug.get(m.slug);
  const kept = new Set(members.flatMap((m) => match(m)?.id ?? []));
  const counts = { inserted: 0, removed: 0, renamed: 0 };
  for (const entry of existing.filter((e) => !kept.has(e.id))) {
    await deps.armoryRoster.deleteEntry(guildId, entry.id);
    counts.removed++;
  }
  const current = new Map<string, RosterEntry>();
  for (const member of members) {
    const found = match(member);
    if (!found) {
      current.set(member.slug, await deps.armoryRoster.insertEntry(pendingEntry(guildId, member)));
      counts.inserted++;
      continue;
    }
    const rename = found.slug !== member.slug;
    if (rename) counts.renamed++;
    const changed = rename || found.level !== member.level || found.guildRank !== member.guildRank;
    const { name, surname, slug, level, guildRank } = member;
    current.set(
      member.slug,
      changed
        ? await deps.armoryRoster.updateEntry(guildId, found.id, {
            name,
            surname,
            slug,
            level,
            guildRank,
          })
        : found,
    );
  }
  return { current, ...counts };
}

/** Write one enrichment; a found result's left-out fields (failed requests) keep their values. */
async function recordResult(
  deps: RosterDeps,
  guildId: string,
  entryId: string,
  result: CheckedResult,
  at: number,
) {
  if (result.status === 'error') {
    await deps.armoryRoster.updateEntry(guildId, entryId, {
      status: 'error',
      error: result.error,
      checkedAt: at,
    });
    return;
  }
  const { status, recipes, ...fields } = result;
  await deps.armoryRoster.updateEntry(guildId, entryId, {
    ...fields,
    status,
    error: null,
    checkedAt: at,
  });
  if (recipes) await deps.armoryRoster.setRecipes(guildId, entryId, recipes);
}

export const armoryGuildRosterRecord = command({
  name: 'armory-guild-roster-record',
  description:
    'Record one sync’s results: the guild’s current member list from Blizzard (inserts new ' +
    'characters as pending, follows a rename by Blizzard’s character id, drops ones no longer ' +
    'in the guild) and whichever members’ details were just re-fetched. A found result keeps ' +
    'any field it leaves out (that request failed); a result that doesn’t fit is recorded as ' +
    'that character’s error instead of refusing the batch. An empty member list is refused ' +
    'while the roster has entries: Blizzard answering with no one is an outage, not the guild ' +
    'disbanding. Run by the sync action.',
  tier: 'officer',
  systemOnly: true,
  mutation: true,
  input: z.object({
    members: z.array(memberSchema).max(2000),
    enriched: z.array(z.object({ slug: text(96), result: checkedResult })).max(ROSTER_SYNC_BATCH),
  }),
  handler: async ({ members, enriched }, { guildId, deps, now }) => {
    const at = now();
    const existing = await deps.armoryRoster.listEntries(guildId);
    if (members.length === 0 && existing.length > 0) {
      return error('ARMORY_ROSTER_EMPTY', 'Blizzard answered an empty guild roster', {
        suggestion: 'Nothing was changed; the next sync tries again.',
      });
    }
    const { current, inserted, removed, renamed } = await syncMembers(
      deps,
      guildId,
      existing,
      members,
    );

    let enrichedCount = 0;
    let rejected = 0;
    for (const { slug, result } of enriched) {
      const target = current.get(slug);
      if (!target) continue; // Dropped from the guild mid-sync.
      if (result.status === 'error' && result.error.startsWith(OUT_OF_BOUNDS)) rejected++;
      await recordResult(deps, guildId, target.id, result, at);
      enrichedCount++;
    }

    return success(
      { inserted, removed, renamed, enriched: enrichedCount, rejected },
      {
        reasoning:
          `${inserted} new, ${removed} removed, ${renamed} renamed, ${enrichedCount} enriched` +
          (rejected ? ` (${rejected} out of bounds, recorded as errors)` : ''),
      },
    );
  },
});
