import { ForeverApiError } from '@vintage/forever-api';
import { type Caller, systemCaller } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { armoryCommands } from '../src/commands';
import type { RosterEntry, RosterFetchResult, RosterListing, RosterMember } from '../src/contract';
import { fetchRosterEntry, type RosterClient, toRosterMembers } from '../src/domain/roster';
import type { ArmoryDeps } from '../src/store';
import { createMemoryArmoryDeps, type MemoryArmoryDeps } from '../src/testing';

const GUILD = 'g1';
const NOW = Date.UTC(2026, 10, 19, 12);

const officer = makeCaller('officer', { memberId: 'm-olga' });
const recruit = makeCaller('recruit', { memberId: 'm-rhea' });
const system = systemCaller(GUILD);

let clock: ReturnType<typeof fixedClock>;
let deps: MemoryArmoryDeps;
let registry: ReturnType<typeof testRegistry<ArmoryDeps>>;

beforeEach(() => {
  clock = fixedClock(NOW);
  deps = createMemoryArmoryDeps();
  registry = testRegistry<ArmoryDeps>([...armoryCommands], clock);
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller: { ...caller, guildId: GUILD } }, deps);

const ok = async <T>(name: string, input: unknown, caller: Caller): Promise<T> => {
  const result = await run(name, input, caller);
  if (!result.success) throw new Error(`${name} failed: ${result.error?.code}`);
  return result.data as T;
};

const code = (result: Awaited<ReturnType<typeof run>>) =>
  result.success ? 'OK' : result.error?.code;

const member = (over: Partial<RosterMember> = {}): RosterMember => ({
  blizzardId: 1,
  name: 'Judgement',
  surname: 'Judy',
  slug: 'judgement-judy',
  level: 60,
  guildRank: 2,
  ...over,
});

const record = (members: RosterMember[], enriched: { slug: string; result: RosterFetchResult }[]) =>
  run('armory-guild-roster-record', { members, enriched }, system);

describe('armory-guild-roster-record', () => {
  it('inserts new guild-roster characters as pending', async () => {
    await record([member()], []);
    const [entry] = await ok<RosterEntry[]>('armory-guild-roster', {}, recruit);
    expect(entry).toMatchObject({
      blizzardId: 1,
      name: 'Judgement',
      surname: 'Judy',
      slug: 'judgement-judy',
      level: 60,
      guildRank: 2,
      status: 'pending',
      className: null,
      professions: [],
      checkedAt: null,
    });
  });

  it('updates level and guild rank when they change, leaving enrichment alone', async () => {
    await record(
      [member()],
      [
        {
          slug: 'judgement-judy',
          result: {
            status: 'found',
            className: 'Paladin',
            raceName: 'Human',
            activeSpec: 'Retribution',
            professions: [],
            avatarUrl: null,
            profileUrl:
              'https://worldofwarcraft.blizzard.com/en-us/forever/us/armory/character/judgement-judy',
          },
        },
      ],
    );
    await record([member({ level: 61, guildRank: 1 })], []);
    const [entry] = await ok<RosterEntry[]>('armory-guild-roster', {}, recruit);
    expect(entry).toMatchObject({ level: 61, guildRank: 1, className: 'Paladin', status: 'found' });
  });

  it('removes entries no longer in the guild roster', async () => {
    await record(
      [
        member(),
        member({ blizzardId: 2, name: 'Bulwark', surname: 'Stone', slug: 'bulwark-stone' }),
      ],
      [],
    );
    await record([member()], []);
    const entries = await ok<RosterEntry[]>('armory-guild-roster', {}, recruit);
    expect(entries.map((e) => e.slug)).toEqual(['judgement-judy']);
  });

  it('records a found enrichment, and keeps the guild-roster listing on an error', async () => {
    await record([member()], []);
    await record(
      [member()],
      [
        {
          slug: 'judgement-judy',
          result: {
            status: 'found',
            className: 'Paladin',
            raceName: 'Human',
            activeSpec: 'Retribution',
            professions: [{ name: 'Blacksmithing', level: 150, maxLevel: 150 }],
            avatarUrl: 'https://render.worldofwarcraft.com/a.jpg',
            profileUrl:
              'https://worldofwarcraft.blizzard.com/en-us/forever/us/armory/character/judgement-judy',
          },
        },
      ],
    );
    let [entry] = await ok<RosterEntry[]>('armory-guild-roster', {}, recruit);
    expect(entry).toMatchObject({
      status: 'found',
      className: 'Paladin',
      activeSpec: 'Retribution',
      professions: [{ name: 'Blacksmithing', level: 150, maxLevel: 150 }],
      checkedAt: NOW,
    });

    clock.advance(1000);
    await record(
      [member()],
      [{ slug: 'judgement-judy', result: { status: 'error', error: 'Blizzard /profile: 503' } }],
    );
    [entry] = await ok<RosterEntry[]>('armory-guild-roster', {}, recruit);
    // Still in the listing; still has the last good enrichment under a new error status.
    expect(entry).toMatchObject({
      status: 'error',
      error: 'Blizzard /profile: 503',
      checkedAt: NOW + 1000,
    });
  });

  it('ignores an enrichment for a slug dropped from the guild mid-sync', async () => {
    const result = await record(
      [],
      [{ slug: 'ghost-gone', result: { status: 'error', error: 'x' } }],
    );
    expect(result).toMatchObject({ success: true, data: { enriched: 0 } });
  });

  it('is for the system only', async () => {
    expect(
      code(await run('armory-guild-roster-record', { members: [member()], enriched: [] }, officer)),
    ).toBe('COMMAND_NOT_FOUND');
  });
});

describe('armory-guild-roster-sync', () => {
  it('asks the roster effect to sync, and is system only', async () => {
    expect(await ok('armory-guild-roster-sync', {}, system)).toEqual({ requested: true });
    expect(deps.rosterSyncs).toEqual([GUILD]);
    expect(code(await run('armory-guild-roster-sync', {}, officer))).toBe('COMMAND_NOT_FOUND');
  });
});

describe('armory-guild-roster', () => {
  it('names the member who linked each character, else the one with its full name', async () => {
    deps.characters.set(GUILD, [
      { id: 'c-judy', memberId: 'm-judy', name: 'Judgement Judy', class: 'paladin' },
      { id: 'c-bul', memberId: 'm-bul', name: 'Bulwark', class: 'warrior' },
      { id: 'c-imp', memberId: 'm-imp', name: 'Bulwark Stone', class: 'warrior' },
    ]);
    await deps.armory.insertLink({
      guildId: GUILD,
      characterId: 'c-bul',
      name: 'Bulwark',
      surname: 'Stone',
      slug: 'bulwark-stone',
      status: 'found',
      profile: null,
      equipment: [],
      avatarUrl: null,
      classMismatch: false,
      error: null,
      linkedBy: 'm-bul',
      linkedAt: NOW,
      requestedAt: NOW,
      checkedAt: NOW,
      fetchedAt: NOW,
    });
    await record(
      [
        member(),
        member({ blizzardId: 2, name: 'Bulwark', surname: 'Stone', slug: 'bulwark-stone' }),
        member({ blizzardId: 3, name: 'Nobody', surname: 'Here', slug: 'nobody-here' }),
      ],
      [],
    );
    const entries = await ok<RosterListing[]>('armory-guild-roster', {}, recruit);
    expect(Object.fromEntries(entries.map((e) => [e.slug, e.memberId]))).toEqual({
      'judgement-judy': 'm-judy',
      'bulwark-stone': 'm-bul',
      'nobody-here': null,
    });
    // Visitors and members get the roster, but not who plays what.
    for (const tier of ['public', 'member'] as const) {
      const theirs = await ok<RosterListing[]>('armory-guild-roster', {}, makeCaller(tier));
      expect(theirs).toHaveLength(3);
      expect(theirs.every((e) => e.memberId === null)).toBe(true);
    }
  });

  it('is readable by everyone, sorted by guild rank then name', async () => {
    await record(
      [
        member({ blizzardId: 1, name: 'Zed', surname: 'Zeeb', slug: 'zed-zeeb', guildRank: 2 }),
        member({ blizzardId: 2, name: 'Alpha', surname: 'Judy', slug: 'alpha-judy', guildRank: 1 }),
        member({ blizzardId: 3, name: 'Beta', surname: 'Judy', slug: 'beta-judy', guildRank: 2 }),
      ],
      [],
    );
    for (const caller of [recruit, makeCaller('public')]) {
      const entries = await ok<RosterEntry[]>('armory-guild-roster', {}, caller);
      expect(entries.map((e) => e.name)).toEqual(['Alpha', 'Beta', 'Zed']);
    }
  });
});

describe('toRosterMembers', () => {
  it("maps Blizzard's guild roster to the record command's members", () => {
    expect(
      toRosterMembers({
        members: [
          { character: { id: 7, name: 'Lornn', surname: 'Arcos', level: 60 }, rank: 4 },
          { character: { id: 8, name: 'Quill' }, rank: 7 },
        ],
      }),
    ).toEqual([
      {
        blizzardId: 7,
        name: 'Lornn',
        surname: 'Arcos',
        slug: 'lornn-arcos',
        level: 60,
        guildRank: 4,
      },
      { blizzardId: 8, name: 'Quill', surname: '', slug: 'quill-', level: 0, guildRank: 7 },
    ]);
  });
});

describe('fetchRosterEntry', () => {
  const PROFILE = {
    id: 1,
    name: 'Judgement',
    surname: 'Judy',
    level: 60,
    character_class: { id: 2, name: 'Paladin' },
    race: { id: 1, name: 'Human' },
  };

  const client = (over: Partial<RosterClient> = {}): RosterClient => ({
    characterProfile: async () => PROFILE,
    characterMedia: async () => ({
      assets: [{ key: 'avatar', value: 'https://render.example/avatar.jpg' }],
    }),
    characterSpecializations: async () => ({
      specialization_groups: [
        {
          is_active: true,
          specializations: [{ specialization: { name: 'Retribution' }, spent_points: 31 }],
        },
      ],
    }),
    // Blacksmithing in Forever's live shape (points per tier); Cooking flat, as a fallback.
    characterProfessions: async () => ({
      primaries: [
        {
          profession: { id: 164, name: 'Blacksmithing' },
          tiers: [{ skill_points: 150, max_skill_points: 150 }],
        },
      ],
      secondaries: [{ profession: { id: 185, name: 'Cooking' }, skill_points: 10, tiers: [] }],
    }),
    ...over,
  });

  it('maps class, race, spec, professions, portrait, and the armory link', async () => {
    expect(await fetchRosterEntry(client(), 'us', 'Judgement', 'Judy')).toEqual({
      status: 'found',
      className: 'Paladin',
      raceName: 'Human',
      activeSpec: 'Retribution',
      professions: [
        { name: 'Blacksmithing', level: 150, maxLevel: 150 },
        { name: 'Cooking', level: 10, maxLevel: null },
      ],
      avatarUrl: 'https://render.example/avatar.jpg',
      profileUrl:
        'https://worldofwarcraft.blizzard.com/en-us/forever/us/armory/character/judgement-judy',
    });
  });

  it('answers an error, not a throw, when the profile is missing or fails', async () => {
    expect(
      await fetchRosterEntry(
        client({ characterProfile: async () => null }),
        'us',
        'Judgement',
        'Judy',
      ),
    ).toEqual({ status: 'error', error: 'Not in the armory yet' });
    const failing = await fetchRosterEntry(
      client({
        characterProfile: async () => {
          throw new ForeverApiError('http', '/profile', 503, 'Blizzard: 503');
        },
      }),
      'us',
      'Judgement',
      'Judy',
    );
    expect(failing).toEqual({ status: 'error', error: 'Blizzard: 503' });
  });

  it('records the profile even when professions or media fail', async () => {
    const result = await fetchRosterEntry(
      client({
        characterProfessions: async () => {
          throw new ForeverApiError('http', '/professions', 404, 'gone');
        },
        characterMedia: async () => null,
      }),
      'us',
      'Judgement',
      'Judy',
    );
    expect(result).toMatchObject({ status: 'found', professions: [], avatarUrl: null });
  });
});
