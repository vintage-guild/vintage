import { highestTier, type Tier } from '@vintage/guild-kit';
import type { RoleTierMap } from '../contract';

/**
 * A member's tier from their Discord roles: the highest mapped role wins; anyone in the
 * guild is at least `member`; someone not in the guild is `public` (PLAN §3.4).
 */
export function resolveTier(inGuild: boolean, roleIds: readonly string[], map: RoleTierMap): Tier {
  if (!inGuild) return 'public';
  const mapped = roleIds.flatMap((id) => (Object.hasOwn(map, id) ? [map[id] as Tier] : []));
  return highestTier(mapped, 'member');
}
