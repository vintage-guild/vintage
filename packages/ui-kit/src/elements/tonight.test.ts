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

describe('vintage-tonight, checking a raid export', () => {
  const check = (over: Record<string, unknown> = {}) => ({
    event: { id: 'e0', name: 'Molten Core', startsAt: Date.UTC(2026, 9, 29), status: 'completed' },
    otherGuild: false,
    exporter: 'Aeryn',
    addonVersion: '0.1.0',
    snapshots: [
      { at: 1, label: 'start', present: 3, online: 3 },
      { at: 2, label: 'Lucifron', present: 3, online: 2 },
    ],
    attendees: [
      { name: 'Aeryn', snapshots: 2, characterId: 'c1' },
      { name: 'Doran-Stonemaul', snapshots: 2, characterId: null },
    ],
    loot: [{ itemId: 17_011, itemName: null, looter: 'Doran-Stonemaul', count: 2, source: null }],
    unknownNames: ['Doran-Stonemaul'],
    absent: [{ characterId: 'c3', characterName: 'Cade', status: 'accepted' }],
    ...over,
  });

  async function pasted(el: VintageTonight, value: string) {
    el.toggleExport();
    await settle();
    const box = el.shadowRoot!.querySelector<HTMLTextAreaElement>('[part="export"] textarea')!;
    box.value = value;
    box.dispatchEvent(new Event('input'));
    await settle();
  }

  it('checks the pasted export against the raid it names, and shows what it found', async () => {
    const client = useClient(() => ({
      success: true,
      data: check(),
      reasoning: 'Molten Core: 2 people over 2 snapshots, 1 drop',
    }));
    const el = await tonight();
    await pasted(el, '  !VIN:1!abc  ');
    await el.checkExport();
    await settle();
    expect(client.read).toHaveBeenCalledWith('raid-export-check', { exportString: '!VIN:1!abc' });
    const found = text(el, 'export-result');
    expect(found).toContain('Export · Molten Core');
    expect(found).toContain('Molten Core: 2 people over 2 snapshots, 1 drop');
    expect(found).toContain('Snapshots start 3 · Lucifron 3 (1 offline)');
    expect(found).toContain('Seen Aeryn (2/2), Doran-Stonemaul (2/2)');
    expect(found).toContain('Not signed up Doran-Stonemaul');
    expect(found).toContain('Signed up but not seen Cade');
    expect(found).toContain('Loot item 17011 ×2 → Doran-Stonemaul');
    expect(el.statusText).toBe('Export checked. Nothing was saved.');
  });

  it('checks against the raid that just ended, not the next one, unless the leader picks', async () => {
    const client = useClient(() => ({ success: true, data: check() }));
    const el = await tonight();
    const hour = 3_600_000;
    el.recentRaids = [
      { id: 'e1', name: 'Launch night', startsAt: Date.now() + 20 * hour },
      { id: 'e0', name: 'Molten Core', startsAt: Date.now() - 4 * hour },
      { id: 'e-1', name: 'Onyxia', startsAt: Date.now() - 52 * hour },
    ];
    await pasted(el, '!VIN:1!abc');
    const picker = el.shadowRoot!.querySelector<HTMLSelectElement>('[part="export"] select')!;
    expect([...picker.options].map((o) => [o.value, o.textContent?.split(' · ')[0]])).toEqual([
      ['e0', 'Molten Core'],
      ['e-1', 'Onyxia'],
      ['e1', 'Launch night'],
      ['', 'The raid the export names'],
    ]);
    expect(picker.value).toBe('e0');
    el.shadowRoot!.querySelector<HTMLButtonElement>('[part="export"] .btn.primary')!.click();
    await settle();
    expect(client.read).toHaveBeenLastCalledWith('raid-export-check', {
      exportString: '!VIN:1!abc',
      eventId: 'e0',
    });

    picker.value = '';
    picker.dispatchEvent(new Event('change'));
    // A re-read of the page keeps the leader's choice.
    el.recentRaids = [...el.recentRaids];
    await settle();
    await el.checkExport();
    expect(client.read).toHaveBeenLastCalledWith('raid-export-check', {
      exportString: '!VIN:1!abc',
    });
    // An agent can name the raid itself, and only with an id.
    await el.checkExport('e-1');
    expect(client.read).toHaveBeenLastCalledWith('raid-export-check', {
      exportString: '!VIN:1!abc',
      eventId: 'e-1',
    });
    expect(await el.checkExport(42)).toMatchObject({
      success: false,
      error: { code: 'INVALID_PARAMETERS' },
    });
  });

  it('shows the check’s warnings, who declined but came, and who matched without a realm', async () => {
    useClient(() => ({
      success: true,
      data: check({
        attendees: [
          { name: 'Aeryn-Stonemaul', snapshots: 2, characterId: 'c1', matchedWithoutRealm: true },
          { name: 'Nimue', snapshots: 1, characterId: 'c4' },
        ],
        unknownNames: [],
        declinedButSeen: ['Nimue'],
        warnings: [
          {
            code: 'TIMES_APART',
            message: 'The export’s first snapshot is 2 days before Molten Core started.',
          },
        ],
      }),
    }));
    const el = await tonight();
    await pasted(el, '!VIN:1!abc');
    await el.checkExport();
    await settle();
    const found = text(el, 'export-result');
    expect(found).toContain('The export’s first snapshot is 2 days before Molten Core started.');
    expect(found).toContain('Declined but came Nimue');
    expect(found).toContain('Matched by name only Aeryn-Stonemaul');
    expect(found).not.toContain('Not signed up');
  });

  it('says why an export was refused', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'WRONG_KIND',
        message: 'Expected a raid-export string, got raid-import',
        suggestion: 'Paste an import string into the addon and an export string into the website',
      },
    }));
    const el = await tonight();
    await pasted(el, '!VIN:1!abc');
    const result = await el.checkExport();
    expect(result.success).toBe(false);
    expect(el.statusKind).toBe('error');
    expect(el.statusText).toContain('Expected a raid-export string');
    expect(el.exportCheck).toBeNull();
  });

  it('needs something pasted first', async () => {
    const client = useClient(() => ({ success: true, data: check() }));
    const el = await tonight();
    expect((await el.checkExport()).success).toBe(false);
    expect(client.read).not.toHaveBeenCalled();
  });
});

describe('vintage-tonight, data arriving late', () => {
  it('counts signups that arrive after the raid, as on a slow connection', async () => {
    const el = await mount<VintageTonight>('<vintage-tonight time-zone="UTC"></vintage-tonight>');
    await settle();
    el.raid = {
      id: 'e1',
      name: 'Raid night',
      startsAt: Date.UTC(2026, 9, 29),
      size: 40,
      status: 'open',
    };
    await settle();
    el.signups = [
      {
        id: 's1',
        characterName: 'Bloodfen',
        class: 'warrior',
        spec: 'protection',
        role: 'tank',
        status: 'accepted',
        queued: false,
        note: null,
        roster: 'pending',
        group: null,
      },
    ];
    await settle();
    expect(el.shadowRoot!.querySelector('.counts')?.textContent).toBe('1 / 40 going');
  });
});

describe('vintage-tonight, an open event', () => {
  it('counts without a cap and offers all eight groups', async () => {
    const el = await tonight();
    el.raid = { ...el.raid!, size: null };
    await settle();
    expect(el.countsLine).toMatch(/^\d+ going/);
    expect(el.countsLine).not.toMatch(/null|\//);
    expect(el.groupNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('vintage-tonight while loading', () => {
  it('says it is loading instead of "no raid" and "no gaps"', async () => {
    const el = await mount<VintageTonight>('<vintage-tonight loading></vintage-tonight>');
    expect(el.shadowRoot!.querySelector('h2')?.textContent).toBe('Loading tonight…');
    expect(text(el, 'gaps')).toBe('Comp Checking…');
    expect(text(el, 'waiting')).toBe('Waiting on … Checking…');
    el.loading = false;
    await settle();
    expect(el.shadowRoot!.querySelector('h2')?.textContent).toBe('No raid on the calendar');
    expect(text(el, 'gaps')).toBe('Comp No gaps.');
  });
});
