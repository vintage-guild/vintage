import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount, settle } from '../test-helpers';
import type { RaidPostSignup, VintageRaidPost } from './raid-post';
import './raid-post';

afterEach(() => cleanup());

const signup = (name: string, over: Partial<RaidPostSignup> = {}): RaidPostSignup => ({
  memberId: `m-${name}`,
  characterName: name,
  class: 'warrior',
  spec: 'protection',
  role: 'tank',
  status: 'accepted',
  roster: 'pending',
  queued: false,
  lateMinutes: null,
  ...over,
});

const SIGNUPS: RaidPostSignup[] = [
  signup('Strattaca'),
  signup('Aeryn', {
    class: 'priest',
    spec: 'holy',
    role: 'healer',
    status: 'late',
    lateMinutes: 15,
  }),
  signup('Zed', { class: 'rogue', spec: 'combat', role: 'melee' }),
  signup('Bram', { class: 'mage', spec: 'frost', role: 'ranged' }),
  signup('Ash', { class: 'hunter', spec: 'marksmanship', role: 'ranged' }),
  signup('Pip', { class: 'mage', spec: 'fire', role: 'ranged', status: 'bench' }),
  signup('Quill', { class: 'warlock', spec: 'affliction', role: 'ranged', queued: true }),
  signup('Cade', { class: 'druid', spec: 'restoration', role: 'healer', status: 'tentative' }),
  signup('Dov', { class: 'paladin', spec: 'holy', role: 'healer', status: 'declined' }),
];

const TARGETS = { tank: 2, healer: 3, melee: 2, ranged: 3 };

async function post(signups = SIGNUPS, targets: VintageRaidPost['targets'] = TARGETS) {
  const el = await mount<VintageRaidPost>(
    '<vintage-raid-post me="m-Strattaca"></vintage-raid-post>',
  );
  el.signups = signups;
  el.targets = targets;
  await settle();
  return el;
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('vintage-raid-post', () => {
  it('counts going, late, tentative, standby, and absent in the Discord post’s order', async () => {
    const el = await post();
    const parts = [...(el.shadowRoot?.querySelectorAll('.status .s') ?? [])].map(text);
    expect(parts).toEqual(['4 going', '1 late', '1 tentative', '2 standby', '1 absent']);
  });

  it('lists who is going in Tanks / Healers / Melee / Ranged columns against the targets', async () => {
    const el = await post();
    const cols = [...(el.shadowRoot?.querySelectorAll('.col') ?? [])].map((c) => ({
      head: text(c.querySelector('h4')),
      names: [...c.querySelectorAll('.name')].map((n) => n.textContent),
    }));
    expect(cols).toEqual([
      { head: 'Tanks 1/2', names: ['Strattaca'] },
      { head: 'Healers 1/3', names: ['Aeryn'] },
      { head: 'Melee 1/2', names: ['Zed'] },
      // class first, then name: hunter before mage
      { head: 'Ranged 2/3', names: ['Ash', 'Bram'] },
    ]);
  });

  it('shows spec icons, late minutes, and marks the viewer’s own name', async () => {
    const el = await post();
    const mine = el.shadowRoot?.querySelector('.who.me');
    expect(text(mine)).toBe('Strattaca');
    expect(mine?.querySelector('img')?.getAttribute('src')).toBe(
      'https://wow.zamimg.com/images/wow/icons/small/ability_warrior_defensivestance.jpg',
    );
    const aeryn = [...(el.shadowRoot?.querySelectorAll('.who') ?? [])].find((w) =>
      w.textContent?.includes('Aeryn'),
    );
    expect(text(aeryn?.querySelector('.late'))).toBe('15m late');
    expect(aeryn?.getAttribute('title')).toBe('Holy Priest');
  });

  it('names Standby (with the queue) and Tentative, what is missing, and who is absent', async () => {
    const el = await post();
    const root = el.shadowRoot!;
    expect(text(root.querySelector('.line.bench'))).toBe('Standby Pip Quill');
    expect(text(root.querySelector('.line.tentative'))).toBe('Tentative Cade');
    expect(text(root.querySelector('.missing'))).toBe(
      'Missing 1 tank · 2 healers · 1 melee · 1 ranged',
    );
    expect(text(root.querySelector('.absent'))).toBe('Absent Dov');
  });

  it('says the comp has no gaps once every target is met', async () => {
    const el = await post(SIGNUPS, { tank: 1, healer: 1, melee: 1, ranged: 2 });
    const missing = el.shadowRoot?.querySelector('.missing');
    expect(text(missing)).toBe('Comp no gaps');
    expect(missing?.classList.contains('ok')).toBe(true);
  });

  it('counts DPS together when the raid has one DPS target', async () => {
    const el = await post(SIGNUPS, { tank: 1, healer: 1, dps: 6 });
    const heads = [...(el.shadowRoot?.querySelectorAll('.col h4') ?? [])].map(text);
    expect(heads).toEqual(['Tanks 1/1', 'Healers 1/1', 'Melee 1', 'Ranged 2']);
    expect(text(el.shadowRoot?.querySelector('.missing'))).toBe('Missing 3 DPS');
  });

  it('lists everyone going in one column for an event without role targets', async () => {
    const el = await post(SIGNUPS, null);
    const cols = el.shadowRoot?.querySelectorAll('.col') ?? [];
    expect(cols).toHaveLength(1);
    expect(text(cols[0]?.querySelector('h4'))).toBe('Going 5');
  });

  it('leaves out Standby, Tentative, and Absent when nobody is in them', async () => {
    const el = await post([signup('Strattaca')], TARGETS);
    const root = el.shadowRoot!;
    expect(root.querySelector('.line.bench')).toBeNull();
    expect(root.querySelector('.line.tentative')).toBeNull();
    expect(root.querySelector('.absent')).toBeNull();
    expect(text(root.querySelector('.col p.none'))).toBe('—');
  });
});

describe('vintage-raid-post collapsed', () => {
  it('starts closed with the status counts as its visible top line', async () => {
    const el = await post();
    const details = el.shadowRoot?.querySelector('details.post') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const summary = details.querySelector('summary');
    expect(summary?.classList.contains('status')).toBe(true);
    expect([...(summary?.querySelectorAll('.s') ?? [])].map(text)).toEqual([
      '4 going',
      '1 late',
      '1 tentative',
      '2 standby',
      '1 absent',
    ]);
    expect(text(summary?.querySelector('.more'))).toBe('Show signups');
  });

  it('opens and closes from the toggle, and says which it will do', async () => {
    const el = await post();
    const details = el.shadowRoot?.querySelector('details.post') as HTMLDetailsElement;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    await settle();
    expect(el.open).toBe(true);
    expect(text(el.shadowRoot?.querySelector('.more'))).toBe('Hide signups');
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    await settle();
    expect(el.open).toBe(false);
    expect(text(el.shadowRoot?.querySelector('.more'))).toBe('Show signups');
  });
});
