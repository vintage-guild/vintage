import { CommandRegistry } from '@lushly-dev/fast-element/command.js';
import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { VintageSignupCard } from './signup-card';
import { ANSWERS, EMPTY_COUNTS } from './signup-card';
import './signup-card';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

function useClient(run: (name: string, input: unknown) => CommandResult) {
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown) => run(name, input)) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return client;
}

const buttons = (el: Element) => [
  ...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.seg button'),
];

describe('vintage-signup-card', () => {
  it('shows the raid, time, counts, and the four answers', async () => {
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" event-title="Launch night" starts-at="2026-11-05T01:00:00Z" status="tentative" character-id="c1" character-label="Bloodfen · Protection"></vintage-signup-card>',
    );
    el.counts = { ...EMPTY_COUNTS, accepted: 27, tentative: 4, tank: 4, healer: 7, dps: 16 };
    await settle();
    const text = shadowText(el);
    expect(text).toContain('Launch night');
    expect(text).toContain('27 Going');
    expect(text).toContain('4 Tanks');
    expect(
      [...el.shadowRoot!.querySelectorAll('.counts span')].map((s) => s.textContent?.trim()),
    ).toEqual(['Going', 'Tanks', 'Healers', 'DPS', 'Tentative']);
    expect(text).toContain('as Bloodfen · Protection');
    expect(el.shadowRoot!.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-11-05T01:00:00Z',
    );
    expect(buttons(el).map((b) => b.textContent?.trim())).toEqual([
      'Going',
      'Late',
      'Tentative',
      "Can't",
    ]);
    expect(buttons(el).map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
  });

  it('falls back for unknown status and missing time', async () => {
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card status="maybe"></vintage-signup-card>',
    );
    expect(el.statusKey).toBe('none');
    expect(el.startsLabel).toBe('Time to be announced');
  });

  it('keeps the answers disabled without a raid and a character', async () => {
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1"></vintage-signup-card>',
    );
    expect(el.answerCanExecute).toBe(false);
    expect(buttons(el).every((b) => b.disabled)).toBe(true);
    const result = await el.answer('accepted');
    expect(result).toMatchObject({ success: false, error: { code: 'COMMAND_DISABLED' } });
  });

  it('answers through signup-set with the character, then reflects the stored signup', async () => {
    const client = useClient(() => ({
      success: true,
      data: { id: 's1', status: 'late', queued: false },
      reasoning: 'Bloodfen: late for Launch night',
    }));
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" character-id="c1"></vintage-signup-card>',
    );
    const seen: unknown[] = [];
    el.addEventListener('signup-changed', (e) => seen.push((e as CustomEvent).detail));

    const result = await el.answer('late');
    await settle();
    expect(result.success).toBe(true);
    expect(client.run).toHaveBeenCalledWith('signup-set', {
      eventId: 'e1',
      characterId: 'c1',
      status: 'late',
    });
    expect(el.status).toBe('late');
    expect(el.statusText).toBe('Bloodfen: late for Launch night');
    expect(seen).toEqual([{ id: 's1', status: 'late', queued: false }]);
    expect(buttons(el)[1]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('reports a refusal from the server without changing the answer', async () => {
    useClient(() => ({
      success: false,
      error: { code: 'RAID_CLOSED', message: 'Launch night is locked', retryable: false },
    }));
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" character-id="c1" status="accepted"></vintage-signup-card>',
    );
    const result = await el.answer('declined');
    await settle();
    expect(result.success).toBe(false);
    expect(el.status).toBe('accepted');
    expect(el.statusKind).toBe('error');
    expect(el.statusText).toContain('Launch night is locked');
  });

  it('rejects an answer that is not one of the four', async () => {
    useClient(() => ({ success: true, data: null }));
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" character-id="c1"></vintage-signup-card>',
    );
    const result = await el.answer('bench');
    expect(result).toMatchObject({ success: false, error: { code: 'INVALID_PARAMETERS' } });
    expect(ANSWERS).not.toContain('bench');
  });

  describe('the guess, Switch character, and Change spec', () => {
    // The main comes second here; the menu still lists it first.
    const CHARS = [
      { id: 'd', name: 'Aerbark', class: 'druid', spec: 'feral-tank', role: 'tank', isMain: false },
      { id: 'w', name: 'Aeryn', class: 'warrior', spec: 'protection', role: 'tank', isMain: true },
    ] as const;
    const card = async (attrs = '') => {
      const el = await mount<VintageSignupCard>(
        `<vintage-signup-card event-id="e1" character-id="d" spec="feral" reason="your last 3 Molten Core nights" ${attrs}></vintage-signup-card>`,
      );
      el.characters = CHARS.map((c) => ({ ...c }));
      el.needed = ['healer'];
      await settle();
      return el;
    };
    const selects = (el: Element) => [...el.shadowRoot!.querySelectorAll('violet-select')];
    const options = (select: Element) =>
      [...select.querySelectorAll('violet-option')].map((o) => o.textContent?.trim());

    it('shows the guessed character, spec, role, and why', async () => {
      const el = await card();
      const text = shadowText(el);
      expect(text).toContain('as Aerbark · Feral Druid · Melee DPS');
      expect(text).toContain('Guessed from your last 3 Molten Core nights');
      const [switcher, specs] = selects(el);
      expect(switcher!.getAttribute('label')).toBe('Switch character');
      expect(options(switcher!)).toEqual([
        'Aeryn · Warrior · Tank · main',
        'Aerbark · Druid · Tank',
      ]);
      // Feral twice, as DPS and as a tank; the healer spec is marked as needed.
      expect(options(specs!)).toEqual([
        'Balance · Ranged DPS',
        'Feral · Melee DPS',
        'Feral · Tank',
        'Restoration · Healer · healers needed',
      ]);
    });

    it('answers with the spec chosen for the raid', async () => {
      const client = useClient(() => ({ success: true, data: { status: 'accepted' } }));
      const el = await card();
      await el.answer('accepted');
      expect(client.run).toHaveBeenCalledWith('signup-set', {
        eventId: 'e1',
        characterId: 'd',
        status: 'accepted',
        spec: 'feral',
      });
    });

    it('before an answer, a switch only changes what the answer will use', async () => {
      const client = useClient(() => ({ success: true, data: null }));
      const el = await card();
      await el.switchCharacter('w');
      expect(client.run).not.toHaveBeenCalled();
      expect(el.spec).toBe('');
      expect(el.reason).toBe('');
      expect(el.asLabel).toBe('Aeryn · Protection Warrior · Tank');
    });

    it('once answered, switching and respeccing store it with the same answer', async () => {
      const client = useClient(() => ({ success: true, data: { status: 'late' } }));
      const el = await card('status="late"');
      const seen: unknown[] = [];
      el.addEventListener('signup-changed', (e) => seen.push((e as CustomEvent).detail));
      await el.changeSpec('restoration');
      expect(client.run).toHaveBeenLastCalledWith('signup-set', {
        eventId: 'e1',
        characterId: 'd',
        spec: 'restoration',
        status: 'late',
      });
      await el.switchCharacter('w');
      expect(client.run).toHaveBeenLastCalledWith('signup-set', {
        eventId: 'e1',
        characterId: 'w',
        status: 'late',
      });
      expect(el.status).toBe('late');
      expect(seen).toHaveLength(2);
    });

    it('puts the previous choice back when the server refuses, and checks the choice', async () => {
      useClient(() => ({
        success: false,
        error: { code: 'RAID_CLOSED', message: 'Locked', retryable: false },
      }));
      const el = await card('status="accepted"');
      await el.switchCharacter('w');
      expect(el.characterId).toBe('d');
      expect(el.spec).toBe('feral');
      expect(el.statusKind).toBe('error');
      expect(await el.changeSpec('protection')).toMatchObject({
        success: false,
        error: { code: 'INVALID_PARAMETERS' },
      });
      expect(await el.switchCharacter('nobody')).toMatchObject({ success: false });
    });

    it('offers no Switch character with one character, and no menus without any', async () => {
      const el = await card();
      el.characters = [{ ...CHARS[0] }];
      await settle();
      expect(selects(el).map((s) => s.getAttribute('label'))).toEqual(['Change spec', 'Role']);
      el.characters = [];
      await settle();
      expect(selects(el)).toEqual([]);
    });
  });

  describe('Role for one raid (#149)', () => {
    // A Fury warrior saved as a tank (the role was picked on the Characters page).
    const CHARS = [
      { id: 'w', name: 'Brakk', class: 'warrior', spec: 'fury', role: 'tank', isMain: true },
      { id: 'p', name: 'Ash', class: 'priest', spec: 'holy', role: 'healer', isMain: false },
    ] as const;
    const card = async (attrs = '') => {
      const el = await mount<VintageSignupCard>(
        `<vintage-signup-card event-id="e1" character-id="w" ${attrs}></vintage-signup-card>`,
      );
      el.characters = CHARS.map((c) => ({ ...c }));
      el.needed = ['tank'];
      await settle();
      return el;
    };
    const roleSelect = (el: Element) =>
      [...el.shadowRoot!.querySelectorAll('violet-select')].find(
        (s) => s.getAttribute('label') === 'Role',
      );

    it('offers a guess from the spec, then each role, and shows the role played', async () => {
      const el = await card();
      expect(
        [...roleSelect(el)!.querySelectorAll('violet-option')].map((o) => o.textContent?.trim()),
      ).toEqual([
        'Guess from spec (Tank)',
        'Tank · tanks needed',
        'Healer',
        'Melee DPS',
        'Ranged DPS',
      ]);
      // With no pick, the closed select shows the guess, not Violet's "Select an option".
      expect(roleSelect(el)?.getAttribute('placeholder')).toBe('Guess from spec (Tank)');
      // The saved role goes with the saved spec; another spec plays its own role.
      expect(el.asLabel).toBe('Brakk · Fury Warrior · Tank');
      el.spec = 'arms';
      expect(el.asLabel).toBe('Brakk · Arms Warrior · Melee DPS');
      el.playRole = 'tank';
      expect(el.asLabel).toBe('Brakk · Arms Warrior · Tank');
    });

    it('answers with the picked role, and once answered stores a role or the guess again', async () => {
      const client = useClient(() => ({ success: true, data: { status: 'accepted' } }));
      const el = await card('play-role="healer"');
      await el.answer('accepted');
      expect(client.run).toHaveBeenLastCalledWith('signup-set', {
        eventId: 'e1',
        characterId: 'w',
        status: 'accepted',
        role: 'healer',
      });
      await el.changeRole('');
      expect(client.run).toHaveBeenLastCalledWith('signup-set', {
        eventId: 'e1',
        characterId: 'w',
        role: null,
        status: 'accepted',
      });
      await el.changeRole('melee');
      expect(client.run).toHaveBeenLastCalledWith('signup-set', {
        eventId: 'e1',
        characterId: 'w',
        role: 'melee',
        status: 'accepted',
      });
      expect(await el.changeRole('wizard')).toMatchObject({
        success: false,
        error: { code: 'INVALID_PARAMETERS' },
      });
    });

    it('switching character clears the picked role; a refusal puts it back', async () => {
      useClient(() => ({
        success: false,
        error: { code: 'RAID_CLOSED', message: 'Locked', retryable: false },
      }));
      const el = await card('status="accepted" play-role="healer"');
      await el.switchCharacter('p');
      expect(el.playRole).toBe('healer');
      // `restore` still holds the original client from useClient.
      setCommandClient({
        read: vi.fn(),
        run: vi.fn(async () => ({
          success: true,
          data: { status: 'accepted' },
        })) as CommandClient['run'],
      });
      await el.switchCharacter('p');
      expect(el.playRole).toBe('');
      expect(el.asLabel).toBe('Ash · Holy Priest · Healer');
    });
  });

  it('is reachable as vintage.signup-set with the status as its argument', async () => {
    const client = useClient(() => ({ success: true, data: { status: 'accepted' } }));
    await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" character-id="c1"></vintage-signup-card>',
    );
    const result = await CommandRegistry.execute('vintage.signup-set', 'accepted');
    expect(result.success).toBe(true);
    expect(client.run).toHaveBeenCalledTimes(1);
  });
});

describe('vintage-signup-card queue line', () => {
  it('says where the member is in line when the raid is full, and nothing otherwise', async () => {
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" status="accepted" queue-position="3"></vintage-signup-card>',
    );
    const line = () => el.shadowRoot?.querySelector('.queue')?.textContent?.trim();
    expect(line()).toBe(
      'The raid is full. You’re in line with 2 ahead of you; Random tells you when a spot opens.',
    );
    el.queuePosition = 1;
    await settle();
    expect(line()).toBe(
      'The raid is full. You’re next in line; Random tells you when a spot opens.',
    );
    el.removeAttribute('queue-position');
    await settle();
    expect(line()).toBeUndefined();
  });
});
