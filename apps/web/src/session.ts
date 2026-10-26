import type { GuildRank } from '@vintage/identity/contract';

/** The signed-in member. */
export interface Session {
  memberId: string;
  displayName: string;
  tier: string;
  rank: GuildRank | null;
}

let session: Session | null = null;

/**
 * The signed-in member, or null. Set by Discord sign-in once it exists (#7); in development
 * the fixtures sign in an example member.
 */
export function currentSession(): Session | null {
  return session;
}

export function setSession(next: Session | null): void {
  session = next;
}

/** Where the sign-in button points. Empty keeps it disabled. */
export const SIGN_IN_HREF = '';
