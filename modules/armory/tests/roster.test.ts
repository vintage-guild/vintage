import { ForeverApiError } from '@vintage/forever-api';
import { type Caller, systemCaller } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { armoryCommands } from '../src/commands';
import type { RosterEntry, RosterFetchResult, RosterMember } from '../src/contract';
import { fetchRosterEntry, type RosterClient } from '../src/domain/roster';
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
  it('is readable by recruits and up, sorted by guild rank then name', async () => {
    await record(
      [
        member({ blizzardId: 1, name: 'Zed', surname: 'Zeeb', slug: 'zed-zeeb', guildRank: 2 }),
        member({ blizzardId: 2, name: 'Alpha', surname: 'Judy', slug: 'alpha-judy', guildRank: 1 }),
        member({ blizzardId: 3, name: 'Beta', surname: 'Judy', slug: 'beta-judy', guildRank: 2 }),
      ],
      [],
    );
    const entries = await ok<RosterEntry[]>('armory-guild-roster', {}, recruit);
    expect(entries.map((e) => e.name)).toEqual(['Alpha', 'Beta', 'Zed']);
    expect(code(await run('armory-guild-roster', {}, makeCaller('public')))).toBe(
      'COMMAND_NOT_FOUND',
    );
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
    characterProfessions: async () => ({
      primaries: [
        {
          profession: { id: 164, name: 'Blacksmithing' },
          skill_points: 150,
          max_skill_points: 150,
        },
      ],
      secondaries: [{ profession: { id: 185, name: 'Cooking' }, skill_points: 10 }],
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
