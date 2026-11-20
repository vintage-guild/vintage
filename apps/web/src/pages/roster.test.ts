import { Updates } from '@lushly-dev/fast-element';
import type { RosterListing } from '@vintage/armory/contract';
import type { CommandResult } from '@vintage/guild-kit';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSession } from '../session';

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
  activeSpec: 'Arms',
  professions: [{ name: 'Blacksmithing', level: 292, maxLevel: 300 }],
  avatarUrl: null,
  profileUrl: null,
  error: null,
  checkedAt: 0,
  memberId: null,
  characterId: null,
  preferredRole: null,
  secondaryRole: null,
  ...overrides,
});

const ROSTER: RosterListing[] = [
  entry({
    id: 'r1',
    name: 'Strattaca',
    guildRank: 0,
    className: 'Warrior',
    activeSpec: 'Arms',
    professions: [
      { name: 'Blacksmithing', level: 255, maxLevel: 300 },
      { name: 'Mining', level: 292, maxLevel: 300 },
    ],
    memberId: 'm1',
    characterId: 'c1',
    preferredRole: 'tank',
    secondaryRole: 'melee',
  }),
  entry({
    id: 'r2',
    name: 'Plate',
    surname: 'Licker',
    guildRank: 3,
    className: 'Paladin',
    activeSpec: 'Retribution',
    professions: [{ name: 'Blacksmithing', level: 235, maxLevel: 300 }],
    preferredRole: null,
    secondaryRole: null,
  }),
  entry({
    id: 'r3',
    name: 'Aeryn',
    guildRank: 4,
    className: 'Mage',
    activeSpec: 'Frost',
    professions: [{ name: 'Tailoring', level: 300, maxLevel: 300 }],
    memberId: 'm2',
    characterId: 'c2',
    preferredRole: 'ranged',
    secondaryRole: null,
  }),
  entry({
    id: 'r4',
    name: 'Shadra',
    guildRank: 5,
    className: 'Druid',
    activeSpec: 'Feral Combat',
    professions: [{ name: 'Leatherworking', level: 300, maxLevel: 300 }],
    preferredRole: 'healer',
    secondaryRole: 'melee',
  }),
];

function useClient(entries = ROSTER) {
  const read = vi.fn(async (name: string): Promise<CommandResult<unknown>> => {
    if (name === 'armory-guild-roster') return { success: true, data: entries };
    if (name === 'member-list')
      return {
        success: true,
        data: [
          { id: 'm1', displayName: 'Bloodfen' },
          { id: 'm2', displayName: 'Aeryn' },
        ],
      };
    return { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } };
  });
  const run = vi.fn(async (): Promise<CommandResult<unknown>> => ({ success: true, data: {} }));
  const restore = setCommandClient({ read, run } as unknown as CommandClient);
  return { read, run, restore };
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

describe('/roster', () => {
  it('groups the heading and link hint in a header and wraps each filter menu with a chevron', async () => {
    restore = useClient().restore;
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

  it('uses declared roles (not farming specs) in the fold-out role chart, shows flex depth, and filters', async () => {
    restore = useClient().restore;
    await import('./roster');
    document.body.innerHTML = '<vintage-roster-page></vintage-roster-page>';
    await flush();

    const root = document.querySelector('vintage-roster-page')!.shadowRoot!;
    const toggle = root.querySelector<HTMLButtonElement>('.comp-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.kpi-value')?.textContent?.trim()).toBe('2');

    // Fold open: Strattaca is Arms spec but declared Tank (+Melee flex); Plate has no declared role.
    toggle.click();
    await flush();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelectorAll('.class-chart .col-btn')).toHaveLength(9);
    expect(root.querySelectorAll('.role-chart .col-btn')).toHaveLength(4);
    expect(root.querySelector('.role-chart')?.parentElement?.textContent).toContain(
      '1 not set yet',
    );
    expect(root.querySelector('.role-chart button[aria-label^="Tank: 1"]')).not.toBeNull();
    expect(
      root.querySelector('.role-chart button[aria-label^="Melee: 0, +1 flex"]'),
    ).not.toBeNull();

    // Switch scope to include flex & recruits (adds Aeryn the ranged Mage).
    const [, poolBtn] = [...root.querySelectorAll<HTMLButtonElement>('.scope-btn')];
    poolBtn!.click();
    await flush();
    expect(root.querySelector('.kpi-value')?.textContent?.trim()).toBe('3');
    expect(root.querySelector('.role-chart button[aria-label^="Ranged: 1"]')).not.toBeNull();

    // Clicking the Tank bar filters by declared preferredRole and shows a removable chip.
    const tankBar = root.querySelector<HTMLButtonElement>(
      '.role-chart button[aria-label^="Tank:"]',
    )!;
    tankBar.click();
    await flush();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('1 of 4 characters');
    const roleChip = root.querySelector<HTMLButtonElement>('.active-filter')!;
    expect(roleChip.textContent).toContain('Role: Tank');

    roleChip.click();
    await flush();
    expect(root.querySelector('.active-filter')).toBeNull();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('4 of 4 characters');
  });

  it('lets officers edit roles on both linked and unlinked rows, and lets members edit only their own linked row', async () => {
    const client = useClient();
    restore = client.restore;
    setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'officer' } as never);
    await import('./roster');
    document.body.innerHTML = '<vintage-roster-page></vintage-roster-page>';
    await flush();

    const root = document.querySelector('vintage-roster-page')!.shadowRoot!;
    // Officer sees Edit/Set on every row (all 4 entries).
    expect(root.querySelectorAll('.role-edit-btn')).toHaveLength(4);

    // Edit unlinked character (Plate Licker) → calls armory-guild-roster-role-set.
    const plateBtn = root.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit raid role for Plate Licker"]',
    )!;
    plateBtn.click();
    await flush();

    const mainSelect = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Main raid role"]',
    )!;
    const secSelect = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Secondary raid role"]',
    )!;
    mainSelect.value = 'healer';
    mainSelect.dispatchEvent(new Event('change'));
    await flush();
    secSelect.value = 'tank';
    secSelect.dispatchEvent(new Event('change'));
    await flush();

    root.querySelector<HTMLButtonElement>('.role-save')!.click();
    await flush();
    expect(client.run).toHaveBeenCalledWith('armory-guild-roster-role-set', {
      slug: 'plate-windfury',
      preferredRole: 'healer',
      secondaryRole: 'tank',
    });

    // Edit linked character (Strattaca) → calls character-update.
    const stratBtn = root.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit raid role for Strattaca Windfury"]',
    )!;
    stratBtn.click();
    await flush();
    const stratMain = root.querySelector<HTMLSelectElement>('select[aria-label="Main raid role"]')!;
    stratMain.value = 'melee';
    stratMain.dispatchEvent(new Event('change'));
    await flush();
    root.querySelector<HTMLButtonElement>('.role-save')!.click();
    await flush();
    expect(client.run).toHaveBeenCalledWith('character-update', {
      characterId: 'c1',
      role: 'melee',
      secondaryRole: null,
    });

    // Non-officer member (m2) only sees Edit on their own linked character (Aeryn).
    document.body.replaceChildren();
    setSession({ memberId: 'm2', displayName: 'Aeryn', tier: 'raider' } as never);
    document.body.innerHTML = '<vintage-roster-page></vintage-roster-page>';
    await flush();
    const raiderRoot = document.querySelector('vintage-roster-page')!.shadowRoot!;
    const buttons = [...raiderRoot.querySelectorAll<HTMLButtonElement>('.role-edit-btn')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Edit raid role for Aeryn Windfury',
    ]);
  });

  it('keeps the Class and Profession dropdown values in sync with stat-bar toggles after manual select changes', async () => {
    restore = useClient().restore;
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
