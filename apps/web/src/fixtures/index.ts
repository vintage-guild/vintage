// Development fixtures: an in-memory guild behind the real command client, and a signed-in
// member chosen by the dev "view as" switch (persona.ts; Bloodfen by default). Installed by
// main.ts in dev only; production waits on sign-in (#7) and the Convex client.
import { publicCaller } from '@vintage/guild-kit';
import { setCommandClient } from '@vintage/ui-kit';
import { type Session, setSession } from '../session';
import { FIXTURE_TIMEZONE } from './data';
import { createFixtureHost, createHostClient, type FixtureHost } from './host';
import { DEFAULT_PERSONA, FIXTURE_PERSONAS, type FixturePersona } from './persona';
import { seedFixtures } from './seed';

export interface InstalledFixtures {
  host: FixtureHost;
  /** Null for the visitor persona: nobody signed in, commands run as a public caller. */
  session: Session | null;
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

/** Seed the example guild and point the command client and session at the persona. */
export async function installFixtures(
  persona: FixturePersona = DEFAULT_PERSONA,
): Promise<InstalledFixtures> {
  const host = createFixtureHost();
  await seedFixtures(host);
  const name = FIXTURE_PERSONAS[persona];
  if (!name) {
    setCommandClient(createHostClient(host, publicCaller(host.guildId)));
    setSession(null);
    return { host, session: null };
  }
  const me = await host.member(name);
  if (!me) throw new Error(`fixtures: ${name} is not in the example guild`);
  // The example member has set a time zone in their profile, so raid times show in it.
  await host.run(host.callerFor(me), 'member-prefs-set', { timezone: FIXTURE_TIMEZONE });
  const refreshed = (await host.member(name)) ?? me;
  setCommandClient(createHostClient(host, host.callerFor(refreshed)));
  const session: Session = {
    memberId: refreshed.id,
    displayName: refreshed.displayName,
    tier: refreshed.tier,
    rank: refreshed.rank,
    avatarUrl: placeholderAvatar(refreshed.displayName),
    timezone: refreshed.prefs.timezone,
  };
  setSession(session);
  return { host, session };
}
