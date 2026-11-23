// Tonight tab live roster subscriptions against the dev fixtures (#17).
import { Updates } from '@lushly-dev/fast-element';
import { type CommandClient, setCommandClient, type TonightSignup } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureHost, createHostClient } from './fixtures/host';
import { seedFixtures } from './fixtures/seed';
import { setSession } from './session';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  setSession(null);
  document.body.replaceChildren();
  history.replaceState(null, '', '/officers');
});

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 60 && !done(); i++) {
    await Updates.next();
    await new Promise((r) => setTimeout(r, 0));
  }
  await Updates.next();
}

type OfficersPage = HTMLElement & {
  loaded: boolean;
  selectedId: string;
  signups: TonightSignup[];
  select(id: string): void;
};

describe('Officers Tonight live updates (#17)', () => {
  it('updates signups live when a member answers and stops watching on tab switch or unmount', async () => {
    const host = createFixtureHost();
    await seedFixtures(host);
    const aeryn = await host.member('Aeryn');
    const bloodfen = await host.member('Bloodfen');
    if (!aeryn || !bloodfen) throw new Error('fixtures missing seeded members');

    restore = setCommandClient(createHostClient(host, host.callerFor(aeryn)));
    setSession({
      memberId: aeryn.id,
      displayName: aeryn.displayName,
      tier: aeryn.tier,
      rank: aeryn.rank,
    });
    history.replaceState(null, '', '/officers');
    await import('./pages/officers');
    document.body.innerHTML = '<vintage-officers-page></vintage-officers-page>';
    const page = document.querySelector('vintage-officers-page') as OfficersPage;
    await until(() => page.loaded && Boolean(page.selectedId));
    const eventId = page.selectedId;

    // Bloodfen signs up from another session; Tonight updates live without any officer click.
    const bloodfenCaller = host.callerFor(bloodfen);
    const chars = await host.run<{ id: string; name: string }[]>(bloodfenCaller, 'character-list');
    const char = chars.data?.[0];
    if (!char) throw new Error('Bloodfen has no character');
    const answered = await host.run(bloodfenCaller, 'signup-set', {
      eventId,
      characterId: char.id,
      status: 'declined',
      note: 'out tonight',
    });
    expect(answered.success).toBe(true);

    await until(() =>
      page.signups.some((s) => s.characterName === char.name && s.status === 'declined'),
    );
    expect(page.signups.find((s) => s.characterName === char.name)?.status).toBe('declined');

    // Switching away from Tonight unsubscribes live detail watchers cleanly.
    page.select('calendar');
    const reanswered = await host.run(bloodfenCaller, 'signup-set', {
      eventId,
      characterId: char.id,
      status: 'tentative',
    });
    expect(reanswered.success).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(page.signups.find((s) => s.characterName === char.name)?.status).toBe('declined');

    page.remove();
  });
});
