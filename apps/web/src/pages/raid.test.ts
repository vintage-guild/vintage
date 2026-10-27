// `/raids/<id>` against the dev fixtures' real commands: what each rank reads, the notes in
// place of what it can't, and the re-read after the member answers (#17).
import { Updates } from '@lushly-dev/fast-element';
import type { CommandResult } from '@vintage/guild-kit';
import type { RaidEvent } from '@vintage/raids/contract';
import {
  type CommandClient,
  setCommandClient,
  type VintageRaidRoster,
  type VintageSignupCard,
} from '@vintage/ui-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFixtureHost, createHostClient, type FixtureHost } from '../fixtures/host';
import { seedFixtures } from '../fixtures/seed';
import { setSession } from '../session';
import { COMP_NOTE, type Page, SIGNUPS_NOTE } from './raid';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  setSession(null);
  document.body.replaceChildren();
});

/** Let the reads settle and FAST render, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !done(); i++) {
    await Updates.next();
    await new Promise((r) => setTimeout(r, 0));
  }
  await Updates.next();
}

/** Seed the example guild, sign `name` in, and open the page for the fixture raid `raidName`. */
async function open(name: string, raidName: string): Promise<{ page: Page; host: FixtureHost }> {
  const host = createFixtureHost();
  await seedFixtures(host);
  const me = await host.member(name);
  if (!me) throw new Error(`fixtures: ${name} is missing`);
  const caller = host.callerFor(me);
  restore = setCommandClient(createHostClient(host, caller));
  setSession({ memberId: me.id, displayName: me.displayName, tier: me.tier, rank: me.rank });
  const raids = await host.run<{ event: RaidEvent }[]>(caller, 'raid-list', {
    from: 1,
    to: Date.parse('2027-06-01'),
  });
  const id = raids.success ? raids.data?.find((r) => r.event.name === raidName)?.event.id : '';
  if (!id) throw new Error(`fixtures: ${raidName} is missing`);
  history.replaceState(null, '', `/raids/${id}`);
  await import('./raid');
  document.body.innerHTML = '<vintage-raid-page></vintage-raid-page>';
  const page = document.querySelector('vintage-raid-page') as Page;
  await until(() => page.loaded);
  return { page, host };
}

const roster = (page: Page) =>
  page.shadowRoot?.querySelector('vintage-raid-roster') as VintageRaidRoster;
const card = (page: Page) =>
  page.shadowRoot?.querySelector('vintage-signup-card') as VintageSignupCard | null;

describe('/raids/<id>', () => {
  it('shows a raider the raid, everyone signed up with the queue apart, and the comp', async () => {
    const { page } = await open('Bloodfen', 'Barrow Deeps, first pull');
    expect(page.shadowRoot?.querySelector('h1')?.textContent).toBe('Barrow Deeps, first pull');
    expect(page.facts).toContain('Barrow Deeps · 10 players · signups open');
    const el = roster(page);
    expect(el.counts?.accepted).toBeGreaterThan(10);
    expect(el.signupsNote).toBe('');
    expect(el.compNote).toBe('');
    expect(el.comp).toMatchObject({ raidSize: 10, selected: 10 });
    // signup-list says who is queued; the element lists them apart from the roles.
    const queued = page.signups.filter((s) => s.queued).map((s) => s.characterName);
    expect(queued.length).toBeGreaterThan(0);
    expect(el.queueGroups[0]?.rows.map((s) => s.characterName)).toEqual(queued);
    expect(el.roleGroups.flatMap((g) => g.rows).some((s) => s.queued)).toBe(false);
    expect(page.mine).toBeNull();
  });

  it('reads again after the member answers, so their signup shows (queued here)', async () => {
    const { page } = await open('Bloodfen', 'Barrow Deeps, first pull');
    await until(() => Boolean(card(page)?.characterId));
    const answered = await card(page)?.answer('accepted');
    expect(answered?.success).toBe(true);
    await until(() => page.mine !== null);
    expect(page.mine).toMatchObject({ status: 'accepted', queued: true });
    expect(card(page)?.status).toBe('accepted');
    const queue = roster(page).queueGroups[0]?.rows.map((s) => s.characterName) ?? [];
    expect(queue.at(-1)).toBe('Bloodfen Il');
  });

  it('gives a recruit the signups and a note where the comp would be', async () => {
    const { page } = await open('Wendeline', 'Deadmines, two groups');
    const el = roster(page);
    expect(el.signups.map((s) => s.characterName)).toContain('Wendeline');
    expect(el.comp).toBeNull();
    expect(el.compNote).toBe(COMP_NOTE);
    expect(el.signupsNote).toBe('');
    expect(card(page)).not.toBeNull();
  });

  it('gives a member the counts and notes where the signups and the comp would be', async () => {
    const { page } = await open('Gwendolyn', 'Launch night');
    const el = roster(page);
    expect(el.counts?.accepted).toBe(26);
    expect(el.signups).toEqual([]);
    expect(el.signupsNote).toBe(SIGNUPS_NOTE);
    expect(el.compNote).toBe(COMP_NOTE);
    expect(page.needed).toEqual([]);
    expect(card(page)?.textContent).toContain('Signups open to recruits and up.');
  });

  it('says so when the raid isn’t there', async () => {
    const { page } = await open('Bloodfen', 'Launch night');
    page.eventId = 'no-such-raid';
    await page.load();
    await Updates.next();
    expect(page.missing).toBe(true);
    expect(page.error).toBe('');
    expect(page.shadowRoot?.querySelector('h1')?.textContent).toBe('Raid not found');
    expect(page.shadowRoot?.querySelector('vintage-raid-roster')).toBeNull();
  });
});

describe('/raids/<id> without fixtures', () => {
  it('shows visitors the sign-in card and asks the server nothing', async () => {
    const read = vi.fn();
    restore = setCommandClient({ read, run: vi.fn() } as unknown as CommandClient);
    history.replaceState(null, '', '/raids/r1');
    await import('./raid');
    document.body.innerHTML = '<vintage-raid-page></vintage-raid-page>';
    await until(() => false);
    const page = document.querySelector('vintage-raid-page') as Page;
    expect(page.shadowRoot?.querySelector('vintage-sign-in-card')).not.toBeNull();
    expect(page.shadowRoot?.querySelector('vintage-raid-roster')).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps the newest read when an older one finishes last', async () => {
    const answers: ((r: CommandResult) => void)[] = [];
    const event = (name: string) => ({ id: 'r1', name, size: 10, status: 'open', startsAt: 0 });
    restore = setCommandClient({
      read: ((name: string) =>
        new Promise<CommandResult>((resolve) => {
          if (name === 'raid-get') answers.push(resolve);
          else resolve({ success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } });
        })) as never,
      run: async () => ({ success: true }),
    });
    setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'member' } as never);
    history.replaceState(null, '', '/raids/r1');
    await import('./raid');
    const page = document.createElement('vintage-raid-page') as Page;
    const older = page.load();
    const newer = page.load();
    await Promise.resolve();
    const counts = { accepted: 0, late: 0, tentative: 0, bench: 0, declined: 0 };
    answers[1]?.({ success: true, data: { event: event('new'), counts, mine: null } });
    await newer;
    answers[0]?.({ success: true, data: { event: event('old'), counts, mine: null } });
    await older;
    expect(page.event?.name).toBe('new');
  });
});
