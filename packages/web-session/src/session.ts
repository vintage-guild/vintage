// The signed-in member as the website sees it: Better Auth's user (name, Discord avatar) plus the
// guild's view from `member-me` (member id, tier, rank, timezone).
import type { CommandResult, Tier } from '@vintage/guild-kit';

export interface WebSession {
  /** Their guild member id; null when signed in but not in the Discord server. */
  memberId: string | null;
  displayName: string;
  /** Permission tier; commands are gated by it on the server, the site only composes by it. */
  tier: Tier;
  /** Guild rank (officer, raider, …), or null without one. */
  rank: string | null;
  /** Discord avatar on Discord's CDN, or their default avatar. */
  avatarUrl?: string;
  /** IANA zone from `member-prefs-set timezone`. */
  timezone?: string;
}

/** The Better Auth user fields read here. */
export interface AuthUser {
  name: string;
  image?: string | null;
}

/** What `member-me` returns, the fields read here. */
export interface MemberMe {
  member: {
    id: string;
    displayName: string;
    tier: Tier;
    rank: string | null;
    prefs?: { timezone?: string };
  };
}

const FIELDS = ['memberId', 'displayName', 'tier', 'rank', 'avatarUrl', 'timezone'] as const;

/** Whether two sessions show the same thing, so listeners aren't told about non-changes. */
export function sameSession(a: WebSession | null, b: WebSession | null): boolean {
  if (!a || !b) return a === b;
  return FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Combine the two. When `member-me` fails (they're signed in but not a guild member, or below its
 * tier), the session is still theirs: public, named from Discord.
 */
export function toWebSession(user: AuthUser, me: CommandResult<MemberMe>): WebSession {
  const avatar = user.image ? { avatarUrl: user.image } : {};
  if (!me.success || !me.data) {
    return { memberId: null, displayName: user.name, tier: 'public', rank: null, ...avatar };
  }
  const { member } = me.data;
  return {
    memberId: member.id,
    displayName: member.displayName,
    tier: member.tier,
    rank: member.rank,
    ...avatar,
    ...(member.prefs?.timezone ? { timezone: member.prefs.timezone } : {}),
  };
}
