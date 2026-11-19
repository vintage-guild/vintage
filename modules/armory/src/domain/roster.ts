// One guild-roster character's enrichment: class, race, spec, professions, portrait, and the
// public armory link. Pure but for the injected client. Unlike `fetchArmory`, this never reads
// equipment: the roster page doesn't show gear.
import {
  armoryProfileUrl,
  type CharacterProfessions,
  type CharacterProfile,
  type ForeverApi,
  ForeverApiError,
  type ForeverRegion,
} from '@vintage/forever-api';
import type { RosterFetchResult, RosterProfession } from '../contract';
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

/** Primary and secondary professions with spent and max skill points, named ones only. */
export const toProfessions = (p: CharacterProfessions | null): RosterProfession[] => {
  const out: RosterProfession[] = [];
  for (const entry of [...(p?.primaries ?? []), ...(p?.secondaries ?? [])]) {
    const name = entry.profession?.name;
    if (!name) continue;
    out.push({ name, level: entry.skill_points ?? 0, maxLevel: entry.max_skill_points ?? null });
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
  const [media, specs, professions] = await Promise.all([
    client.characterMedia(name, surname).catch(() => null),
    client.characterSpecializations(name, surname).catch(() => null),
    client.characterProfessions(name, surname).catch(() => null),
  ]);
  return {
    status: 'found',
    className: profile.character_class?.name ?? null,
    raceName: profile.race?.name ?? null,
    activeSpec: profile.active_spec?.name ?? toActiveSpec(specs),
    professions: toProfessions(professions),
    avatarUrl: toAvatar(media),
    profileUrl: armoryProfileUrl(region, name, surname),
  };
}
