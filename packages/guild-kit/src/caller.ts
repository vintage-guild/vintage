import type { Tier } from './tiers';

/** Which surface a call came through. Every surface runs the same registry. */
export type Surface = 'web' | 'mcp' | 'discord' | 'agent' | 'cli' | 'system';

/**
 * Who is calling. Resolved by the host (Convex function, `/mcp`, Discord interaction)
 * before a command runs; commands never authenticate on their own.
 */
export interface Caller {
  surface: Surface;
  guildId: string;
  tier: Tier;
  /** Vintage member id; absent for public callers and system jobs. */
  memberId?: string;
  discordId?: string;
  /** Set when the hosted agent acts for a member (PLAN §3.10). */
  onBehalfOf?: string;
}

export function systemCaller(guildId: string): Caller {
  return { surface: 'system', guildId, tier: 'officer' };
}

export function publicCaller(guildId: string, surface: Surface = 'web'): Caller {
  return { surface, guildId, tier: 'public' };
}
