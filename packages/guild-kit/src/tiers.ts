/**
 * Permission tiers, lowest to highest (PLAN §3.4). A member's tier comes from their guild rank
 * (Discord role); a command declares the minimum tier it needs.
 *
 * - public:  not in the guild (Discord-only Friends, unranked accounts, signed-out visitors)
 * - member:  guild member who doesn't raid
 * - recruit: raider under evaluation
 * - raider:  core and flex raiders
 * - leader:  raid leaders: roster, comp, scheduling; no loot policy or site admin
 * - officer: guild vision, admin, loot policy, recruitment
 */
export const TIERS = ['public', 'member', 'recruit', 'raider', 'leader', 'officer'] as const;
export type Tier = (typeof TIERS)[number];

export function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier);
}

/** True when a caller at `have` may run a command requiring `need`. */
export function tierAllows(have: Tier, need: Tier): boolean {
  return tierRank(have) >= tierRank(need);
}

/** The highest of several tiers. */
export function highestTier(tiers: readonly Tier[], floor: Tier = 'public'): Tier {
  return tiers.reduce<Tier>((best, t) => (tierRank(t) > tierRank(best) ? t : best), floor);
}
