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
  alsoRoles: [],
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
    alsoRoles: ['melee'],
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
    alsoRoles: [],
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
    alsoRoles: [],
  }),
  entry({
    id: 'r4',
    name: 'Shadra',
    guildRank: 5,
    className: 'Druid',
    activeSpec: 'Feral Combat',
    professions: [{ name: 'Leatherworking', level: 300, maxLevel: 300 }],
    preferredRole: 'healer',
    alsoRoles: ['melee'],
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

/** The Role menu among the roster's filters. */
const roleFilter = (root: ShadowRoot) =>
  [...root.querySelectorAll('.controls label')]
    .find((l) => l.querySelector('span')?.textContent === 'Role')!
    .querySelector('select')!;

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

    // Clicking the Tank bar filters by declared preferredRole and sets the Role filter.
    const tankBar = root.querySelector<HTMLButtonElement>(
      '.role-chart button[aria-label^="Tank:"]',
    )!;
    tankBar.click();
    await flush();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('1 of 4 characters');
    const roleSelect = roleFilter(root);
    expect(roleSelect.value).toBe('tank');

    roleSelect.value = '';
    roleSelect.dispatchEvent(new Event('change'));
    await flush();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('4 of 4 characters');
    expect(tankBar.getAttribute('aria-pressed')).toBe('false');
  });

  it('filters by main raid role from the Role menu, with no class or profession cards', async () => {
    restore = useClient().restore;
    await import('./roster');
    document.body.innerHTML = '<vintage-roster-page></vintage-roster-page>';
    await flush();

    const root = document.querySelector('vintage-roster-page')!.shadowRoot!;
    expect(root.textContent).not.toContain('Raid roster by class');
    expect(root.textContent).not.toContain('Primary professions');
    expect(root.textContent).not.toContain('Profession 225+');

    const roleSelect = roleFilter(root);
    expect([...roleSelect.options].map((o) => o.textContent)).toEqual([
      'All roles',
      'Tank',
      'Healer',
      'Melee',
      'Ranged',
    ]);
    // Aeryn's main role is Ranged; Strattaca only flexes into Melee, so isn't listed under it.
    roleSelect.value = 'ranged';
    roleSelect.dispatchEvent(new Event('change'));
    await flush();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('1 of 4 characters');
    roleSelect.value = 'melee';
    roleSelect.dispatchEvent(new Event('change'));
    await flush();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('0 of 4 characters');
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
    mainSelect.value = 'healer';
    mainSelect.dispatchEvent(new Event('change'));
    await flush();
    // A paladin healer can also tank or melee; ranged and healer aren't offered.
    const alsoBoxes = [...root.querySelectorAll<HTMLInputElement>('.also-option input')];
    expect(alsoBoxes.map((b) => b.parentElement!.textContent!.trim())).toEqual(['Tank', 'Melee']);
    alsoBoxes[0]!.click();
    await flush();

    root.querySelector<HTMLButtonElement>('.role-save')!.click();
    await flush();
    expect(client.run).toHaveBeenCalledWith('armory-guild-roster-role-set', {
      slug: 'plate-windfury',
      preferredRole: 'healer',
      alsoRoles: ['tank'],
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
      alsoRoles: [],
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
    // A mage plays one role: no Also plays control.
    buttons[0]!.click();
    await flush();
    expect(raiderRoot.querySelector('select[aria-label="Main raid role"]')).not.toBeNull();
    expect(raiderRoot.querySelector('.also-field')).toBeNull();
  });

  it('keeps the Class dropdown in sync with the class chart after manual select changes', async () => {
    restore = useClient().restore;
    await import('./roster');
    document.body.innerHTML = '<vintage-roster-page></vintage-roster-page>';
    await flush();

    const root = document.querySelector('vintage-roster-page')!.shadowRoot!;
    const [, classSelect] = [...root.querySelectorAll<HTMLSelectElement>('.controls select')];

    classSelect!.value = 'Warrior';
    classSelect!.dispatchEvent(new Event('change'));
    await flush();
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('1 of 4 characters');

    root.querySelector<HTMLButtonElement>('.comp-toggle')!.click();
    await flush();
    const paladinBar = root.querySelector<HTMLButtonElement>(
      '.class-chart button[aria-label^="Paladin:"]',
    )!;
    paladinBar.click();
    await flush();
    expect(classSelect!.value).toBe('Paladin');

    paladinBar.click();
    await flush();
    expect(classSelect!.value).toBe('');
    expect(root.querySelector('.count')?.textContent?.trim()).toBe('4 of 4 characters');
  });
});
