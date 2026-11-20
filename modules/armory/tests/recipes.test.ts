import { type Caller, systemCaller } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { armoryCommands } from '../src/commands';
import type { RecipeMatch, RosterFetchResult, RosterMember, RosterRecipe } from '../src/contract';
import type { ArmoryDeps } from '../src/store';
import { createMemoryArmoryDeps, type MemoryArmoryDeps } from '../src/testing';

const GUILD = 'g1';
const visitor = makeCaller('public');

let deps: MemoryArmoryDeps;
let registry: ReturnType<typeof testRegistry<ArmoryDeps>>;

beforeEach(() => {
  deps = createMemoryArmoryDeps();
  registry = testRegistry<ArmoryDeps>([...armoryCommands], fixedClock(Date.UTC(2026, 10, 19)));
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller: { ...caller, guildId: GUILD } }, deps);

type Search = { recipes: RecipeMatch[]; truncated: boolean };
const search = async (input: unknown) => {
  const result = await run('armory-recipe-search', input, visitor);
  if (!result.success) throw new Error(`search failed: ${result.error?.code}`);
  return result.data as Search;
};

// Blizzard's id from the name, distinct per character (the record dedupes repeated ids).
const member = (name: string, surname: string): RosterMember => ({
  blizzardId: [...name].reduce((n, c) => n * 31 + c.charCodeAt(0), 7),
  name,
  surname,
  slug: `${name}-${surname}`.toLowerCase(),
  level: 60,
  guildRank: 3,
});

const found = (skill: number, recipes: RosterRecipe[]): RosterFetchResult => ({
  status: 'found',
  className: 'Warrior',
  raceName: 'Orc',
  activeSpec: 'Arms',
  professions: [{ name: 'Blacksmithing', level: skill, maxLevel: 300 }],
  recipes,
  avatarUrl: null,
  profileUrl: null,
});

const bracers = { id: 1993, name: 'Green Iron Bracers', profession: 'Blacksmithing' };
const helm = { id: 9999, name: 'Iron Helm', profession: 'Blacksmithing' };
const flask = { id: 17635, name: 'Flask of the Titans', profession: 'Alchemy' };

const seed = (enriched: { slug: string; result: RosterFetchResult }[], members: RosterMember[]) =>
  run('armory-guild-roster-record', { members, enriched }, systemCaller(GUILD));

describe('armory-recipe-search', () => {
  beforeEach(async () => {
    await seed(
      [
        { slug: 'anvil-stone', result: found(210, [bracers, helm]) },
        { slug: 'brick-stone', result: found(300, [bracers, flask]) },
      ],
      [member('Anvil', 'Stone'), member('Brick', 'Stone')],
    );
  });

  it('finds recipes by part of the name, any case, with every crafter, best skill first', async () => {
    const { recipes, truncated } = await search({ query: 'IRON' });
    expect(truncated).toBe(false);
    expect(recipes.map((r) => r.name)).toEqual(['Green Iron Bracers', 'Iron Helm']);
    expect(recipes[0]?.crafters.map((c) => [c.name, c.skill])).toEqual([
      ['Brick', 300],
      ['Anvil', 210],
    ]);
    expect(recipes[0]?.crafters[0]).toMatchObject({ slug: 'brick-stone', maxSkill: 300 });
  });

  it('narrows to one profession', async () => {
    expect((await search({ query: 'of', profession: 'Alchemy' })).recipes.map((r) => r.id)).toEqual(
      [17635],
    );
    expect((await search({ query: 'flask', profession: 'Blacksmithing' })).recipes).toEqual([]);
  });

  it('needs at least two letters', async () => {
    const result = await run('armory-recipe-search', { query: ' i ' }, visitor);
    expect(result.success).toBe(false);
  });

  it('caps the answer and says when it did', async () => {
    const many = Array.from({ length: 55 }, (_, i) => ({
      id: 100 + i,
      name: `Rough Thing ${String(i).padStart(2, '0')}`,
      profession: 'Blacksmithing',
    }));
    await seed([{ slug: 'anvil-stone', result: found(210, many) }], [member('Anvil', 'Stone')]);
    const { recipes, truncated } = await search({ query: 'rough' });
    expect(recipes).toHaveLength(50);
    expect(truncated).toBe(true);
  });

  it('keeps recipes out of the roster listing', async () => {
    const result = await run('armory-guild-roster', {}, visitor);
    expect(result.success).toBe(true);
    for (const entry of result.data as object[]) expect(entry).not.toHaveProperty('recipes');
  });
});
