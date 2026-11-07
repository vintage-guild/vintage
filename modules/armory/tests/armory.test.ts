import { ForeverApiError } from '@vintage/forever-api';
import { type Caller, systemCaller } from '@vintage/guild-kit';
import { fixedClock, makeCaller, previewAndConfirm, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { armoryCommands } from '../src/commands';
import {
  ARMORY_REFRESH_COOLDOWN_MS,
  ARMORY_STALE_MS,
  type ArmoryEntry,
  type ArmoryFetchResult,
  type ArmoryLink,
} from '../src/contract';
import { type ArmoryClient, fetchArmory } from '../src/domain/fetch';
import type { ArmoryDeps } from '../src/store';
import { createMemoryArmoryDeps, type MemoryArmoryDeps } from '../src/testing';

const GUILD = 'g1';
const NOW = Date.UTC(2026, 10, 7, 20);
const HOUR = 60 * 60 * 1000;

const alice = makeCaller('member', { memberId: 'm-alice' });
const bob = makeCaller('member', { memberId: 'm-bob' });
const recruit = makeCaller('recruit', { memberId: 'm-rhea' });
const officer = makeCaller('officer', { memberId: 'm-olga' });
const system = systemCaller(GUILD);

let clock: ReturnType<typeof fixedClock>;
let deps: MemoryArmoryDeps;
let registry: ReturnType<typeof testRegistry<ArmoryDeps>>;

beforeEach(() => {
  clock = fixedClock(NOW);
  deps = createMemoryArmoryDeps();
  deps.characters.set(GUILD, [
    { id: 'c-judy', memberId: 'm-alice', name: 'Judgement', class: 'paladin' },
    { id: 'c-alt', memberId: 'm-alice', name: 'Quickshot', class: 'hunter' },
    { id: 'c-bob', memberId: 'm-bob', name: 'Bulwark', class: 'warrior' },
  ]);
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

const FOUND: ArmoryFetchResult = {
  status: 'found',
  profile: {
    blizzardId: 3889172,
    name: 'Judgement',
    surname: 'Judy',
    level: 41,
    className: 'Paladin',
    raceName: 'Human',
    faction: 'ALLIANCE',
    guildName: 'Vintage',
    guildSlug: 'vintage',
    activeSpec: null,
    equippedItemLevel: 38,
    averageItemLevel: 39,
    lastLoginAt: NOW - HOUR,
  },
  equipment: [{ slot: 'HEAD', itemId: 2017, name: 'Helm', quality: 'rare', itemLevel: 38 }],
  avatarUrl: 'https://render.worldofwarcraft.com/us/character/judy-avatar.jpg',
};

const link = (characterId = 'c-judy', surname = 'Judy', caller = alice) =>
  ok<ArmoryLink>('armory-link', { characterId, surname }, caller);

const record = (l: ArmoryLink, result: ArmoryFetchResult) =>
  run('armory-record', { linkId: l.id, slug: l.slug, result }, system);

describe('armory-link', () => {
  it('links your character by surname and asks for a fetch', async () => {
    const linked = await link();
    expect(linked).toMatchObject({
      characterId: 'c-judy',
      name: 'Judgement',
      surname: 'Judy',
      slug: 'judgement-judy',
      status: 'pending',
      profile: null,
      linkedBy: 'm-alice',
      requestedAt: NOW,
      checkedAt: null,
    });
    expect(deps.fetches).toEqual([{ guildId: GUILD, linkIds: [linked.id] }]);
  });

  it('answers not found for someone else’s character, unless you are an officer', async () => {
    expect(code(await run('armory-link', { characterId: 'c-bob', surname: 'Stone' }, alice))).toBe(
      'CHARACTER_NOT_FOUND',
    );
    expect(code(await run('armory-link', { characterId: 'nope', surname: 'Stone' }, alice))).toBe(
      'CHARACTER_NOT_FOUND',
    );
    const linked = await link('c-bob', 'Stone', officer);
    expect(linked).toMatchObject({ slug: 'bulwark-stone', linkedBy: 'm-olga' });
  });

  it('refuses a surname that can’t be part of a slug', async () => {
    for (const surname of ['', 'Two Words', 'a/b', "O'Neil", 'x'.repeat(13)]) {
      expect(code(await run('armory-link', { characterId: 'c-judy', surname }, alice))).toBe(
        'VALIDATION_ERROR',
      );
    }
  });

  it('takes the surname from a character registered with its last name', async () => {
    deps.characters.get(GUILD)!.push({
      id: 'c-full',
      memberId: 'm-alice',
      name: 'Bloodfen Il',
      class: 'warrior',
    });
    const linked = await ok<ArmoryLink>('armory-link', { characterId: 'c-full' }, alice);
    expect(linked).toMatchObject({ name: 'Bloodfen', surname: 'Il', slug: 'bloodfen-il' });
    // Giving the same surname again (any case) is the same link; another one is refused.
    expect(await ok('armory-link', { characterId: 'c-full', surname: 'IL' }, alice)).toEqual(
      linked,
    );
    expect(code(await run('armory-link', { characterId: 'c-full', surname: 'Stone' }, alice))).toBe(
      'ARMORY_SURNAME_MISMATCH',
    );
  });

  it('asks for a surname when the registered name has none', async () => {
    expect(code(await run('armory-link', { characterId: 'c-judy' }, alice))).toBe(
      'ARMORY_SURNAME_NEEDED',
    );
  });

  it('refuses an armory character already linked to another registered character', async () => {
    await link();
    // Bob registered a "Judgement" too; the same name and surname is the same armory character.
    deps.characters.get(GUILD)!.push({
      id: 'c-bob-judy',
      memberId: 'm-bob',
      name: 'judgement',
      class: 'paladin',
    });
    const result = await run('armory-link', { characterId: 'c-bob-judy', surname: 'JUDY' }, bob);
    expect(code(result)).toBe('ARMORY_ALREADY_LINKED');
  });

  it('changes nothing when linked again with the same surname', async () => {
    const first = await link();
    clock.advance(HOUR);
    const again = await link('c-judy', 'judy');
    expect(again).toEqual(first);
    expect(deps.fetches).toHaveLength(1);
  });

  it('replaces the link and what it found when the surname changes', async () => {
    const first = await link('c-judy', 'Judee');
    await record(first, FOUND);
    clock.advance(HOUR);
    const second = await link('c-judy', 'Judy');
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      slug: 'judgement-judy',
      status: 'pending',
      profile: null,
      equipment: [],
      avatarUrl: null,
      requestedAt: NOW + HOUR,
      fetchedAt: null,
    });
    expect(deps.fetches).toHaveLength(2);
  });

  it('never fetches more often than the refresh cooldown by switching surnames', async () => {
    const first = await link('c-judy', 'Jude');
    for (let i = 0; i < 10; i++) await link('c-judy', i % 2 ? 'Jude' : 'Judy');
    // One fetch, for the first link; the surname saved is the last one, waiting for the sweep.
    expect(deps.fetches).toHaveLength(1);
    const now = deps.armory.links.get(first.id)!;
    expect(now).toMatchObject({ slug: 'judgement-jude', status: 'pending', requestedAt: NOW });
    clock.advance(ARMORY_REFRESH_COOLDOWN_MS);
    expect(await ok('armory-sweep', {}, system)).toMatchObject({ requested: 1 });
    expect(deps.fetches.at(-1)!.linkIds).toEqual([first.id]);
  });
});

describe('armory-record', () => {
  it('keeps the profile, gear, and portrait a fetch found', async () => {
    const linked = await link();
    clock.advance(5000);
    const result = await record(linked, FOUND);
    expect(result.data).toMatchObject({
      recorded: true,
      link: {
        status: 'found',
        profile: { level: 41, className: 'Paladin', equippedItemLevel: 38 },
        equipment: [{ slot: 'HEAD', itemId: 2017 }],
        classMismatch: false,
        checkedAt: NOW + 5000,
        fetchedAt: NOW + 5000,
      },
    });
  });

  it('flags an armory class that differs from the registered one', async () => {
    // Quickshot is registered as a hunter; the armory character is a paladin.
    const linked = await link('c-alt', 'Judy');
    const result = await record(linked, FOUND);
    expect(result.data).toMatchObject({ link: { classMismatch: true } });
  });

  it('keeps the last good data through a miss or an error', async () => {
    const linked = await link();
    await record(linked, FOUND);
    clock.advance(HOUR);
    await record(linked, { status: 'not-found' });
    let now = deps.armory.links.get(linked.id)!;
    expect(now).toMatchObject({ status: 'not-found', fetchedAt: NOW, checkedAt: NOW + HOUR });
    expect(now.profile?.level).toBe(41);
    clock.advance(HOUR);
    await record(linked, { status: 'error', error: 'Blizzard /profile: 503' });
    now = deps.armory.links.get(linked.id)!;
    expect(now).toMatchObject({ status: 'error', error: 'Blizzard /profile: 503' });
    expect(now.equipment).toHaveLength(1);
  });

  it('ignores a fetch for a surname that has since changed, or a removed link', async () => {
    const old = await link('c-judy', 'Judee');
    await link('c-judy', 'Judy');
    const stale = await record(old, FOUND);
    expect(stale.data).toMatchObject({ recorded: false });
    expect(deps.armory.links.get(old.id)!.status).toBe('pending');

    const gone = await run(
      'armory-record',
      { linkId: 'armory_404', slug: 'x-y', result: FOUND },
      system,
    );
    expect(gone.data).toMatchObject({ recorded: false, link: null });
  });

  it('is for the system only', async () => {
    const linked = await link();
    const result = await run(
      'armory-record',
      { linkId: linked.id, slug: linked.slug, result: FOUND },
      officer,
    );
    expect(code(result)).toBe('COMMAND_NOT_FOUND');
  });

  it('refuses a portrait that isn’t https', async () => {
    const linked = await link();
    const result = await record(linked, { ...FOUND, avatarUrl: 'javascript:alert(1)' } as never);
    expect(code(result)).toBe('VALIDATION_ERROR');
  });
});

describe('armory-get and armory-list', () => {
  it('shows a character’s link with its current owner, or null', async () => {
    const linked = await link();
    await record(linked, FOUND);
    const own = await ok<{ link: ArmoryEntry | null }>(
      'armory-get',
      { characterId: 'c-judy' },
      alice,
    );
    expect(own.link).toMatchObject({ memberId: 'm-alice', status: 'found' });
    const got = await ok<{ link: ArmoryEntry | null }>(
      'armory-get',
      { characterId: 'c-judy' },
      recruit,
    );
    expect(got.link).toMatchObject({ memberId: 'm-alice', status: 'found' });
    const none = await ok<{ link: ArmoryEntry | null }>(
      'armory-get',
      { characterId: 'c-bob' },
      bob,
    );
    expect(none.link).toBeNull();
    expect(code(await run('armory-get', { characterId: 'nope' }, bob))).toBe('CHARACTER_NOT_FOUND');
  });

  it('answers a member asking about someone else’s character as not found', async () => {
    await link();
    // The same answer as a missing character, so it says nothing about whose it is.
    expect(code(await run('armory-get', { characterId: 'c-judy' }, bob))).toBe(
      'CHARACTER_NOT_FOUND',
    );
  });

  it('lists your links, and the guild’s for recruits and up', async () => {
    await link('c-judy', 'Judy');
    await link('c-alt', 'Judy');
    await link('c-bob', 'Stone', officer);
    const mine = await ok<ArmoryEntry[]>('armory-list', {}, alice);
    expect(mine.map((e) => e.slug)).toEqual(['judgement-judy', 'quickshot-judy']);
    expect(code(await run('armory-list', { allGuild: true }, bob))).toBe('FORBIDDEN');
    expect(code(await run('armory-list', { memberId: 'm-alice' }, bob))).toBe('FORBIDDEN');
    const all = await ok<ArmoryEntry[]>('armory-list', { allGuild: true }, recruit);
    expect(all.map((e) => e.name)).toEqual(['Bulwark', 'Judgement', 'Quickshot']);
    const bobs = await ok<ArmoryEntry[]>('armory-list', { memberId: 'm-bob' }, recruit);
    expect(bobs.map((e) => e.memberId)).toEqual(['m-bob']);
  });

  it('follows a character to its new owner and leaves out removed characters', async () => {
    await link('c-judy', 'Judy');
    await link('c-alt', 'Judy');
    const chars = deps.characters.get(GUILD)!;
    chars.find((c) => c.id === 'c-judy')!.memberId = 'm-bob';
    deps.characters.set(
      GUILD,
      chars.filter((c) => c.id !== 'c-alt'),
    );
    expect((await ok<ArmoryEntry[]>('armory-list', {}, alice)).map((e) => e.slug)).toEqual([]);
    expect((await ok<ArmoryEntry[]>('armory-list', {}, bob)).map((e) => e.slug)).toEqual([
      'judgement-judy',
    ]);
  });
});

describe('armory-refresh', () => {
  it('asks again once the cooldown has passed', async () => {
    await link();
    expect(code(await run('armory-refresh', { characterId: 'c-judy' }, alice))).toBe(
      'ARMORY_REFRESH_TOO_SOON',
    );
    clock.advance(ARMORY_REFRESH_COOLDOWN_MS);
    const refreshed = await ok<ArmoryLink>('armory-refresh', { characterId: 'c-judy' }, alice);
    expect(refreshed.requestedAt).toBe(NOW + ARMORY_REFRESH_COOLDOWN_MS);
    expect(deps.fetches).toHaveLength(2);
  });

  it('needs a link and your own character', async () => {
    expect(code(await run('armory-refresh', { characterId: 'c-judy' }, alice))).toBe(
      'ARMORY_NOT_LINKED',
    );
    expect(code(await run('armory-refresh', { characterId: 'c-bob' }, alice))).toBe(
      'CHARACTER_NOT_FOUND',
    );
  });
});

describe('armory-unlink', () => {
  it('previews, then removes the link once confirmed', async () => {
    const linked = await link();
    const { preview, result } = await previewAndConfirm(
      registry,
      {
        name: 'armory-unlink',
        input: { characterId: 'c-judy' },
        caller: { ...alice, guildId: GUILD },
      },
      deps,
    );
    expect(preview.data).toMatchObject({ preview: { willUnlink: { id: linked.id } } });
    expect(result).toMatchObject({ success: true, data: { unlinked: { id: linked.id } } });
    expect(deps.armory.links.size).toBe(0);
  });

  it('needs a link and your own character', async () => {
    expect(code(await run('armory-unlink', { characterId: 'c-judy' }, alice))).toBe(
      'ARMORY_NOT_LINKED',
    );
    await link('c-bob', 'Stone', officer);
    expect(code(await run('armory-unlink', { characterId: 'c-bob' }, alice))).toBe(
      'CHARACTER_NOT_FOUND',
    );
  });
});

describe('armory-sweep', () => {
  const sweep = () =>
    ok<{ requested: number; waiting: number; removed: number }>('armory-sweep', {}, system);

  it('asks again about stale links, oldest first, and skips ones just asked for', async () => {
    const judy = await link('c-judy', 'Judy');
    const alt = await link('c-alt', 'Judy');
    deps.fetches.length = 0;
    // Both were just asked for when linked.
    expect(await sweep()).toEqual({ requested: 0, waiting: 0, removed: 0 });

    clock.advance(ARMORY_REFRESH_COOLDOWN_MS);
    await record(alt, FOUND);
    // Judy's first fetch never answered; alt was checked just now.
    expect(await sweep()).toEqual({ requested: 1, waiting: 0, removed: 0 });
    expect(deps.fetches).toEqual([{ guildId: GUILD, linkIds: [judy.id] }]);

    clock.advance(ARMORY_STALE_MS);
    await record(judy, FOUND);
    expect(await sweep()).toMatchObject({ requested: 1 });
    expect(deps.fetches.at(-1)!.linkIds).toEqual([alt.id]);
  });

  it('asks for at most a batch per run', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `c-${i}`,
      memberId: 'm-alice',
      name: `Alt${String.fromCharCode(97 + (i % 26))}${i}`,
      class: 'mage',
    }));
    deps.characters.get(GUILD)!.push(...many);
    for (const c of many) await link(c.id, 'Judy');
    clock.advance(ARMORY_REFRESH_COOLDOWN_MS);
    expect(await sweep()).toEqual({ requested: 25, waiting: 5, removed: 0 });
    const first = new Set(deps.fetches.at(-1)!.linkIds);
    clock.advance(ARMORY_REFRESH_COOLDOWN_MS);
    // None of the 25 answered, so all 30 are due; the 5 never asked for go first.
    expect(await sweep()).toEqual({ requested: 25, waiting: 5, removed: 0 });
    const second = deps.fetches.at(-1)!.linkIds;
    expect(second.slice(0, 5).some((id) => first.has(id))).toBe(false);

    for (const l of deps.armory.links.values()) await record(l, { status: 'not-found' });
    expect(await sweep()).toMatchObject({ requested: 0, waiting: 0 });
  });

  it('removes links whose character is gone', async () => {
    await link('c-alt', 'Judy');
    deps.characters.set(
      GUILD,
      deps.characters.get(GUILD)!.filter((c) => c.id !== 'c-alt'),
    );
    expect(await sweep()).toMatchObject({ removed: 1 });
    expect(deps.armory.links.size).toBe(0);
  });

  it('is for the system only', async () => {
    expect(code(await run('armory-sweep', {}, officer))).toBe('COMMAND_NOT_FOUND');
  });
});

describe('fetchArmory', () => {
  const PROFILE = {
    id: 3889172,
    name: 'Judgement',
    surname: 'Judy',
    level: 41,
    character_class: { id: 2, name: 'Paladin' },
    race: { id: 1, name: 'Human' },
    faction: { type: 'ALLIANCE', name: 'Alliance' },
    guild: { name: 'Vintage', slug: 'vintage' },
    equipped_item_level: 38,
    average_item_level: 39,
    last_login_timestamp: NOW - HOUR,
  };

  const client = (over: Partial<ArmoryClient> = {}): ArmoryClient => ({
    characterProfile: async () => PROFILE,
    characterEquipment: async () => ({
      equipped_items: [
        {
          item: { id: 2017 },
          slot: { type: 'HEAD' },
          quality: { type: 'RARE' },
          name: 'Helm',
          level: { value: 38 },
        },
      ],
    }),
    characterMedia: async () => ({
      assets: [
        { key: 'inset', value: 'https://render.example/inset.jpg' },
        { key: 'avatar', value: 'https://render.example/avatar.jpg' },
      ],
    }),
    // As the live API answers it (US, Nov 7 2026): talent trees with points in the active group.
    characterSpecializations: async () => ({
      specialization_groups: [
        {
          is_active: false,
          specializations: [{ specialization: { name: 'Holy' }, spent_points: 30 }],
        },
        {
          is_active: true,
          specializations: [
            { specialization: { name: 'Holy' }, spent_points: 5 },
            { specialization: { name: 'Retribution' }, spent_points: 31 },
          ],
        },
      ],
    }),
    ...over,
  });

  it('maps the profile, gear, and portrait', async () => {
    expect(await fetchArmory(client(), 'Judgement', 'Judy')).toEqual(FOUND_FROM_API);
  });

  it('answers not-found when the armory has no such character', async () => {
    expect(
      await fetchArmory(client({ characterProfile: async () => null }), 'Judgement', 'Judy'),
    ).toEqual({ status: 'not-found' });
  });

  it('records the profile when only the gear or portrait fails', async () => {
    const result = await fetchArmory(
      client({
        characterEquipment: async () => {
          throw new ForeverApiError('http', '/equipment', 404, 'gone');
        },
        characterMedia: async () => null,
      }),
      'Judgement',
      'Judy',
    );
    expect(result).toMatchObject({ status: 'found', equipment: [], avatarUrl: null });
  });

  it('turns a failed profile into an error result instead of throwing', async () => {
    const result = await fetchArmory(
      client({
        characterProfile: async () => {
          throw new ForeverApiError(
            'http',
            '/profile/wow/character/judgement-judy',
            503,
            'Blizzard: 503',
          );
        },
      }),
      'Judgement',
      'Judy',
    );
    expect(result).toEqual({ status: 'error', error: 'Blizzard: 503' });
  });

  it('never keeps a portrait that isn’t https', async () => {
    const result = await fetchArmory(
      client({
        characterMedia: async () => ({ assets: [{ key: 'avatar', value: 'http://x/a.jpg' }] }),
      }),
      'Judgement',
      'Judy',
    );
    expect(result).toMatchObject({ status: 'found', avatarUrl: null });
  });

  it('takes the active spec from the active group’s tree with the most points', async () => {
    expect(
      await fetchArmory(
        client({ characterSpecializations: async () => ({ specialization_groups: [] }) }),
        'Judgement',
        'Judy',
      ),
    ).toMatchObject({ profile: { activeSpec: null } });
    const failing = await fetchArmory(
      client({
        characterSpecializations: async () => {
          throw new ForeverApiError('http', '/specializations', 500, 'down');
        },
      }),
      'Judgement',
      'Judy',
    );
    expect(failing).toMatchObject({ status: 'found', profile: { activeSpec: null } });
  });

  const FOUND_FROM_API = {
    ...FOUND,
    profile: { ...(FOUND as { profile: object }).profile, activeSpec: 'Retribution' },
    avatarUrl: 'https://render.example/avatar.jpg',
  } as ArmoryFetchResult;
});
