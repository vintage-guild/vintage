import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { RaidRosterSignup, VintageRaidRoster } from './raid-roster';
import './raid-roster';

afterEach(() => cleanup());

const signup = (id: string, over: Partial<RaidRosterSignup> = {}): RaidRosterSignup => ({
  id,
  memberId: `m-${id}`,
  characterName: id,
  class: 'warrior',
  spec: 'protection',
  role: 'tank',
  status: 'accepted',
  note: null,
  queued: false,
  roster: 'pending',
  group: null,
  ...over,
});

const SIGNUPS = [
  signup('Stridulent', { roster: 'rostered', group: 1 }),
  signup('Aeryn', {
    role: 'healer',
    class: 'priest',
    spec: 'holy',
    status: 'late',
    note: 'by 8:30',
  }),
  signup('Garrick', { role: 'healer', class: 'paladin', spec: 'holy', status: 'tentative' }),
  signup('Brannoch', { role: 'melee', spec: 'fury', roster: 'benched' }),
  signup('Morwenna', { role: 'ranged', class: 'mage', spec: 'frost', queued: true }),
  signup('Nimue', { role: 'ranged', class: 'mage', spec: 'fire', status: 'declined' }),
];

async function roster(status = 'open'): Promise<VintageRaidRoster> {
  const el = await mount<VintageRaidRoster>(
    '<vintage-raid-roster me="m-Aeryn"></vintage-raid-roster>',
  );
  el.raid = { id: 'e1', size: 10, status };
  el.counts = { accepted: 3, late: 1, tentative: 1, bench: 0, declined: 1 };
  el.signups = SIGNUPS;
  el.comp = { selected: 4, raidSize: 10, tank: 1, healer: 1, dps: 2, gaps: ['need 1 more healer'] };
  await settle();
  return el;
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** The text of each match in the element's shadow, whitespace collapsed. */
const texts = (el: VintageRaidRoster, selector: string) =>
  [...(el.shadowRoot?.querySelectorAll(selector) ?? [])].map((r) => squash(r.textContent));

/** One part's text. */
const part = (el: VintageRaidRoster, name: string) => texts(el, `[part="${name}"]`).join(' ');

const rows = (el: VintageRaidRoster, name: string) => texts(el, `[part="${name}"] .row`);

describe('vintage-raid-roster', () => {
  it('shows the counts from raid-get and the comp from comp-suggest', async () => {
    const el = await roster();
    expect(texts(el, '[part="counts"] > div')).toEqual([
      '4/10 going',
      '1 late',
      '1 tentative',
      '1 can’t make it',
    ]);
    expect(part(el, 'comp')).toBe(
      'Comp 4 of 10 picked · 1 tank · 1 healer · 2 dps need 1 more healer',
    );
  });

  it('groups who is coming by role, with answers and notes, the queue and declines apart', async () => {
    const el = await roster();
    expect(texts(el, '[part="signups"] h3')).toEqual(['Tanks 1', 'Healers 2', 'Melee 1']);
    expect(rows(el, 'signups')).toEqual([
      'Stridulent Protection going',
      'Aeryn Holy · you late by 8:30',
      'Garrick Holy tentative',
      'Brannoch Fury going',
    ]);
    expect(rows(el, 'queue')).toEqual(['Morwenna Frost going queued · ranged dps']);
    expect(part(el, 'declined')).toBe('Can’t make it: Nimue');
  });

  it('marks the member’s own row', async () => {
    const el = await roster();
    const mine = el.shadowRoot?.querySelectorAll('.row[data-me]');
    expect(mine).toHaveLength(1);
    expect(mine?.[0]?.textContent).toContain('Aeryn');
  });

  it('shows groups and the bench only once the roster is locked', async () => {
    const el = await roster('locked');
    expect(rows(el, 'signups')).toEqual([
      'Stridulent Protection going group 1',
      'Aeryn Holy · you late by 8:30',
      'Garrick Holy tentative',
      'Brannoch Fury going benched',
    ]);
  });

  it('says why in place of what the member’s rank can’t read', async () => {
    const el = await mount<VintageRaidRoster>(
      '<vintage-raid-roster signups-note="The signup list opens to recruits." comp-note="The comp is for raiders."></vintage-raid-roster>',
    );
    el.raid = { id: 'e1', size: 10, status: 'open' };
    el.counts = { accepted: 2, late: 0, tentative: 0, bench: 0, declined: 0 };
    await settle();
    expect(part(el, 'signups-note')).toBe('The signup list opens to recruits.');
    expect(part(el, 'comp')).toBe('Comp The comp is for raiders.');
    expect(el.shadowRoot?.querySelector('[part="signups"]')).toBeNull();
    expect(shadowText(el)).not.toContain('Nobody has answered');
  });

  it('says nobody has answered only once it has read the signups', async () => {
    const el = await mount<VintageRaidRoster>(
      '<vintage-raid-roster loading></vintage-raid-roster>',
    );
    expect(shadowText(el)).toContain('Checking…');
    expect(shadowText(el)).not.toContain('Nobody has answered');
    el.loading = false;
    await settle();
    expect(shadowText(el)).toContain('Nobody has answered yet.');
  });

  it('counts an open event without a cap', async () => {
    const el = await roster();
    el.raid = { id: 'e1', size: null, status: 'open' };
    await settle();
    expect(el.countRows[0]).toEqual(['going', '4']);
  });
});
