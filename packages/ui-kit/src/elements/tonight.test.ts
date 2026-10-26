import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle } from '../test-helpers';
import type { TonightSignup, VintageTonight } from './tonight';
import './tonight';

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

const signup = (id: string, over: Partial<TonightSignup> = {}): TonightSignup => ({
  id,
  characterName: id,
  class: 'warrior',
  spec: 'protection',
  role: 'tank',
  status: 'accepted',
  queued: false,
  note: null,
  roster: 'pending',
  group: null,
  ...over,
});

async function tonight(): Promise<VintageTonight> {
  const el = await mount<VintageTonight>('<vintage-tonight time-zone="UTC"></vintage-tonight>');
  el.raid = {
    id: 'e1',
    name: 'Launch night',
    startsAt: Date.UTC(2026, 10, 5, 1),
    size: 20,
    status: 'open',
  };
  el.signups = [
    signup('Bloodfen Il', { group: 1, roster: 'rostered' }),
    signup('Aeryn', {
      role: 'healer',
      class: 'priest',
      spec: 'holy',
      status: 'late',
      note: 'by 8:30',
    }),
    signup('Garrick', { role: 'healer', class: 'paladin', spec: 'holy', queued: true }),
    signup('Nimue', { role: 'ranged', class: 'mage', spec: 'frost', status: 'declined' }),
  ];
  el.gaps = ['need 2 more healers'];
  el.waiting = ['Brannoch', 'Elowen'];
  await settle();
  return el;
}

const text = (el: Element, part: string) =>
  el.shadowRoot!.querySelector(`[part="${part}"]`)!.textContent!.replace(/\s+/g, ' ').trim();

describe('vintage-tonight', () => {
  it('shows the raid, counts, gaps, who is waiting, and signups by role', async () => {
    const el = await tonight();
    expect(text(el, 'header')).toContain('Launch night');
    expect(el.countsLine).toBe('2 / 20 going · 1 late · 1 queued');
    expect(text(el, 'gaps')).toBe('Comp need 2 more healers');
    expect(text(el, 'waiting')).toBe('Waiting on 2 Brannoch, Elowen');
    expect(
      [...el.shadowRoot!.querySelectorAll('h3')].map((h) =>
        h.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Tanks 1', 'Healers 2']);
    const rows = [...el.shadowRoot!.querySelectorAll('.row')].map((r) =>
      r.querySelector('.place')?.textContent?.trim(),
    );
    expect(rows).toEqual(['group 1', 'unplaced', 'queued']);
    expect(text(el, 'declined')).toBe('Declined: Nimue');
    // Twenty players: four groups to choose from.
    expect(el.groupNumbers).toEqual([1, 2, 3, 4]);
  });

  it('locks through roster-lock and asks the page to re-read', async () => {
    const client = useClient(() => ({ success: true, data: {}, reasoning: 'Launch night locked' }));
    const el = await tonight();
    const changed = vi.fn();
    el.addEventListener('tonight-changed', changed);
    const result = await el.lock();
    expect(result.success).toBe(true);
    expect(client.run).toHaveBeenCalledWith('roster-lock', { eventId: 'e1' });
    expect(el.statusText).toBe('Launch night locked');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('moves a signup to a group with roster-move', async () => {
    const client = useClient(() => ({ success: true, data: {} }));
    const el = await tonight();
    await el.move('Aeryn', 2);
    expect(client.run).toHaveBeenCalledWith('roster-move', { signupId: 'Aeryn', group: 2 });
    expect(await el.move('Aeryn', 'two')).toMatchObject({
      success: false,
      error: { code: 'INVALID_PARAMETERS' },
    });
  });

  it('removes only after the officer confirms the preview, with its token', async () => {
    const calls: [string, string | undefined][] = [];
    useClient((name, _input, token) => {
      calls.push([name, token]);
      return token
        ? { success: true, data: { removed: true } }
        : {
            success: true,
            data: {
              preview: {
                willRemove: { characterName: 'Garrick', status: 'accepted', queued: true },
              },
              confirmToken: 'tok-1',
            },
            reasoning:
              'roster-remove changes data. Review the preview, then call again with confirmToken.',
          };
    });
    const el = await tonight();
    const changed = vi.fn();
    el.addEventListener('tonight-changed', changed);

    await el.removeSignup('Garrick');
    await settle();
    expect(calls).toEqual([['roster-remove', undefined]]);
    expect(changed).not.toHaveBeenCalled();
    expect(text(el, 'confirm')).toContain('Remove Garrick from Launch night?');
    expect(text(el, 'confirm')).toContain('Their going, queued signup is deleted, not benched');
    // The registry's agent-facing hint never reaches the officer.
    expect(text(el, 'confirm')).not.toContain('confirmToken');

    await el.confirmRemove();
    await settle();
    expect(calls).toEqual([
      ['roster-remove', undefined],
      ['roster-remove', 'tok-1'],
    ]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(el.shadowRoot!.querySelector('[part="confirm"]')).toBeNull();
    expect(el.statusText).toBe('Removed Garrick');
  });

  it('keeps the signup when the officer backs out', async () => {
    const client = useClient(() => ({
      success: true,
      data: { preview: {}, confirmToken: 'tok-2' },
    }));
    const el = await tonight();
    await el.removeSignup('Aeryn');
    el.cancelRemove();
    await settle();
    expect(client.run).toHaveBeenCalledTimes(1);
    expect(el.pending).toBeNull();
    expect(el.statusText).toBe('Kept Aeryn');
  });

  it('shows the addon import string, copied when the clipboard allows', async () => {
    const client = useClient(() => ({
      success: true,
      data: { importString: '!VTG1!abc', characters: 18 },
    }));
    const el = await tonight();
    await el.copyImport();
    await settle();
    expect(client.read).toHaveBeenCalledWith('addon-import-get', { eventId: 'e1' });
    expect(el.shadowRoot!.querySelector('textarea')?.value).toBe('!VTG1!abc');
    expect(text(el, 'import')).toMatch(/^Addon import · 18 characters/);
  });

  it('reports a refusal from the server', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'COMMAND_NOT_FOUND',
        message: 'No command named roster-lock is available to you',
      },
    }));
    const el = await tonight();
    const result = await el.lock();
    expect(result.success).toBe(false);
    expect(el.statusKind).toBe('error');
    expect(el.statusText).toContain('No command named roster-lock');
  });
});
