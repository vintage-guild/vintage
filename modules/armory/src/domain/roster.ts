// One guild-roster character's enrichment: class, race, spec, professions, portrait, and the
// public armory link. Pure but for the injected client. Unlike `fetchArmory`, this never reads
// equipment: the roster page doesn't show gear.
import {
  armoryProfileUrl,
  type CharacterProfessions,
  type CharacterProfile,
  characterSlug,
  type ForeverApi,
  ForeverApiError,
  type ForeverRegion,
  type GuildRoster,
} from '@vintage/forever-api';
import type { RosterFetchResult, RosterMember, RosterProfession, RosterRecipe } from '../contract';
import { MAX_ERROR, toActiveSpec, toAvatar } from './fetch';

export type RosterClient = Pick<
  ForeverApi,
  'characterProfile' | 'characterSpecializations' | 'characterMedia' | 'characterProfessions'
>;

const describe = (err: unknown) =>
  (err instanceof ForeverApiError
    ? err.message
    : `Roster fetch failed: ${err instanceof Error ? err.message : String(err)}`
  ).slice(0, MAX_ERROR);

/** Blizzard's guild roster as `armory-guild-roster-record` takes its members. */
export const toRosterMembers = (roster: GuildRoster): RosterMember[] =>
  roster.members.map((m) => ({
    blizzardId: m.character.id,
    name: m.character.name,
    surname: m.character.surname ?? '',
    slug: characterSlug(m.character.name, m.character.surname ?? ''),
    level: m.character.level ?? 0,
    guildRank: m.rank,
  }));

/** Every named recipe the character's professions list, each once, with its profession. */
export const toRecipes = (p: CharacterProfessions | null): RosterRecipe[] => {
  const seen = new Map<number, RosterRecipe>();
  for (const entry of [...(p?.primaries ?? []), ...(p?.secondaries ?? [])]) {
    const profession = entry.profession?.name;
    if (!profession) continue;
    for (const tier of entry.tiers) {
      for (const recipe of tier.known_recipes) {
        if (recipe.name && !seen.has(recipe.id)) {
          seen.set(recipe.id, { id: recipe.id, name: recipe.name, profession });
        }
      }
    }
  }
  return [...seen.values()];
};

/**
 * Primary and secondary professions with spent and max skill points, named ones only. Forever
 * keeps the points in the profession's one tier; a top-level value wins if Blizzard adds one.
 */
export const toProfessions = (p: CharacterProfessions | null): RosterProfession[] => {
  const out: RosterProfession[] = [];
  for (const entry of [...(p?.primaries ?? []), ...(p?.secondaries ?? [])]) {
    const name = entry.profession?.name;
    if (!name) continue;
    const tier = entry.tiers.reduce<(typeof entry.tiers)[number] | undefined>(
      (best, t) => ((t.skill_points ?? 0) > (best?.skill_points ?? -1) ? t : best),
      undefined,
    );
    out.push({
      name,
      level: entry.skill_points ?? tier?.skill_points ?? 0,
      maxLevel: entry.max_skill_points ?? tier?.max_skill_points ?? null,
    });
  }
  return out;
};

/** Ask the armory about one roster character. Never throws: a failure is an `error` result. */
export async function fetchRosterEntry(
  client: RosterClient,
  region: ForeverRegion,
  name: string,
  surname: string,
): Promise<RosterFetchResult> {
  let profile: CharacterProfile | null;
  try {
    profile = await client.characterProfile(name, surname);
  } catch (err) {
    return { status: 'error', error: describe(err) };
  }
  // In the guild roster but the profile 404s (not logged out since level 10, say): the next
  // sync tries again. Only guildRoster() dropping the slug removes the row.
  if (!profile) return { status: 'error', error: 'Not in the armory yet' };
  // A request that fails leaves its fields out, so the record keeps what it had; `null` (a 404)
  // means Blizzard has none.
  const failed = Symbol('failed');
  const settle = <T>(p: Promise<T>) => p.catch((): typeof failed => failed);
  const [media, specs, professions] = await Promise.all([
    settle(client.characterMedia(name, surname)),
    settle(client.characterSpecializations(name, surname)),
    settle(client.characterProfessions(name, surname)),
  ]);
  const spec = profile.active_spec?.name;
  return {
    status: 'found',
    className: profile.character_class?.name ?? null,
    raceName: profile.race?.name ?? null,
    ...(spec ? { activeSpec: spec } : specs === failed ? {} : { activeSpec: toActiveSpec(specs) }),
    ...(professions === failed
      ? {}
      : { professions: toProfessions(professions), recipes: toRecipes(professions) }),
    ...(media === failed ? {} : { avatarUrl: toAvatar(media) }),
    profileUrl: armoryProfileUrl(region, name, surname),
  };
}

const encoder = new TextEncoder();
/** A value's size as JSON, in UTF-8 bytes. */
export const serializedBytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

type Enriched = { slug: string; result: RosterFetchResult };

/**
 * One sync's enrichments in chunks of at most `budget` bytes, for one record call each; always
 * at least one chunk, so the membership is recorded even with nothing enriched. A result too
 * big on its own goes as that character's error instead.
 */
export function chunkBySize(enriched: Enriched[], budget: number): Enriched[][] {
  const chunks: Enriched[][] = [[]];
  let size = 0;
  for (const item of enriched) {
    let entry = item;
    let n = serializedBytes(entry);
    if (n > budget) {
      entry = {
        slug: item.slug,
        result: { status: 'error', error: `Armory answer too large to record (${n} bytes)` },
      };
      n = serializedBytes(entry);
    }
    const last = chunks[chunks.length - 1] ?? [];
    if (size + n > budget && last.length > 0) {
      chunks.push([entry]);
      size = n;
    } else {
      last.push(entry);
      size += n;
    }
  }
  return chunks;
}
