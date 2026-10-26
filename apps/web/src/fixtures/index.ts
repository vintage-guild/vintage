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
  };
  setSession(session);
  return { host, session };
}
