import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import { type ArmoryCardEntry, ago, slotLabel, type VintageArmoryCard } from './armory-card';
import './armory-card';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

function useClient(run: (name: string, input: unknown, token?: string) => CommandResult) {
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown, options?: { confirmToken?: string }) =>
      run(name, input, options?.confirmToken),
    ) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return client;
}

const NOW = Date.UTC(2026, 10, 7, 20);
const MIN = 60_000;

const FOUND: ArmoryCardEntry = {
  characterId: 'c1',
  name: 'Bloodfen',
  surname: 'Il',
  slug: 'bloodfen-il',
  status: 'found',
  profile: {
    level: 20,
    className: 'Warrior',
    raceName: 'Orc',
    guildName: 'Vintage',
    activeSpec: 'Protection',
    equippedItemLevel: 13,
  },
  equipment: [
    { slot: 'CHEST', itemId: 6545, name: 'Soldier’s Armor', quality: 'uncommon', itemLevel: 18 },
    { slot: 'MAIN_HAND', itemId: 1263, name: 'Brain Hacker', quality: 'epic', itemLevel: 45 },
  ],
  avatarUrl: 'https://render.worldofwarcraft.com/forever-us/character/177/579249-avatar.jpg',
  classMismatch: false,
  error: null,
  requestedAt: NOW - 30 * MIN,
  checkedAt: NOW - 29 * MIN,
};

async function card(
  character: { id: string; name: string; class: string },
  entry: ArmoryCardEntry | null,
) {
  const el = await mount<VintageArmoryCard>('<vintage-armory-card></vintage-armory-card>');
  el.now = NOW;
  el.character = character;
  el.entry = entry;
  await settle();
  return el;
}

const button = (el: Element, text: string) =>
  [...(el.shadowRoot?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;

describe('labels', () => {
  it('names slots and times the way a player reads them', () => {
    expect(slotLabel('MAIN_HAND')).toBe('Main hand');
    expect(slotLabel('FINGER_2')).toBe('Ring');
    expect(slotLabel('HEAD')).toBe('Head');
    expect(ago(NOW - 20_000, NOW)).toBe('just now');
    expect(ago(NOW - MIN, NOW)).toBe('1 minute ago');
    expect(ago(NOW - 5 * 60 * MIN, NOW)).toBe('5 hours ago');
    expect(ago(NOW - 3 * 1440 * MIN, NOW)).toBe('3 days ago');
  });
});

describe('vintage-armory-card', () => {
  it('shows what the armory found: portrait, level, spec, guild, item level, and gear', async () => {
    const el = await card({ id: 'c1', name: 'Bloodfen Il', class: 'warrior' }, FOUND);
    const text = shadowText(el);
    expect(text).toContain('Bloodfen Il');
    expect(text).toContain('Level 20 Orc Warrior · Protection · <Vintage>');
    expect(text).toContain('13 item level');
    expect(text).toContain('Checked 29 minutes ago.');
    expect(text).toContain('Gear (2)');
    const img = el.shadowRoot!.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(FOUND.avatarUrl);
    expect(img.getAttribute('alt')).toBe('');
    const epic = el.shadowRoot!.querySelector('.q-epic');
    expect(epic?.textContent).toBe('Brain Hacker');
    expect(text).toContain('Main hand');
    expect(button(el, 'Refresh')).toBeTruthy();
    expect(el.shadowRoot!.querySelector('form')).toBeNull();
  });

  it('flags an armory class that differs from the registered one', async () => {
    const el = await card(
      { id: 'c1', name: 'Bloodfen Il', class: 'mage' },
      { ...FOUND, classMismatch: true },
    );
    expect(shadowText(el)).toContain(
      'The armory says Warrior; this character is registered as a Mage',
    );
  });

  it('links a character registered with its last name in one press', async () => {
    const client = useClient(() => ({ success: true, data: {} }));
    const el = await card({ id: 'c1', name: 'Bloodfen Il', class: 'warrior' }, null);
    expect(shadowText(el)).toContain('Not linked. Find it on the armory');
    expect(el.shadowRoot!.querySelector('input')).toBeNull();
    const changed = vi.fn();
    el.addEventListener('armory-changed', changed);
    button(el, 'Find on the armory')!.click();
    await settle();
    expect(client.run).toHaveBeenCalledWith('armory-link', { characterId: 'c1' });
    expect(changed).toHaveBeenCalledOnce();
    expect(shadowText(el)).toContain('Linked Bloodfen Il');
  });

  it('asks for the surname when the registered name has none', async () => {
    const client = useClient(() => ({ success: true, data: {} }));
    const el = await card({ id: 'c2', name: 'Pipwick', class: 'mage' }, null);
    expect(shadowText(el)).toContain('Give its surname');
    button(el, 'Find on the armory')!.click();
    await settle();
    expect(client.run).not.toHaveBeenCalled();
    expect(shadowText(el)).toContain('Type the surname first');

    const input = el.shadowRoot!.querySelector('input')!;
    input.value = ' Thornbury ';
    input.dispatchEvent(new Event('input'));
    button(el, 'Find on the armory')!.click();
    await settle();
    expect(client.run).toHaveBeenCalledWith('armory-link', {
      characterId: 'c2',
      surname: 'Thornbury',
    });
  });

  it('says it is looking while a fetch is in flight, and what a miss means', async () => {
    const pending = await card(
      { id: 'c2', name: 'Pipwick', class: 'mage' },
      {
        ...FOUND,
        name: 'Pipwick',
        surname: 'Thornberry',
        status: 'pending',
        profile: null,
        equipment: [],
        avatarUrl: null,
        checkedAt: null,
      },
    );
    expect(shadowText(pending)).toContain('Looking up Pipwick Thornberry on the armory…');
    expect(button(pending, 'Refresh')!.disabled).toBe(true);
    cleanup();

    const missed = await card(
      { id: 'c2', name: 'Pipwick', class: 'mage' },
      {
        ...FOUND,
        name: 'Pipwick',
        surname: 'Thornberry',
        status: 'not-found',
        profile: null,
        equipment: [],
        avatarUrl: null,
      },
    );
    const text = shadowText(missed);
    expect(text).toContain('The armory has no Pipwick Thornberry');
    expect(text).toContain('level 10');
    // A surname can be typed again; the blank portrait shows the initial.
    expect(missed.shadowRoot!.querySelector('input')).toBeTruthy();
    expect(button(missed, 'Look up again')).toBeTruthy();
    expect(missed.shadowRoot!.querySelector('.avatar.blank')?.textContent?.trim()).toBe('P');
    expect(text).toContain('check the surname below');
    cleanup();

    // Registered as "First Last": no surname field; the fix is the character's name.
    const named = await card(
      { id: 'c1', name: 'Bloodfen Ill', class: 'warrior' },
      { ...FOUND, surname: 'Ill', status: 'not-found', profile: null, equipment: [] },
    );
    expect(shadowText(named)).toContain('if the name is misspelled, edit the character above');
    expect(named.shadowRoot!.querySelector('form')).toBeNull();
    expect(button(named, 'Refresh')).toBeTruthy();
  });

  it('clears “Linked” once the fetch lands, and keeps it while in flight', async () => {
    useClient(() => ({ success: true, data: {} }));
    const el = await card({ id: 'c1', name: 'Bloodfen Il', class: 'warrior' }, null);
    const status = () => el.shadowRoot!.querySelector('.status')?.textContent?.trim();
    button(el, 'Find on the armory')!.click();
    await settle();
    expect(status()).toBe('Linked Bloodfen Il');

    el.entry = { ...FOUND, status: 'pending', checkedAt: null, requestedAt: NOW };
    await settle();
    expect(status()).toBe('Linked Bloodfen Il');

    el.entry = { ...FOUND, requestedAt: NOW, checkedAt: NOW + 1 };
    await settle();
    expect(status()).toBe('');
  });

  it('says when a corrected surname waits out the cooldown, and leaves Refresh on', async () => {
    // Relinked 2 minutes after the last lookup: saved, but no fetch until the cooldown passes.
    const el = await card(
      { id: 'c2', name: 'Pipwick', class: 'mage' },
      {
        ...FOUND,
        name: 'Pipwick',
        surname: 'Thornbury',
        status: 'pending',
        profile: null,
        equipment: [],
        avatarUrl: null,
        requestedAt: NOW - 2 * MIN,
        linkedAt: NOW,
        checkedAt: null,
      },
    );
    const text = shadowText(el);
    expect(text).toContain('Saved as Pipwick Thornbury');
    expect(text).toContain('press Refresh in 8 minutes');
    expect(text).not.toContain('Looking up');
    expect(button(el, 'Refresh')!.disabled).toBe(false);
  });

  it('shows the server’s refusal when a refresh comes too soon', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'ARMORY_REFRESH_TOO_SOON',
        message: 'Bloodfen Il was looked up on the armory 6 minutes ago',
        suggestion: 'Try again in 4 minutes',
        retryable: true,
      },
    }));
    const el = await card({ id: 'c1', name: 'Bloodfen Il', class: 'warrior' }, FOUND);
    button(el, 'Refresh')!.click();
    await settle();
    expect(shadowText(el)).toContain(
      'looked up on the armory 6 minutes ago. Try again in 4 minutes.',
    );
  });

  it('unlinks after the server’s preview, and keeps the link on Keep', async () => {
    const client = useClient((_name, _input, token) =>
      token
        ? { success: true, data: { unlinked: {} } }
        : { success: true, data: { preview: {}, confirmToken: 'tok' } },
    );
    const el = await card({ id: 'c1', name: 'Bloodfen Il', class: 'warrior' }, FOUND);
    const changed = vi.fn();
    el.addEventListener('armory-changed', changed);

    button(el, 'Unlink')!.click();
    await settle();
    expect(shadowText(el)).toContain('Unlink Bloodfen Il from the armory?');
    button(el, 'Keep')!.click();
    await settle();
    expect(el.shadowRoot!.querySelector('[role="alertdialog"]')).toBeNull();
    expect(changed).not.toHaveBeenCalled();

    button(el, 'Unlink')!.click();
    await settle();
    const confirm = el.shadowRoot!.querySelector('[role="alertdialog"]')!;
    (confirm.querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(client.run).toHaveBeenLastCalledWith(
      'armory-unlink',
      { characterId: 'c1' },
      { confirmToken: 'tok' },
    );
    expect(changed).toHaveBeenCalledOnce();
    expect(shadowText(el)).toContain('Unlinked Bloodfen Il');
  });
});
