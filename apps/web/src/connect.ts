// The site's connection to the guild server: Discord sign-in and commands over Convex, through
// @vintage/web-session (which keeps Better Auth and Convex out of page code).
import type { GuildRank } from '@vintage/identity/contract';
import { setCommandClient } from '@vintage/ui-kit';
import { connectVintage, type WebSession } from '@vintage/web-session';
import { setOAuth } from './oauth';
import { type Session, setSession, setSignInHandlers } from './session';

/**
 * The production deployment. A public client address, not a secret; `VITE_CONVEX_URL` overrides
 * it (another deployment, or a local backend).
 */
export const PROD_CONVEX_URL = 'https://dusty-sardine-902.convex.cloud';

export function toSession(s: WebSession | null): Session | null {
  if (!s) return null;
  return {
    memberId: s.memberId,
    displayName: s.displayName,
    tier: s.tier,
    // The package can't import the identity contract; the server only sends guild ranks.
    rank: (s.rank as GuildRank | null) ?? null,
    ...(s.avatarUrl ? { avatarUrl: s.avatarUrl } : {}),
    ...(s.timezone ? { timezone: s.timezone } : {}),
  };
}

/** Whether a session change means the page has to be composed again (src/view.ts). */
export function needsRemount(before: Session | null, after: Session | null): boolean {
  return (before?.memberId ?? null) !== (after?.memberId ?? null) || before?.tier !== after?.tier;
}

/**
 * Connect, wait for the first known session (including the return from Discord), and install
 * the client, the session, and the sign-in handlers. Call before the router mounts the first
 * page. Afterwards a change of who is signed in, or of their tier, reloads the page so it is
 * composed for them; a change that doesn't move the view (a new time zone) just updates the
 * session.
 */
export async function connectSite(convexUrl: string): Promise<Session | null> {
  const vintage = connectVintage({ convexUrl });
  setCommandClient(vintage.commands);
  let current = toSession(await vintage.ready);
  setSession(current);
  setSignInHandlers({
    signIn: () => void vintage.signIn(),
    signOut: () => void vintage.signOut(),
    refresh: async () => {
      await vintage.refresh();
    },
  });
  setOAuth(vintage.oauth);
  // The first call repeats `ready`'s value; the guard skips it.
  vintage.onSession((next) => {
    const session = toSession(next);
    if (needsRemount(current, session)) {
      location.reload();
      return;
    }
    current = session;
    setSession(session);
  });
  // Rank changes from role sync arrive without a sign-in; pick them up when the tab comes back.
  window.addEventListener('focus', () => void vintage.refresh());
  return current;
}
