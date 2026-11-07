// The characters page's Armory section over the example guild: the real armory commands, a fake
// Blizzard (fixtures/armory.ts), and the page's reads.
import type { Character } from '@vintage/identity/contract';
import { type ArmoryCardEntry, type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { inFlight } from './armory';
import { FIXTURE_NOW } from './fixtures/data';
import { createFixtureHost, createHostClient } from './fixtures/host';
import { seedFixtures } from './fixtures/seed';

await import('./pages/characters');

type Page = HTMLElement & {
  load(): Promise<void>;
  loadArmory(): Promise<void>;
  characters: Character[];
  armory: Record<string, ArmoryCardEntry>;
  armoryError: string;
  disconnectedCallback(): void;
};

let restore: CommandClient | undefined;
let open: Page | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  open?.disconnectedCallback();
  open = undefined;
});

async function pageAs(displayName: string, now?: () => number) {
  const host = createFixtureHost(undefined, { now });
  await seedFixtures(host);
  const member = await host.member(displayName);
  if (!member) throw new Error(`no ${displayName}`);
  restore = setCommandClient(createHostClient(host, host.callerFor(member)));
  open = document.createElement('vintage-characters-page') as Page;
  await open.load();
  return { host, page: open, caller: host.callerFor(member) };
}

describe('the characters page’s armory', () => {
  it('shows the seeded link as found, with the level, item level, and gear', async () => {
    const { page } = await pageAs('Bloodfen');
    const [character] = page.characters;
    expect(character?.name).toBe('Bloodfen Il');
    const entry = page.armory[character!.id];
    expect(entry).toMatchObject({
      slug: 'bloodfen-il',
      status: 'found',
      profile: { level: 42, className: 'Warrior', guildName: 'Vintage', equippedItemLevel: 37 },
    });
    expect(entry?.equipment).toHaveLength(9);
    expect(page.armoryError).toBe('');
  });

  it('links a character by surname and reads the fetch once it lands', async () => {
    const { host, page, caller } = await pageAs('Morwenna');
    const [character] = page.characters;
    expect(page.armory[character!.id]).toBeUndefined();
    const linked = await host.execute(caller, 'armory-link', {
      characterId: character!.id,
      surname: 'Ashgrove',
    });
    expect(linked.success).toBe(true);
    await page.loadArmory();
    expect(inFlight(page.armory[character!.id]!)).toBe(true);
    await host.armoryIdle();
    await page.loadArmory();
    expect(page.armory[character!.id]).toMatchObject({ status: 'found', surname: 'Ashgrove' });
    expect(inFlight(page.armory[character!.id]!)).toBe(false);
  });

  it('says a surname corrected within the cooldown is saved, not looked up yet', async () => {
    let at = FIXTURE_NOW;
    const { host, page, caller } = await pageAs('Morwenna', () => at);
    const [character] = page.characters;
    const id = character!.id;
    await host.execute(caller, 'armory-link', { characterId: id, surname: 'Unknown' });
    await host.armoryIdle();
    at += 2 * 60_000;
    const fixed = await host.execute(caller, 'armory-link', {
      characterId: id,
      surname: 'Ashgrove',
    });
    expect(fixed.success).toBe(true);
    await page.loadArmory();
    const entry = page.armory[id]!;
    expect(entry).toMatchObject({ status: 'pending', surname: 'Ashgrove' });
    expect(inFlight(entry)).toBe(false);

    const card = document.createElement('vintage-armory-card') as HTMLElement & {
      character: unknown;
      entry: unknown;
      now: number;
      note: string;
    };
    card.character = character;
    card.entry = entry;
    card.now = at;
    expect(card.note).toContain('Saved as Morwenna Ashgrove');
    expect(card.note).toContain('press Refresh in 8 minutes');
  });
});

describe('reading the armory', () => {
  it('reads once per load, not again on every change it makes', async () => {
    const host = createFixtureHost();
    await seedFixtures(host);
    const member = await host.member('Bloodfen');
    const inner = createHostClient(host, host.callerFor(member!));
    let reads = 0;
    // A page that re-read on its own change would loop; stop it loudly instead of hanging.
    restore = setCommandClient({
      ...inner,
      read: (async (name: string, input?: unknown) => {
        if (name === 'armory-list' && ++reads > 5) throw new Error('armory-list read in a loop');
        return inner.read(name, input);
      }) as CommandClient['read'],
    });
    open = document.createElement('vintage-characters-page') as Page;
    await open.load();
    await new Promise((done) => setTimeout(done, 20));
    expect(reads).toBe(1);
  });
});

describe('overlapping reads', () => {
  it('keeps the newest armory when an older read finishes last', async () => {
    const answers: ((r: unknown) => void)[] = [];
    restore = setCommandClient({
      read: (() => new Promise((resolve) => answers.push(resolve))) as never,
      run: async () => ({ success: true }),
    });
    const p = document.createElement('vintage-characters-page') as Page;
    const older = p.loadArmory();
    const newer = p.loadArmory();
    const entry = (surname: string) => ({
      characterId: 'c1',
      name: 'Bloodfen',
      surname,
      status: 'found',
      requestedAt: 1,
      checkedAt: 2,
    });
    answers[1]!({ success: true, data: [entry('Il')] });
    await newer;
    answers[0]!({ success: true, data: [entry('Old')] });
    await older;
    expect(p.armory.c1?.surname).toBe('Il');
  });
});

describe('inFlight', () => {
  it('waits on a link never checked, or asked again since its last check', () => {
    expect(inFlight({ status: 'pending', requestedAt: 1, checkedAt: null })).toBe(true);
    expect(inFlight({ status: 'found', requestedAt: 5, checkedAt: 3 })).toBe(true);
    expect(inFlight({ status: 'found', requestedAt: 3, checkedAt: 5 })).toBe(false);
    expect(inFlight({ status: 'not-found', requestedAt: 3, checkedAt: 5 })).toBe(false);
    // Saved within the cooldown: no fetch was started, so nothing to wait on.
    expect(inFlight({ status: 'pending', requestedAt: 3, checkedAt: null, linkedAt: 5 })).toBe(
      false,
    );
  });
});
