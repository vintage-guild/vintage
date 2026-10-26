// Development fixtures: an in-memory guild behind the real command client, and a signed-in
// member (FIXTURE_ME). Installed by main.ts in dev only; production waits on sign-in (#7) and
// the Convex client.
import { setCommandClient } from '@vintage/ui-kit';
import { type Session, setSession } from '../session';
import { FIXTURE_ME } from './data';
import { createFixtureHost, createHostClient, type FixtureHost } from './host';
import { seedFixtures } from './seed';

export interface InstalledFixtures {
  host: FixtureHost;
  session: Session;
}

/**
 * A stand-in for the Discord avatar sign-in will bring: the member's initial on a plum disc.
 * Discord's own is `https://cdn.discordapp.com/avatars/<user id>/<avatar hash>.png`.
 */
export function placeholderAvatar(displayName: string): string {
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="32" fill="#23222c"/>` +
    `<text x="32" y="41" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="30" fill="#f6f1e8">${initial}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Seed the example guild and point the command client and session at it. */
export async function installFixtures(): Promise<InstalledFixtures> {
  const host = createFixtureHost();
  await seedFixtures(host);
  const me = await host.member(FIXTURE_ME);
  if (!me) throw new Error(`fixtures: ${FIXTURE_ME} is not in the example guild`);
  setCommandClient(createHostClient(host, host.callerFor(me)));
  const session: Session = {
    memberId: me.id,
    displayName: me.displayName,
    tier: me.tier,
    rank: me.rank,
    avatarUrl: placeholderAvatar(me.displayName),
  };
  setSession(session);
  return { host, session };
}
