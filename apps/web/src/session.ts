import type { GuildRank } from '@vintage/identity/contract';

/** The signed-in person. */
export interface Session {
  /**
   * Their Vintage member id; null when they signed in with Discord but aren't in the guild's
   * Discord server. Then they are `public` tier and see what visitors see.
   */
  memberId: string | null;
  displayName: string;
  tier: string;
  rank: GuildRank | null;
  /** Their Discord avatar (Discord's CDN, or its default avatar). Absent shows their initial. */
  avatarUrl?: string;
  /** IANA zone from the member's preferences (`member-prefs-set timezone`); times show in it. */
  timezone?: string;
}

let session: Session | null = null;

/**
 * The signed-in person, or null. Set by Discord sign-in (`src/connect.ts`, through
 * `@vintage/web-session`); in development the fixtures sign in a persona instead.
 */
export function currentSession(): Session | null {
  return session;
}

export function setSession(next: Session | null): void {
  session = next;
}

/** What the shell can do about signing in, once a backend is connected. */
export interface SignInHandlers {
  signIn(): void;
  signOut(): void;
  /** Re-read the session (after `member-prefs-set`, or for a rank change from role sync). */
  refresh(): Promise<void>;
}

let handlers: SignInHandlers | null = null;

/** The shell installs these when it connects to the guild server. */
export function setSignInHandlers(next: SignInHandlers | null): void {
  handlers = next;
}

/** Whether sign-in can start: false with the dev fixtures and before a backend is connected. */
export function canSignIn(): boolean {
  return handlers !== null;
}

export function signIn(): void {
  handlers?.signIn();
}

export function signOut(): void {
  handlers?.signOut();
}

export async function refreshSession(): Promise<void> {
  await handlers?.refresh();
}
