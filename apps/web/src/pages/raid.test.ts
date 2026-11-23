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
  it('shows a raider the raid, everyone signed up, and the comp', async () => {
    const { page } = await open('Bloodfen', 'Barrow Deeps, first pull');
    expect(page.shadowRoot?.querySelector('h1')?.textContent).toBe('Barrow Deeps, first pull');
    // A one-off locks two hours before the start (raid-get's locksAt), said as the home card says it.
    expect(page.locksAt).toBe((page.event?.startsAt ?? 0) - 2 * 3_600_000);
    expect(page.lockLine).toMatch(/^signups (lock \w+ |close any minute)/);
    expect(page.facts).toBe(
      `${page.facts.split(' · ')[0]} · Barrow Deeps · 10 players · ${page.lockLine}`,
    );
    expect(card(page)?.lockLabel).toBe(page.lockLine);
    const el = roster(page);
    expect(el.counts?.accepted).toBeGreaterThanOrEqual(10);
    expect(el.signupsNote).toBe('');
    expect(el.compNote).toBe('');
    expect(el.comp).toMatchObject({ raidSize: 10, selected: 10 });
    expect(page.mine).toBeNull();
  });

  it('reads again after the member answers, so their signup shows', async () => {
    const { page } = await open('Bloodfen', 'Barrow Deeps, first pull');
    await until(() => Boolean(card(page)?.characterId));
    const answered = await card(page)?.answer('accepted');
    expect(answered?.success).toBe(true);
    await until(() => page.mine !== null);
    // Bloodfen is a Flex Raider, so on a guild raid their answer lands on Standby (bench).
    expect(page.mine).toMatchObject({ status: 'bench', queued: false });
    expect(card(page)?.status).toBe('bench');
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
    expect(el.counts?.accepted).toBeGreaterThan(0);
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

  it('updates the roster, counts, and comp live when another member answers or an officer locks (#17)', async () => {
    const { page, host } = await open('Bloodfen', 'Deadmines, two groups');
    const beforeCount = roster(page).signups.length;
    const eventId = page.event?.id ?? '';

    // Another member signs up on the server without Bloodfen touching the page.
    const aeryn = await host.member('Aeryn');
    if (!aeryn) throw new Error('fixtures: Aeryn is missing');
    const aerynCaller = host.callerFor(aeryn);
    const aerynChars = await host.run<{ id: string; name: string }[]>(
      aerynCaller,
      'character-list',
    );
    const aerynChar = aerynChars.data?.[0];
    if (!aerynChar) throw new Error('fixtures: Aeryn has no character');
    const signed = await host.run(aerynCaller, 'signup-set', {
      eventId,
      characterId: aerynChar.id,
      status: 'tentative',
      note: 'might be late',
    });
    expect(signed.success).toBe(true);

    await until(() =>
      roster(page).signups.some(
        (s) => s.characterName === aerynChar.name && s.status === 'tentative',
      ),
    );
    expect(roster(page).signups.length).toBeGreaterThanOrEqual(beforeCount);
    expect(roster(page).signups.find((s) => s.characterName === aerynChar.name)?.status).toBe(
      'tentative',
    );

    // Officer locks the roster: the card's lock line and roster status update live.
    const locked = await host.run(aerynCaller, 'roster-lock', { eventId });
    expect(locked.success).toBe(true);
    await until(() => page.event?.status === 'locked');
    expect(card(page)?.lockLabel).toBe('locked · roster posted');
    expect(roster(page).raid?.status).toBe('locked');
  });

  it('unsubscribes every live watcher when the page leaves the DOM (#17)', async () => {
    const unsubscribes: ReturnType<typeof vi.fn>[] = [];
    restore = setCommandClient({
      read: vi.fn() as never,
      run: vi.fn() as never,
      watch: vi.fn((name, _input, onUpdate) => {
        const stop = vi.fn();
        unsubscribes.push(stop);
        if (name === 'raid-get') {
          onUpdate({
            success: true,
            data: {
              event: {
                id: 'r1',
                name: 'Barrow Deeps',
                instance: 'Barrow Deeps',
                kind: 'raid',
                access: 'guild',
                size: 10,
                status: 'open',
                startsAt: Date.parse('2026-12-09T01:00:00Z'),
              },
              counts: { accepted: 1, late: 0, tentative: 0, bench: 0, declined: 0 },
              mine: null,
            },
          });
        } else if (name === 'signup-list' || name === 'character-list') {
          onUpdate({ success: true, data: [] });
        } else {
          onUpdate({ success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } });
        }
        return stop;
      }) as never,
    });
    setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'raider', rank: 'raider' });
    history.replaceState(null, '', '/raids/r1');
    await import('./raid');
    document.body.innerHTML = '<vintage-raid-page></vintage-raid-page>';
    const page = document.querySelector('vintage-raid-page') as Page;
    await until(() => page.loaded);
    expect(unsubscribes.length).toBeGreaterThanOrEqual(4);
    for (const stop of unsubscribes) expect(stop).not.toHaveBeenCalled();

    page.remove();
    for (const stop of unsubscribes) expect(stop).toHaveBeenCalledOnce();
  });

  it('surfaces a live subscription error cleanly instead of hanging in loading (#17)', async () => {
    restore = setCommandClient({
      read: vi.fn() as never,
      run: vi.fn() as never,
      watch: vi.fn((name, _input, _onUpdate, onError) => {
        if (name === 'raid-get') onError?.(new Error('socket closed'));
        return () => {};
      }) as never,
    });
    setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'raider', rank: 'raider' });
    history.replaceState(null, '', '/raids/r1');
    await import('./raid');
    document.body.innerHTML = '<vintage-raid-page></vintage-raid-page>';
    const page = document.querySelector('vintage-raid-page') as Page;
    await until(() => page.loaded);
    expect(page.missing).toBe(false);
    expect(page.error).toContain('socket closed');
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

  it('lets a signed-in Friend view and answer an open raid, and hides guild raids (#322)', async () => {
    const openEvent = {
      id: 'r_open',
      name: 'Open ZG',
      instance: "Zul'Gurub",
      kind: 'raid',
      access: 'open',
      size: 20,
      status: 'open',
      startsAt: Date.parse('2026-12-05T01:00:00Z'),
    };
    const friendChar = {
      id: 'c_wren',
      name: 'Wren',
      class: 'priest',
      spec: 'holy',
      role: 'healer',
      isMain: true,
    };
    const counts = { accepted: 0, late: 0, tentative: 0, bench: 0, declined: 0 };
    restore = setCommandClient({
      read: (async (name: string) => {
        if (name === 'raid-get')
          return { success: true, data: { event: openEvent, counts, mine: null } };
        if (name === 'signup-list') return { success: true, data: [] };
        if (name === 'character-list') return { success: true, data: [friendChar] };
        if (name === 'signup-suggest') {
          return {
            success: true,
            data: {
              characterId: 'c_wren',
              characterName: 'Wren',
              spec: 'holy',
              role: 'healer',
              reason: 'your main',
            },
          };
        }
        return { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } };
      }) as never,
      run: (async () => ({ success: true, data: { id: 's1', status: 'accepted' } })) as never,
    });
    setSession({ memberId: 'm_wren', displayName: 'Wren', tier: 'friend', rank: 'friend' });
    history.replaceState(null, '', '/raids/r_open');
    await import('./raid');
    document.body.innerHTML = '<vintage-raid-page></vintage-raid-page>';
    const page = document.querySelector('vintage-raid-page') as Page;
    await until(() => page.loaded && Boolean(card(page)?.characterId));
    expect(page.allowed).toBe(true);
    expect(page.signUpAllowed).toBe(true);
    expect(page.shadowRoot?.querySelector('vintage-sign-in-card')).toBeNull();
    expect(card(page)?.characterId).toBe('c_wren');
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

  it('shows recorded attendance, standby, bosses, and loot on a completed raid (#29)', async () => {
    const completedEvent = {
      id: 'r_done',
      name: 'Barrow Deeps',
      instance: 'Barrow Deeps',
      kind: 'raid',
      access: 'guild',
      size: 10,
      status: 'completed',
      startsAt: Date.UTC(2026, 10, 5, 1),
    };
    const counts = { accepted: 2, late: 0, tentative: 0, bench: 1, declined: 0 };
    restore = setCommandClient({
      read: (async (name: string) => {
        if (name === 'raid-get')
          return { success: true, data: { event: completedEvent, counts, mine: null } };
        if (name === 'signup-list') return { success: true, data: [] };
        if (name === 'comp-suggest')
          return { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } };
        if (name === 'attendance-list') {
          return {
            success: true,
            data: {
              eventId: 'r_done',
              record: {
                id: 'rec1',
                guildId: 'g',
                eventId: 'r_done',
                exportKey: 'k1',
                exporter: 'Aeryn',
                exportedAt: Date.UTC(2026, 10, 5, 4),
                addonVersion: '0.1.0',
                snapshots: 3,
                attended: 3,
                drops: 1,
                recordedAt: Date.UTC(2026, 10, 5, 4),
                recordedBy: 'm1',
                bosses: {
                  killed: 2,
                  total: 8,
                  wipes: 3,
                  firstPullAt: Date.UTC(2026, 10, 5, 1, 0),
                  lastEndAt: Date.UTC(2026, 10, 5, 2, 24),
                },
              },
              attendance: [
                {
                  id: 'a1',
                  guildId: 'g',
                  eventId: 'r_done',
                  name: 'Aeryn',
                  class: 'warrior',
                  characterId: 'c1',
                  memberId: 'm1',
                  snapshots: 3,
                  labels: ['start', 'Chillhowl', 'end'],
                  firstSeenAt: 1,
                  lastSeenAt: 3,
                },
                {
                  id: 'a2',
                  guildId: 'g',
                  eventId: 'r_done',
                  name: 'Bram',
                  class: 'priest',
                  characterId: 'c2',
                  memberId: 'm2',
                  snapshots: 0,
                  labels: [],
                  firstSeenAt: 1,
                  lastSeenAt: 1,
                  stoodBy: true,
                },
              ],
            },
          };
        }
        if (name === 'loot-list') {
          return {
            success: true,
            data: [
              {
                id: 'd1',
                guildId: 'g',
                eventId: 'r_done',
                itemId: 17011,
                itemName: 'Arcanist Boots',
                count: 1,
                looter: 'Aeryn',
                characterId: 'c1',
                memberId: 'm1',
                at: 2,
                source: 'Chillhowl',
                lootMethodId: null,
                recordedAt: 4,
              },
            ],
          };
        }
        return { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } };
      }) as never,
      run: async () => ({ success: true }),
    });
    setSession({ memberId: 'm1', displayName: 'Aeryn', tier: 'raider', rank: 'raider' });
    history.replaceState(null, '', '/raids/r_done');
    await import('./raid');
    document.body.innerHTML = '<vintage-raid-page></vintage-raid-page>';
    const page = document.querySelector('vintage-raid-page') as Page;
    await until(() => page.loaded && page.hasReport);

    const reportText = page.shadowRoot!.querySelector('.report')!.textContent!.replace(/\s+/g, ' ');
    expect(reportText).toContain('Raid report');
    expect(reportText).toContain('Bosses: 2/8, 3 wipes, 1h 24m');
    expect(reportText).toContain('3 snapshots · from Aeryn’s export');
    expect(reportText).toContain('Attended · 1');
    expect(reportText).toContain('Aeryn (3/3)');
    expect(reportText).toContain('Stood by · 1');
    expect(reportText).toContain('Bram');
    expect(reportText).toContain('Loot · 1');
    expect(reportText).toContain('Arcanist Boots → Aeryn (Chillhowl)');
  });

  it('shows recorded loot to a member when attendance-list is unavailable', async () => {
    const completedEvent = {
      id: 'r_done',
      name: 'Barrow Deeps',
      instance: 'Barrow Deeps',
      kind: 'raid',
      access: 'guild',
      size: 10,
      status: 'completed',
      startsAt: Date.UTC(2026, 10, 5, 1),
    };
    const counts = { accepted: 2, late: 0, tentative: 0, bench: 0, declined: 0 };
    restore = setCommandClient({
      read: (async (name: string) => {
        if (name === 'raid-get')
          return { success: true, data: { event: completedEvent, counts, mine: null } };
        if (name === 'loot-list') {
          return {
            success: true,
            data: [
              {
                id: 'd1',
                guildId: 'g',
                eventId: 'r_done',
                itemId: 17011,
                itemName: 'Lava Core',
                count: 2,
                looter: 'Doran',
                characterId: null,
                memberId: null,
                at: 2,
                source: null,
                lootMethodId: null,
                recordedAt: 4,
              },
            ],
          };
        }
        return { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } };
      }) as never,
      run: async () => ({ success: true }),
    });
    setSession({ memberId: 'm9', displayName: 'Gwendolyn', tier: 'member', rank: 'member' });
    history.replaceState(null, '', '/raids/r_done');
    await import('./raid');
    document.body.innerHTML = '<vintage-raid-page></vintage-raid-page>';
    const page = document.querySelector('vintage-raid-page') as Page;
    await until(() => page.loaded && page.hasReport);

    const reportText = page.shadowRoot!.querySelector('.report')!.textContent!.replace(/\s+/g, ' ');
    expect(reportText).not.toContain('Attended');
    expect(reportText).toContain('Loot · 1');
    expect(reportText).toContain('Lava Core ×2 → Doran');
  });
});
