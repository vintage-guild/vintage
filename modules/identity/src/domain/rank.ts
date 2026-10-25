import type { Tier } from '@vintage/guild-kit';
import { GUILD_RANKS, type GuildRank, RANK_TIER, type RoleRankMap } from '../contract';

/**
 * A member's guild rank from their Discord roles: the highest-ranked mapped role wins.
 * Not in the Discord server, or no rank role at all, means no rank (PLAN §3.4).
 */
export function resolveRank(
  inServer: boolean,
  roleIds: readonly string[],
  map: RoleRankMap,
): GuildRank | null {
  if (!inServer) return null;
  const ranks = roleIds.flatMap((id) => (Object.hasOwn(map, id) ? [map[id] as GuildRank] : []));
  if (ranks.length === 0) return null;
  return ranks.reduce((best, r) => (GUILD_RANKS.indexOf(r) < GUILD_RANKS.indexOf(best) ? r : best));
}

/** The permission tier for a rank. No rank (unranked or not in the server) is `public`. */
export function tierForRank(rank: GuildRank | null): Tier {
  return rank ? RANK_TIER[rank] : 'public';
}
