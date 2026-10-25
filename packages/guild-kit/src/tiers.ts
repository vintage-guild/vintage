/**
 * Permission tiers, lowest to highest (PLAN §3.4). Discord roles map onto these;
 * a command declares the minimum tier it needs.
 */
export const TIERS = ['public', 'member', 'trial', 'raider', 'officer'] as const;
export type Tier = (typeof TIERS)[number];

export function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier);
}

/** True when a caller at `have` may run a command requiring `need`. */
export function tierAllows(have: Tier, need: Tier): boolean {
  return tierRank(have) >= tierRank(need);
}

/** The highest of several tiers (e.g. one per Discord role). */
export function highestTier(tiers: readonly Tier[], floor: Tier = 'public'): Tier {
  return tiers.reduce<Tier>((best, t) => (tierRank(t) > tierRank(best) ? t : best), floor);
}
