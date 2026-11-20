import { Updates } from '@lushly-dev/fast-element';
import type { RosterListing } from '@vintage/armory/contract';
import type { CommandResult } from '@vintage/guild-kit';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSession } from '../session';
import { rosterRole } from './roster';

const entry = (
  overrides: Partial<RosterListing> & Pick<RosterListing, 'id' | 'name'>,
): RosterListing => ({
  guildId: 'vintage',
  blizzardId: 1,
  surname: 'Windfury',
  slug: `${overrides.name.toLowerCase()}-windfury`,
  level: 60,
  guildRank: 3,
  status: 'found',
  className: 'Warrior',
  raceName: 'Orc',
  activeSpec: 'Protection',
  professions: [{ name: 'Blacksmithing', level: 292, maxLevel: 300 }],
  avatarUrl: null,
  profileUrl: null,
  error: null,
  checkedAt: 0,
  memberId: null,
  ...overrides,
});

const ROSTER: RosterListing[] = [
  entry({
    id: 'r1',
    name: 'Strattaca',
    guildRank: 0,
    className: 'Warrior',
    activeSpec: 'Protection',
    professions: [
      { name: 'Blacksmithing', level: 255, maxLevel: 300 },
      { name: 'Mining', level: 292, maxLevel: 300 },
    ],
    memberId: 'm1',
  }),
  entry({
    id: 'r2',
    name: 'Plate',
    surname: 'Licker',
    guildRank: 3,
    className: 'Paladin',
    activeSpec: 'Holy',
    professions: [{ name: 'Blacksmithing', level: 235, maxLevel: 300 }],
  }),
  entry({
    id: 'r3',
    name: 'Aeryn',
    guildRank: 4,
    className: 'Mage',
    activeSpec: 'Frost',
    professions: [{ name: 'Tailoring', level: 300, maxLevel: 300 }],
  }),
  entry({
    id: 'r4',
    name: 'Shadra',
    guildRank: 5,
    className: 'Druid',
    activeSpec: 'Feral Combat',
    professions: [{ name: 'Leatherworking', level: 300, maxLevel: 300 }],
  }),
];

function useClient(entries = ROSTER) {
  const read = vi.fn(async (name: string): Promise<CommandResult<unknown>> => {
    if (name === 'armory-guild-roster') return { success: true, data: entries };
    if (name === 'member-list')
      return { success: true, data: [{ id: 'm1', displayName: 'Bloodfen' }] };
    return { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } };
  });
  return setCommandClient({ read, run: vi.fn() } as unknown as CommandClient);
}

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Updates.next();
    await new Promise((r) => setTimeout(r, 0));
  }
};

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  setSession(null);
  document.body.replaceChildren();
});

describe('rosterRole', () => {
  it('maps specs, Classic Feral Combat alias, and pure DPS classes without a spec', () => {
    expect(rosterRole({ className: 'Warrior', activeSpec: 'Protection' })).toBe('tank');
    expect(rosterRole({ className: 'Paladin', activeSpec: 'Holy' })).toBe('healer');
    expect(rosterRole({ className: 'Druid', activeSpec: 'Feral Combat' })).toBe('melee');
    expect(rosterRole({ className: 'Hunter', activeSpec: 'Beast Mastery' })).toBe('ranged');
    expect(rosterRole({ className: 'Mage', activeSpec: null })).toBe('ranged');
    expect(rosterRole({ className: 'Rogue', activeSpec: null })).toBe('melee');
    expect(rosterRole({ className: 'Priest', activeSpec: null })).toBe('unknown');
    expect(rosterRole({ className: null, activeSpec: null })).toBe('unknown');
  });
});

describe('/roster', () => {
  it('groups the heading and link hint in a header and wraps each filter menu with a chevron', async () => {
    restore = useClient();
    setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'officer' } as never);
    await import('./roster');
    document.body.innerHTML = '<vintage-roster-page></vintage-roster-page>';
    await flush();

    const root = document.querySelector('vintage-roster-page')!.shadowRoot!;
    const head = root.querySelector('header.head');
    expect(head?.querySelector('h1')?.textContent).toBe('Roster');
    expect(head?.querySelector('p.muted')?.textContent).toContain('Link your characters');

    const wraps = [...root.querySelectorAll('.controls .select-wrap')];
    expect(wraps).toHaveLength(3);
    for (const wrap of wraps) {
      expect(wrap.querySelector('select')).not.toBeNull();
      expect(wrap.querySelector('svg.select-icon[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('folds open the raid composition charts, switches scope, and filters by class and role', async () => {
    restore = useClient();
    await import('./roster');
    document.body.innerHTML = '<vintage-roster-page></vintage-roster-page>';
    await flush();

    const root = document.querySelector('vintage-roster-page')!.shadowRoot!;
    const toggle = root.querySelector<HTMLButtonElement>('.comp-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.kpi-value')?.textContent?.trim()).toBe('2');

    // Fold open the composition charts drawer.
    toggle.click();
    await flush();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelectorAll('.class-chart .col-btn')).toHaveLength(9);
    expect(root.querySelectorAll('.role-chart .col-btn')).toHaveLength(4);

    // Switch scope to include flex & recruits (adds Aeryn the flex Mage).
    const [, poolBtn] = [...root.querySelectorAll<HTMLButtonElement>('.scope-btn')];
    poolBtn!.click();
    await flush();
    expect(root.querySelector('.kpi-value')?.textContent?.trim()).toBe('3');

    // Clicking the Tank bar filters the roster tables by role and shows a removable chip.
    const tankBar = root.querySelector<HTMLButtonElement>(
      '.role-chart button[aria-label^="Tank:"]',
    )!;
    tankBar.click();
    await flush();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('1 of 4 characters');
    const roleChip = root.querySelector<HTMLButtonElement>('.active-filter')!;
    expect(roleChip.textContent).toContain('Role: Tank');

    // Clearing the role chip restores the full count.
    roleChip.click();
    await flush();
    expect(root.querySelector('.active-filter')).toBeNull();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('4 of 4 characters');

    // Clicking a class column in the chart updates the Class select too.
    const paladinCol = root.querySelector<HTMLButtonElement>(
      '.class-chart button[aria-label^="Paladin:"]',
    )!;
    paladinCol.click();
    await flush();
    const [, classSelect] = [...root.querySelectorAll<HTMLSelectElement>('.controls select')];
    expect(classSelect!.value).toBe('Paladin');
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('1 of 4 characters');
  });

  it('keeps the Class and Profession dropdown values in sync with stat-bar toggles after manual select changes', async () => {
    restore = useClient();
    await import('./roster');
    document.body.innerHTML = '<vintage-roster-page></vintage-roster-page>';
    await flush();

    const root = document.querySelector('vintage-roster-page')!.shadowRoot!;
    const [, classSelect, profSelect] = [
      ...root.querySelectorAll<HTMLSelectElement>('.controls select'),
    ];

    classSelect!.value = 'Warrior';
    classSelect!.dispatchEvent(new Event('change'));
    await flush();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('1 of 4 characters');

    const paladinBar = root.querySelector<HTMLButtonElement>(
      'button.stat[aria-label^="Paladin,"]',
    )!;
    paladinBar.click();
    await flush();
    expect(classSelect!.value).toBe('Paladin');

    paladinBar.click();
    await flush();
    expect(classSelect!.value).toBe('');
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('4 of 4 characters');

    profSelect!.value = 'Tailoring';
    profSelect!.dispatchEvent(new Event('change'));
    await flush();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('1 of 4 characters');

    const bsBar = root.querySelector<HTMLButtonElement>(
      'button.stat[aria-label^="Blacksmithing,"]',
    )!;
    bsBar.click();
    await flush();
    expect(profSelect!.value).toBe('Blacksmithing');
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('2 of 4 characters');
  });
});
