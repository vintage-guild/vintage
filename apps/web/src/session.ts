import type { GuildRank } from '@vintage/identity/contract';

/** The signed-in member. */
export interface Session {
  memberId: string;
  displayName: string;
  tier: string;
  rank: GuildRank | null;
  /**
   * The member's Discord avatar, once sign-in (#7) supplies it: Discord's OAuth profile carries
   * the avatar hash, and the image is `https://cdn.discordapp.com/avatars/<id>/<hash>.png`
   * (or `embed/avatars/<n>.png` for the default). Absent shows the member's initial.
   */
  avatarUrl?: string;
  /** IANA zone from the member's preferences (`member-prefs-set timezone`); times show in it. */
  timezone?: string;
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
