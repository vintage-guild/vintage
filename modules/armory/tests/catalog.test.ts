import { type Caller, systemCaller } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { armoryCommands, catalogProfessions, fetchCatalog, toRecipeDetail } from '../src/commands';
import type {
  CharacterRecipes,
  ProfessionDetail,
  ProfessionSummary,
  RecipeMatch,
  RosterFetchResult,
  RosterMember,
  RosterRecipe,
} from '../src/contract';
import type { ArmoryDeps } from '../src/store';
import { createMemoryArmoryDeps, type MemoryArmoryDeps } from '../src/testing';

const GUILD = 'g1';
const NOW = Date.UTC(2026, 10, 20);
const visitor = makeCaller('public');
const officer = makeCaller('officer', { memberId: 'm-olga' });
const system = systemCaller(GUILD);

let deps: MemoryArmoryDeps;
let registry: ReturnType<typeof testRegistry<ArmoryDeps>>;

beforeEach(() => {
  deps = createMemoryArmoryDeps();
  registry = testRegistry<ArmoryDeps>([...armoryCommands], fixedClock(NOW));
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller: { ...caller, guildId: GUILD } }, deps);

const ok = async <T>(name: string, input: unknown, caller: Caller = visitor): Promise<T> => {
  const result = await run(name, input, caller);
  if (!result.success) throw new Error(`${name} failed: ${result.error?.code}`);
  return result.data as T;
};

const member = (name: string, level = 60): RosterMember => ({
  blizzardId: [...name].reduce((n, c) => n * 31 + c.charCodeAt(0), 7),
  name,
  surname: 'Stone',
  slug: `${name}-stone`.toLowerCase(),
  level,
  guildRank: 3,
});

const smith = (skill: number, recipes: RosterRecipe[]): RosterFetchResult => ({
  status: 'found',
  className: 'Warrior',
  raceName: 'Orc',
  activeSpec: 'Arms',
  professions: [{ name: 'Blacksmithing', level: skill, maxLevel: 300 }],
  recipes,
  avatarUrl: null,
  profileUrl: null,
});

const stone = { id: 1631, name: 'Rough Sharpening Stone', profession: 'Blacksmithing' };
const helm = { id: 9001, name: 'Lionheart Helm', profession: 'Blacksmithing' };
const forever = { id: 77777, name: 'Forever Anvil', profession: 'Blacksmithing' };

const recordCatalog = () =>
  run(
    'armory-catalog-record',
    {
      profession: 'Blacksmithing',
      professionId: 164,
      categories: [
        { name: 'Weapon Stones', recipes: [{ id: stone.id, name: stone.name }] },
        { name: 'Plate Helmets', recipes: [{ id: helm.id, name: helm.name }] },
      ],
    },
    system,
  );

beforeEach(async () => {
  await run(
    'armory-guild-roster-record',
    {
      members: [member('Anvil'), member('Brick'), member('Pip', 5)],
      enriched: [
        { slug: 'anvil-stone', result: smith(210, [stone]) },
        { slug: 'brick-stone', result: smith(255, [stone, forever]) },
      ],
    },
    system,
  );
});

describe('armory-catalog-record and armory-catalog-sync', () => {
  it('records one profession, replacing it on the next sync', async () => {
    await recordCatalog();
    await recordCatalog();
    expect(deps.armoryCatalog.rows).toHaveLength(1);
    expect(deps.armoryCatalog.rows[0]).toMatchObject({
      profession: 'Blacksmithing',
      syncedAt: NOW,
    });
  });

  it('asks the catalog effect to sync, and both are for the system only', async () => {
    expect(await ok('armory-catalog-sync', {}, system)).toEqual({ requested: true });
    expect(deps.catalogSyncs).toEqual([GUILD]);
    const refused = await run(
      'armory-catalog-record',
      { profession: 'X', professionId: 1, categories: [] },
      officer,
    );
    expect(refused.success).toBe(false);
    expect((await run('armory-catalog-sync', {}, officer)).success).toBe(false);
  });
});

describe('armory-profession-list', () => {
  it('sums each profession: catalog size, known recipes, crafters, and the best three', async () => {
    await recordCatalog();
    const [bs] = await ok<ProfessionSummary[]>('armory-profession-list', {});
    expect(bs).toMatchObject({
      profession: 'Blacksmithing',
      recipeCount: 2,
      knownCount: 1,
      crafterCount: 2,
    });
    expect(bs?.top.map((c) => [c.name, c.skill])).toEqual([
      ['Brick', 255],
      ['Anvil', 210],
    ]);
  });

  it('lists professions the roster knows before the catalog syncs, with no recipe count', async () => {
    const [bs] = await ok<ProfessionSummary[]>('armory-profession-list', {});
    expect(bs).toMatchObject({ profession: 'Blacksmithing', recipeCount: null, knownCount: 2 });
  });
});

describe('armory-profession-get', () => {
  it('answers every catalog recipe with its crafters, and known extras under Other', async () => {
    await recordCatalog();
    const detail = await ok<ProfessionDetail>('armory-profession-get', {
      profession: 'blacksmithing',
    });
    expect(detail).toMatchObject({ profession: 'Blacksmithing', recipeCount: 3, knownCount: 2 });
    expect(
      detail.categories.map((c) => [c.name, c.recipes.map((r) => [r.name, r.crafters.length])]),
    ).toEqual([
      ['Weapon Stones', [['Rough Sharpening Stone', 2]]],
      ['Plate Helmets', [['Lionheart Helm', 0]]],
      ['Other', [['Forever Anvil', 1]]],
    ]);
    expect(detail.categories[0]?.recipes[0]?.crafters.map((c) => c.name)).toEqual([
      'Brick',
      'Anvil',
    ]);
  });

  it('takes the profession with hyphens and any case, and says when there is none', async () => {
    await run(
      'armory-catalog-record',
      {
        profession: 'First Aid',
        professionId: 129,
        categories: [{ name: 'Bandages', recipes: [{ id: 3275, name: 'Linen Bandage' }] }],
      },
      system,
    );
    expect(
      (await ok<ProfessionDetail>('armory-profession-get', { profession: 'first-aid' })).profession,
    ).toBe('First Aid');
    const missing = await run('armory-profession-get', { profession: 'Jewelcrafting' }, visitor);
    expect(missing.success ? 'OK' : missing.error?.code).toBe('PROFESSION_NOT_FOUND');
  });
});

describe('armory-recipe-search with the catalog', () => {
  it('finds recipes nobody knows yet, with no crafters', async () => {
    await recordCatalog();
    const { recipes } = await ok<{ recipes: RecipeMatch[] }>('armory-recipe-search', {
      query: 'helm',
    });
    expect(recipes).toEqual([
      { id: helm.id, name: helm.name, profession: 'Blacksmithing', itemId: null, crafters: [] },
    ]);
  });
});

describe('fetchCatalog and catalogProfessions', () => {
  it('skips the test profession and gathering skills', () => {
    const names = catalogProfessions({
      professions: [
        { id: 164, name: 'Blacksmithing' },
        { id: 182, name: 'Herbalism' },
        { id: 999, name: 'Test Profession' },
        { id: 186, name: 'Mining' },
      ],
    }).map((p) => p.name);
    expect(names).toEqual(['Blacksmithing', 'Mining']);
  });

  it('collects named recipes from every skill tier, dropping empty categories', async () => {
    const categories = await fetchCatalog(
      {
        profession: async () => ({ id: 164, skill_tiers: [{ id: 2938 }] }),
        professionSkillTier: async () => ({
          id: 2938,
          categories: [
            {
              name: 'Weapon Stones',
              recipes: [{ id: 1631, name: 'Rough Sharpening Stone' }, { id: 1 }],
            },
            { name: 'Empty', recipes: [] },
          ],
        }),
      },
      164,
    );
    expect(categories).toEqual([
      { name: 'Weapon Stones', recipes: [{ id: 1631, name: 'Rough Sharpening Stone' }] },
    ]);
  });
});

describe('recipe details', () => {
  const lionheart = {
    recipeId: helm.id,
    itemId: 12640,
    itemName: 'Lionheart Helm',
    quality: 'epic',
    quantity: 1,
    lines: ['Binds when equipped', '+18 Strength'],
    reagents: [{ name: 'Thorium Bar', quantity: 80 }],
  };

  it('records details for the system, answers them to anyone, and links the item', async () => {
    await recordCatalog();
    expect(
      await ok('armory-recipe-detail-record', { details: [lionheart, { recipeId: 7 }] }, system),
    ).toEqual({
      recorded: 1,
      refused: [{ recipeId: 7, issue: expect.stringMatching(/^itemId: /) }],
    });
    const refused = await run('armory-recipe-detail-record', { details: [lionheart] }, officer);
    expect(refused.success).toBe(false);
    const { detail } = await ok<{ detail: Record<string, unknown> | null }>('armory-recipe-get', {
      recipeId: helm.id,
    });
    expect(detail).toMatchObject({ ...lionheart, syncedAt: NOW });
    const page = await ok<ProfessionDetail>('armory-profession-get', {
      profession: 'Blacksmithing',
    });
    expect(page.categories[1]?.recipes[0]).toMatchObject({ name: 'Lionheart Helm', itemId: 12640 });
  });

  it('answers null for a recipe whose details have not synced', async () => {
    expect(await ok('armory-recipe-get', { recipeId: 1 })).toEqual({ detail: null });
  });
});

describe('armory-character-recipes', () => {
  it('splits a character’s professions into known and missing catalog recipes', async () => {
    await recordCatalog();
    const brick = await ok<CharacterRecipes>('armory-character-recipes', { slug: 'Brick-Stone' });
    expect(brick).toMatchObject({ name: 'Brick', slug: 'brick-stone' });
    expect(brick.professions).toEqual([
      {
        profession: 'Blacksmithing',
        skill: 255,
        maxSkill: 300,
        known: [
          { id: forever.id, name: forever.name, itemId: null },
          { id: stone.id, name: stone.name, itemId: null },
        ],
        missing: [{ id: helm.id, name: helm.name, itemId: null }],
      },
    ]);
  });

  it('says when there is no such character', async () => {
    const missing = await run('armory-character-recipes', { slug: 'nobody-here' }, visitor);
    expect(missing.success ? 'OK' : missing.error?.code).toBe('CHARACTER_NOT_FOUND');
  });
});

describe('itemLines and toRecipeDetail', () => {
  it('reads Blizzard’s display strings in tooltip order, marking equip bonuses', () => {
    const detail = toRecipeDetail(
      9331,
      {
        id: 9331,
        crafted_item: { id: 12640, name: 'Lionheart Helm' },
        crafted_quantity: { value: 1 },
        reagents: [{ reagent: { id: 12359, name: 'Thorium Bar' }, quantity: 80 }],
      },
      {
        id: 12640,
        name: 'Lionheart Helm',
        quality: { type: 'EPIC', name: 'Epic' },
        preview_item: {
          binding: { name: 'Binds when equipped' },
          inventory_type: { type: 'HEAD', name: 'Head' },
          item_subclass: { name: 'Plate' },
          armor: { display: { display_string: '565 Armor' } },
          stats: [
            { display: { display_string: '+18 Strength' } },
            { is_equip_bonus: true, display: { display_string: '+20 Hit' } },
          ],
          spells: [],
          requirements: { level: { display_string: 'Requires Level 56' } },
        },
      },
    );
    expect(detail).toEqual({
      recipeId: 9331,
      itemId: 12640,
      itemName: 'Lionheart Helm',
      quality: 'epic',
      quantity: 1,
      lines: [
        'Binds when equipped',
        'Head, Plate',
        '565 Armor',
        '+18 Strength',
        'Equip: +20 Hit',
        'Requires Level 56',
      ],
      reagents: [{ name: 'Thorium Bar', quantity: 80 }],
    });
  });
});
