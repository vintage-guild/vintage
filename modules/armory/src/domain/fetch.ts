// One armory fetch, pure but for the injected client: the profile decides whether the character
// is there; equipment, media, and specializations are extras, so any of them failing still
// records the profile.
import {
  type CharacterEquipment,
  type CharacterMedia,
  type CharacterProfile,
  type CharacterSpecializations,
  type ForeverApi,
  ForeverApiError,
} from '@vintage/forever-api';
import type { ArmoryFetchResult, ArmoryItem, ArmoryProfile } from '../contract';

export type ArmoryClient = Pick<
  ForeverApi,
  'characterProfile' | 'characterEquipment' | 'characterMedia' | 'characterSpecializations'
>;

/** Items a character can wear at once; more is a bad response. */
export const MAX_EQUIPPED = 19;

/** `armory-record` keeps an error to this many characters. */
export const MAX_ERROR = 300;

const describe = (err: unknown) =>
  (err instanceof ForeverApiError
    ? err.message
    : `Armory fetch failed: ${err instanceof Error ? err.message : String(err)}`
  ).slice(0, MAX_ERROR);

export function toProfile(p: CharacterProfile, surname: string): ArmoryProfile {
  return {
    blizzardId: p.id,
    name: p.name,
    surname: p.surname ?? surname,
    level: p.level,
    className: p.character_class?.name ?? null,
    raceName: p.race?.name ?? null,
    faction: p.faction?.type ?? null,
    guildName: p.guild?.name ?? null,
    guildSlug: p.guild?.slug ?? null,
    activeSpec: p.active_spec?.name ?? null,
    equippedItemLevel: p.equipped_item_level ?? null,
    averageItemLevel: p.average_item_level ?? null,
    lastLoginAt: p.last_login_timestamp ?? null,
  };
}

/**
 * The active spec from talent trees: in the active group, the tree with the most points spent.
 * Forever's profile has no `active_spec` (Nov 2026), but `/specializations` does say this.
 */
export const toActiveSpec = (s: CharacterSpecializations | null): string | null => {
  const groups = s?.specialization_groups ?? [];
  const group = groups.find((g) => g.is_active) ?? (groups.length === 1 ? groups[0] : undefined);
  let best: { name: string; points: number } | null = null;
  for (const tree of group?.specializations ?? []) {
    const name = tree.specialization?.name ?? tree.specialization_name;
    const points = tree.spent_points ?? 0;
    if (name && (!best || points > best.points)) best = { name, points };
  }
  return best?.name ?? null;
};

export const toItems = (e: CharacterEquipment | null): ArmoryItem[] =>
  (e?.equipped_items ?? []).slice(0, MAX_EQUIPPED).map((i) => ({
    slot: i.slot.type,
    itemId: i.item.id,
    name: i.name ?? null,
    quality: i.quality?.type.toLowerCase() ?? null,
    itemLevel: i.level?.value ?? null,
  }));

/** The portrait: `avatar` (the small square) first, any image otherwise. */
export const toAvatar = (m: CharacterMedia | null): string | null => {
  const assets = m?.assets ?? [];
  const url = (assets.find((a) => a.key === 'avatar') ?? assets[0])?.value ?? null;
  return url?.startsWith('https://') ? url : null;
};

/** Ask the armory about one character. Never throws: a failure is an `error` result. */
export async function fetchArmory(
  client: ArmoryClient,
  name: string,
  surname: string,
): Promise<ArmoryFetchResult> {
  let profile: CharacterProfile | null;
  try {
    profile = await client.characterProfile(name, surname);
  } catch (err) {
    return { status: 'error', error: describe(err) };
  }
  if (!profile) return { status: 'not-found' };
  const [equipment, media, specs] = await Promise.all([
    client.characterEquipment(name, surname).catch(() => null),
    client.characterMedia(name, surname).catch(() => null),
    client.characterSpecializations(name, surname).catch(() => null),
  ]);
  const mapped = toProfile(profile, surname);
  return {
    status: 'found',
    profile: { ...mapped, activeSpec: mapped.activeSpec ?? toActiveSpec(specs) },
    equipment: toItems(equipment),
    avatarUrl: toAvatar(media),
  };
}

/** "Paladin" and `paladin` are the same class: letters only, any case. */
const classKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

export const classDiffers = (registered: string, armory: string | null) =>
  armory !== null && classKey(registered) !== classKey(armory);
