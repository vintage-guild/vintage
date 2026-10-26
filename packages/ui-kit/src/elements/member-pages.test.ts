import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle } from '../test-helpers';
import type { ListedCharacter, VintageCharacterList } from './character-list';
import './character-list';
import type { VintageMemberPrefs } from './member-prefs';
import './member-prefs';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

function useClient(answer: (name: string, input: unknown, token?: string) => CommandResult) {
  const client: CommandClient = {
    read: vi.fn(async (name: string, input?: unknown) =>
      answer(name, input),
    ) as CommandClient['read'],
    run: vi.fn(async (name: string, input?: unknown, options?: { confirmToken?: string }) =>
      answer(name, input, options?.confirmToken),
    ) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return client;
}

const CHARS: ListedCharacter[] = [
  { id: 'c2', name: 'Bloodfen Ii', class: 'warrior', spec: 'fury', role: 'melee', isMain: false },
  {
    id: 'c1',
    name: 'Bloodfen Il',
    class: 'warrior',
    spec: 'protection',
    role: 'tank',
    isMain: true,
  },
];

describe('vintage-character-list', () => {
  it('lists the main first, with class, role, and spec', async () => {
    const el = await mount<VintageCharacterList>(
      '<vintage-character-list></vintage-character-list>',
    );
    el.characters = CHARS;
    await settle();
    const rows = [...el.shadowRoot!.querySelectorAll('.row')].map((r) =>
      r.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(rows[0]).toContain('Bloodfen Il Warrior · Tank · Protection Main');
    expect(rows[1]).toContain('Bloodfen Ii Warrior · Melee DPS · Fury');
    expect(rows[1]).toContain('Make main');
  });

  it('says so when there are none', async () => {
    const el = await mount<VintageCharacterList>(
      '<vintage-character-list></vintage-character-list>',
    );
    expect(el.shadowRoot!.querySelector('[part="empty"]')).not.toBeNull();
  });

  it('makes a character main with character-update', async () => {
    const client = useClient(() => ({ success: true, data: {} }));
    const el = await mount<VintageCharacterList>(
      '<vintage-character-list></vintage-character-list>',
    );
    el.characters = CHARS;
    const changed = vi.fn();
    el.addEventListener('characters-changed', changed);
    await el.makeMain('c2');
    expect(client.run).toHaveBeenCalledWith('character-update', {
      characterId: 'c2',
      isMain: true,
    });
    expect(el.statusText).toBe('Bloodfen Ii is your main');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('removes only after confirming the preview, with its token', async () => {
    const calls: (string | undefined)[] = [];
    useClient((_name, _input, token) => {
      calls.push(token);
      return token
        ? { success: true, data: { removed: true } }
        : { success: true, data: { preview: {}, confirmToken: 'tok' } };
    });
    const el = await mount<VintageCharacterList>(
      '<vintage-character-list></vintage-character-list>',
    );
    el.characters = CHARS;
    const changed = vi.fn();
    el.addEventListener('characters-changed', changed);
    await el.removeCharacter('c2');
    await settle();
    expect(calls).toEqual([undefined]);
    expect(changed).not.toHaveBeenCalled();
    expect(el.shadowRoot!.querySelector('[part="confirm"]')?.textContent).toContain('Bloodfen Ii');
    await el.confirmRemove();
    expect(calls).toEqual([undefined, 'tok']);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(el.statusText).toBe('Removed Bloodfen Ii');
  });
});

describe('vintage-member-prefs', () => {
  it('shows the main, the zone, and reminders on unless opted out', async () => {
    const el = await mount<VintageMemberPrefs>(
      '<vintage-member-prefs timezone="Europe/London"></vintage-member-prefs>',
    );
    el.characters = CHARS;
    await settle();
    const main = el.shadowRoot!.querySelector<HTMLSelectElement>('#main')!;
    expect(main.selectedOptions[0]?.textContent).toBe('Bloodfen Il · Warrior');
    expect(el.shadowRoot!.querySelector<HTMLSelectElement>('#zone')!.value).toBe('Europe/London');
    expect(el.shadowRoot!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(
      true,
    );
  });

  it('points at Characters when there is no character yet', async () => {
    const el = await mount<VintageMemberPrefs>('<vintage-member-prefs></vintage-member-prefs>');
    expect(el.shadowRoot!.querySelector('#main')).toBeNull();
    expect(el.shadowRoot!.querySelector('[part="main"] a')?.getAttribute('href')).toBe(
      '/characters',
    );
  });

  it('sets the time zone and reminders through member-prefs-set, and tells the app', async () => {
    const client = useClient(() => ({ success: true, data: {} }));
    const el = await mount<VintageMemberPrefs>('<vintage-member-prefs></vintage-member-prefs>');
    const seen: unknown[] = [];
    el.addEventListener('prefs-changed', (e) => seen.push((e as CustomEvent).detail));

    await el.setTimeZone('Europe/London');
    expect(client.run).toHaveBeenLastCalledWith('member-prefs-set', { timezone: 'Europe/London' });
    expect(el.timezone).toBe('Europe/London');

    await el.setReminders(false);
    expect(client.run).toHaveBeenLastCalledWith('member-prefs-set', { dmOptOut: true });
    expect(el.dmOptOut).toBe(true);

    await el.setTimeZone('');
    expect(client.run).toHaveBeenLastCalledWith('member-prefs-set', { timezone: '' });
    expect(seen).toEqual([{ timezone: 'Europe/London' }, { dmOptOut: true }, { timezone: '' }]);
  });

  it('refuses a zone that is not real, without asking the server', async () => {
    const client = useClient(() => ({ success: true, data: {} }));
    const el = await mount<VintageMemberPrefs>('<vintage-member-prefs></vintage-member-prefs>');
    expect(await el.setTimeZone('Mars/Olympus')).toMatchObject({
      success: false,
      error: { code: 'INVALID_PARAMETERS' },
    });
    expect(client.run).not.toHaveBeenCalled();
  });

  it('sets the main with character-update', async () => {
    const client = useClient(() => ({ success: true, data: {} }));
    const el = await mount<VintageMemberPrefs>('<vintage-member-prefs></vintage-member-prefs>');
    el.characters = CHARS;
    await el.setMain('c2');
    expect(client.run).toHaveBeenCalledWith('character-update', {
      characterId: 'c2',
      isMain: true,
    });
    expect(await el.setMain('not-mine')).toMatchObject({ success: false });
  });
});
