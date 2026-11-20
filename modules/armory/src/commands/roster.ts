// The guild roster: public (it's Blizzard's public armory data), synced by a cron through two
// system-only commands (the sync never calls Blizzard directly; apps/api's action does, then
// hands the results back here — same split as armory-sweep/armory-record).
import { error, success, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import { ROSTER_ROLES, ROSTER_SYNC_BATCH, type RosterEntry, type RosterListing } from '../contract';
import { MAX_ERROR } from '../domain/fetch';
import { type ArmoryCharacter, type ArmoryDeps, command } from '../store';

type RosterDeps = Pick<ArmoryDeps, 'armoryRoster'>;

const rosterRoleSchema = z.enum(ROSTER_ROLES);

export const armoryGuildRoster = command({
  name: 'armory-guild-roster',
  description:
    'Every character currently in the guild’s in-game roster (Blizzard’s own membership, not ' +
    'a member’s claim): level, class, race, guild rank, active spec, professions, portrait, ' +
    'a link to its armory page, its declared main/secondary raid roles (from the matched ' +
    'registered character, else officer-assigned on the entry), and, for recruits and up, ' +
    'the guild member and character id (`memberId`, `characterId`; always null below recruit). ' +
    'Open to everyone. Sorted by guild rank, then name. Synced from Blizzard in ' +
    'the background (armory-guild-roster-sync); a character shows "pending" until its first ' +
    'enrichment pass, and "error" when the armory fetch failed (the guild roster listing is ' +
    'kept either way).',
  tier: 'public',
  input: z.object({}),
  handler: async (_input, { guildId, deps, caller }) => {
    const byRank = (a: RosterListing, b: RosterListing) =>
      a.guildRank - b.guildRank || a.name.localeCompare(b.name);
    const [entries, links, characters] = await Promise.all([
      deps.armoryRoster.listEntries(guildId),
      deps.armory.listLinks(guildId),
      deps.armoryCharacters.listCharacters(guildId),
    ]);
    const charById = new Map(characters.map((c) => [c.id, c]));
    const charBySlug = new Map<string, ArmoryCharacter>();
    for (const link of links) {
      const char = charById.get(link.characterId);
      if (char) charBySlug.set(link.slug, char);
    }
    // A registered "First Last" is the armory's `first-last`; a link wins over a name match.
    for (const c of characters) {
      const slug = c.name.trim().toLowerCase().split(/\s+/).join('-');
      if (!charBySlug.has(slug)) charBySlug.set(slug, c);
    }
    // Which Discord member plays which character is the guild's to know, like member-list.
    const showMember = tierAllows(caller.tier, 'recruit');
    const listed: RosterListing[] = entries
      .map((e) => {
        const matched = charBySlug.get(e.slug);
        return {
          ...e,
          memberId: showMember ? (matched?.memberId ?? null) : null,
          characterId: showMember ? (matched?.id ?? null) : null,
          preferredRole: matched?.role ?? e.preferredRole ?? null,
          secondaryRole: matched ? (matched.secondaryRole ?? null) : (e.secondaryRole ?? null),
        };
      })
      .sort(byRank);
    return success(listed);
  },
});

export const armoryGuildRosterRoleSet = command({
  name: 'armory-guild-roster-role-set',
  description:
    'Set or clear an officer-assigned main and optional secondary raid role on a guild roster ' +
    'entry (used for unlinked characters; linked characters keep their role in identity). ' +
    'Clearing preferredRole also clears secondaryRole.',
  tier: 'officer',
  mutation: true,
  input: z.object({
    slug: z.string().trim().min(1).max(96),
    preferredRole: rosterRoleSchema.nullable(),
    secondaryRole: rosterRoleSchema.nullable().optional(),
  }),
  handler: async ({ slug, preferredRole, secondaryRole }, { guildId, deps }) => {
    const normalized = slug.toLowerCase();
    const entry = await deps.armoryRoster.getEntryBySlug(guildId, normalized);
    if (!entry) {
      return error('ROSTER_ENTRY_NOT_FOUND', `No roster character "${slug}"`, {
        suggestion: 'Read armory-guild-roster to find the character slug',
        retryable: false,
      });
    }
    const nextSecondary =
      preferredRole === null
        ? null
        : secondaryRole === undefined
          ? entry.secondaryRole === preferredRole
            ? null
            : (entry.secondaryRole ?? null)
          : secondaryRole === preferredRole
            ? null
            : secondaryRole;
    const updated = await deps.armoryRoster.updateEntry(guildId, entry.id, {
      preferredRole,
      secondaryRole: nextSecondary,
    });
    return success(updated, {
      reasoning: preferredRole
        ? `${entry.name} set to ${preferredRole}${nextSecondary ? ` (secondary ${nextSecondary})` : ''}`
        : `Cleared raid role for ${entry.name}`,
    });
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
 * Blizzard's members, each id and each slug once (the first wins): two answers for one
 * character, or two characters on one slug, would otherwise write the same row twice.
 */
const uniqueMembers = (members: Member[]) => {
  const ids = new Set<number>();
  const slugs = new Set<string>();
  return members.filter((m) => {
    if (ids.has(m.blizzardId) || slugs.has(m.slug)) return false;
    ids.add(m.blizzardId);
    slugs.add(m.slug);
    return true;
  });
};

/**
 * Bring the table's membership in line with Blizzard's: delete who left, insert who joined,
 * update level, rank, and renames. Rows are matched by Blizzard's character id only: a slug can
 * pass to another character (a rename frees it), so a new id on a known slug is a new character.
 * A renamed row loses its armory link (it named the old slug) and is due again at once.
 * Answers the entries by their current slug.
 */
async function syncMembers(
  deps: RosterDeps,
  guildId: string,
  existing: RosterEntry[],
  members: Member[],
) {
  const byId = new Map(existing.map((e) => [e.blizzardId, e]));
  const present = new Set(members.map((m) => m.blizzardId));
  const counts = { inserted: 0, removed: 0, renamed: 0 };
  for (const entry of existing.filter((e) => !present.has(e.blizzardId))) {
    await deps.armoryRoster.deleteEntry(guildId, entry.id);
    counts.removed++;
  }
  const current = new Map<string, RosterEntry>();
  for (const member of members) {
    const found = byId.get(member.blizzardId);
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
            ...(rename ? { profileUrl: null, checkedAt: null } : {}),
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
    'characters as pending, matches by Blizzard’s character id so a rename keeps its row and is ' +
    're-checked, drops ones no longer in the guild, ignores a repeated id or slug) and whichever members’ details were just re-fetched. A found result keeps ' +
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
    const unique = uniqueMembers(members);
    const duplicates = members.length - unique.length;
    const { current, inserted, removed, renamed } = await syncMembers(
      deps,
      guildId,
      existing,
      unique,
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
      { inserted, removed, renamed, enriched: enrichedCount, rejected, duplicates },
      {
        reasoning:
          `${inserted} new, ${removed} removed, ${renamed} renamed, ${enrichedCount} enriched` +
          (rejected ? ` (${rejected} out of bounds, recorded as errors)` : '') +
          (duplicates ? ` (${duplicates} duplicate member(s) ignored)` : ''),
      },
    );
  },
});
