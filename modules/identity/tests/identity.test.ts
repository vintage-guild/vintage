import type { Caller } from '@vintage/guild-kit';
import {
  fixedClock,
  makeCaller,
  previewAndConfirm,
  TEST_GUILD_ID,
  testRegistry,
} from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { identityCommands } from '../src/commands';
import type { Character, Member } from '../src/contract';
import { resolveRank, tierForRank } from '../src/domain/rank';
import type { IdentityDeps } from '../src/store';
import { createMemoryIdentityDeps } from '../src/testing';

// Mirrors the Vintage Discord's rank roles (ids are placeholders until the bot reads real ones).
const ROLE_MAP = {
  'role-officer': 'officer',
  'role-raid-leader': 'raid-leader',
  'role-raider': 'raider',
  'role-flex': 'flex-raider',
  'role-recruit': 'recruit',
  'role-member': 'member',
  'role-friend': 'friend',
} as const;

describe('resolveRank / tierForRank', () => {
  it('uses the highest guild rank among the roles', () => {
    expect(resolveRank(true, ['role-recruit', 'role-officer'], ROLE_MAP)).toBe('officer');
    expect(resolveRank(true, ['role-flex', 'role-raider'], ROLE_MAP)).toBe('raider');
    expect(resolveRank(true, ['role-member', 'role-friend'], ROLE_MAP)).toBe('member');
  });

  it('gives no rank to unranked accounts or anyone outside the server', () => {
    expect(resolveRank(true, ['unmapped'], ROLE_MAP)).toBeNull();
    expect(resolveRank(true, [], ROLE_MAP)).toBeNull();
    expect(resolveRank(false, ['role-officer'], ROLE_MAP)).toBeNull();
  });

  it('maps ranks to permission tiers', () => {
    expect(tierForRank('officer')).toBe('officer');
    expect(tierForRank('raid-leader')).toBe('leader');
    expect(tierForRank('raider')).toBe('raider');
    expect(tierForRank('flex-raider')).toBe('raider');
    expect(tierForRank('recruit')).toBe('recruit');
    expect(tierForRank('member')).toBe('member');
  });

  it('treats Discord-only friends and unranked accounts as public', () => {
    expect(tierForRank('friend')).toBe('public');
    expect(tierForRank(null)).toBe('public');
  });
});

describe('identity commands', () => {
  const registry = testRegistry<IdentityDeps>([...identityCommands]);
  const system = makeCaller('officer', { surface: 'system', memberId: undefined });
  let deps: ReturnType<typeof createMemoryIdentityDeps>;
  let aeryn: Member;
  let asAeryn: Caller;

  const run = (name: string, input: unknown, caller: Caller) =>
    registry.execute({ name, input, caller }, deps);

  beforeEach(async () => {
    deps = createMemoryIdentityDeps({ ...ROLE_MAP });
    const synced = await run(
      'member-sync',
      { discordId: 'd-aeryn', displayName: 'Aeryn', inServer: true, roleIds: ['role-raider'] },
      system,
    );
    aeryn = (synced.data as { member: Member }).member;
    asAeryn = makeCaller(aeryn.tier, { memberId: aeryn.id, discordId: aeryn.discordId });
  });

  it('member-sync derives rank and tier from Discord roles and reports changes', async () => {
    expect(aeryn).toMatchObject({ rank: 'raider', tier: 'raider' });
    const promoted = await run(
      'member-sync',
      { discordId: 'd-aeryn', displayName: 'Aeryn', inServer: true, roleIds: ['role-officer'] },
      system,
    );
    expect(promoted).toMatchObject({
      success: true,
      data: { member: { id: aeryn.id, rank: 'officer', tier: 'officer' }, previousRank: 'raider' },
    });
  });

  it('member-sync makes Discord-only friends and unranked accounts public', async () => {
    const friend = await run(
      'member-sync',
      { discordId: 'd-pal', displayName: 'Pal', inServer: true, roleIds: ['role-friend'] },
      system,
    );
    expect(friend).toMatchObject({ data: { member: { rank: 'friend', tier: 'public' } } });

    const unranked = await run(
      'member-sync',
      { discordId: 'd-new', displayName: 'New', inServer: true, roleIds: [] },
      system,
    );
    expect(unranked).toMatchObject({ data: { member: { rank: null, tier: 'public' } } });
  });

  it('flex raiders get raider permissions; raid leaders get the leader tier', async () => {
    const flex = await run(
      'member-sync',
      { discordId: 'd-flex', displayName: 'Flex', inServer: true, roleIds: ['role-flex'] },
      system,
    );
    expect(flex).toMatchObject({ data: { member: { rank: 'flex-raider', tier: 'raider' } } });
    const lead = await run(
      'member-sync',
      { discordId: 'd-lead', displayName: 'Lead', inServer: true, roleIds: ['role-raid-leader'] },
      system,
    );
    expect(lead).toMatchObject({ data: { member: { rank: 'raid-leader', tier: 'leader' } } });
  });

  it('member-sync is not available to raiders', async () => {
    const result = await run(
      'member-sync',
      { discordId: 'x', displayName: 'X', inServer: true, roleIds: [] },
      asAeryn,
    );
    expect(result).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });
  });

  it('first character becomes the main, later ones are alts unless flagged', async () => {
    const main = await run(
      'character-add',
      { name: 'aeryn', class: 'druid', spec: 'restoration' },
      asAeryn,
    );
    expect(main).toMatchObject({
      success: true,
      data: { name: 'Aeryn', role: 'healer', isMain: true },
    });

    const alt = await run(
      'character-add',
      { name: 'Kol', class: 'shaman', spec: 'restoration' },
      asAeryn,
    );
    expect(alt).toMatchObject({ data: { isMain: false } });

    const newMain = await run(
      'character-add',
      { name: 'Brakk', class: 'warrior', spec: 'protection', isMain: true },
      asAeryn,
    );
    expect(newMain).toMatchObject({ data: { role: 'tank', isMain: true } });
    const mine = await run('character-list', {}, asAeryn);
    expect((mine.data as Character[]).filter((c) => c.isMain).map((c) => c.name)).toEqual([
      'Brakk',
    ]);
  });

  it('rejects a spec from the wrong class and duplicate names', async () => {
    const bad = await run('character-add', { name: 'Aeryn', class: 'mage', spec: 'holy' }, asAeryn);
    expect(bad).toMatchObject({ success: false, error: { code: 'INVALID_SPEC' } });

    await run('character-add', { name: 'Aeryn', class: 'mage', spec: 'frost' }, asAeryn);
    const dupe = await run(
      'character-add',
      { name: 'AERYN', class: 'mage', spec: 'fire' },
      asAeryn,
    );
    expect(dupe).toMatchObject({ success: false, error: { code: 'CHARACTER_EXISTS' } });
  });

  it('character-remove previews, then deletes with the confirm token', async () => {
    const added = await run(
      'character-add',
      { name: 'Kol', class: 'shaman', spec: 'elemental' },
      asAeryn,
    );
    const { id } = added.data as Character;

    const { preview, result } = await previewAndConfirm(
      registry,
      { name: 'character-remove', input: { characterId: id }, caller: asAeryn },
      deps,
    );
    expect(preview).toMatchObject({
      success: true,
      data: { preview: { willRemove: { name: 'Kol' } } },
    });
    expect(result).toMatchObject({ success: true, data: { removed: { id } } });
    expect(deps.identity.characters.has(id)).toBe(false);
  });

  it("members can't edit other members' characters; officers can", async () => {
    const added = await run(
      'character-add',
      { name: 'Kol', class: 'shaman', spec: 'elemental' },
      asAeryn,
    );
    const { id } = added.data as Character;
    const other = makeCaller('raider', { memberId: 'someone-else' });
    const officer = makeCaller('officer', { memberId: 'an-officer' });

    const denied = await run('character-update', { characterId: id, spec: 'restoration' }, other);
    expect(denied).toMatchObject({ success: false, error: { code: 'CHARACTER_NOT_FOUND' } });

    const allowed = await run(
      'character-update',
      { characterId: id, spec: 'restoration' },
      officer,
    );
    expect(allowed).toMatchObject({ success: true, data: { spec: 'restoration', role: 'healer' } });
  });

  it('member-me returns the profile with characters; public callers get nothing', async () => {
    await run('character-add', { name: 'Aeryn', class: 'druid', spec: 'balance' }, asAeryn);
    const me = await run('member-me', {}, asAeryn);
    expect(me).toMatchObject({
      success: true,
      data: { member: { displayName: 'Aeryn' }, characters: [{ name: 'Aeryn', role: 'ranged' }] },
    });
    const anon = await run('member-me', {}, makeCaller('public'));
    expect(anon).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });
  });

  it('member-list is for recruits and up, shows rank and main, and hides friends', async () => {
    await run('character-add', { name: 'Aeryn', class: 'druid', spec: 'balance' }, asAeryn);
    await run(
      'member-sync',
      { discordId: 'd-pal', displayName: 'Pal', inServer: true, roleIds: ['role-friend'] },
      system,
    );
    await run(
      'member-sync',
      { discordId: 'd-flex', displayName: 'Bangarang', inServer: true, roleIds: ['role-flex'] },
      system,
    );

    const list = await run('member-list', {}, asAeryn);
    expect(list).toMatchObject({
      success: true,
      data: [
        { displayName: 'Aeryn', rank: 'raider', main: { name: 'Aeryn' } },
        { displayName: 'Bangarang', rank: 'flex-raider', main: null },
      ],
    });
    expect((list.data as { displayName: string }[]).map((m) => m.displayName)).not.toContain('Pal');

    const flexOnly = await run('member-list', { rank: 'flex-raider' }, asAeryn);
    expect(flexOnly).toMatchObject({ data: [{ displayName: 'Bangarang' }] });

    const member = await run('member-list', {}, makeCaller('member'));
    expect(member).toMatchObject({ success: false });
  });

  it('member-prefs-set only accepts your own character as default', async () => {
    const added = await run(
      'character-add',
      { name: 'Aeryn', class: 'druid', spec: 'balance' },
      asAeryn,
    );
    const ok = await run(
      'member-prefs-set',
      { dmOptOut: true, defaultCharacterId: (added.data as Character).id },
      asAeryn,
    );
    expect(ok).toMatchObject({ success: true, data: { dmOptOut: true } });

    const bad = await run('member-prefs-set', { defaultCharacterId: 'character_999' }, asAeryn);
    expect(bad).toMatchObject({ success: false, error: { code: 'CHARACTER_NOT_FOUND' } });
  });

  it('every command scopes to the caller guild', async () => {
    await run('character-add', { name: 'Aeryn', class: 'druid', spec: 'balance' }, asAeryn);
    const otherGuild = makeCaller('officer', { guildId: 'another-guild', memberId: 'x' });
    const list = await run('character-list', { allGuild: true }, otherGuild);
    expect(list).toMatchObject({ success: true, data: [] });
    expect(TEST_GUILD_ID).not.toBe('another-guild');
  });
});

describe('when a member got their rank', () => {
  const HOUR = 3_600_000;
  const system = makeCaller('officer', { surface: 'system', memberId: undefined });
  const sync = (
    registry: ReturnType<typeof testRegistry<IdentityDeps>>,
    deps: IdentityDeps,
    roleIds: string[],
  ) =>
    registry.execute(
      {
        name: 'member-sync',
        input: { discordId: 'd-wren', displayName: 'Wren', inServer: true, roleIds },
        caller: system,
      },
      deps,
    );
  const memberOf = (result: { data?: unknown }) => (result.data as { member: Member }).member;

  it('counts from the first sync, keeps the date while the rank holds, and moves it on a change', async () => {
    const clock = fixedClock();
    const registry = testRegistry<IdentityDeps>([...identityCommands], clock);
    const deps = createMemoryIdentityDeps({ ...ROLE_MAP });
    const joined = clock.now();

    expect(memberOf(await sync(registry, deps, ['role-recruit'])).rankSince).toBe(joined);
    clock.advance(HOUR);
    const later = memberOf(await sync(registry, deps, ['role-recruit']));
    expect(later).toMatchObject({ rankSince: joined, syncedAt: joined + HOUR });

    clock.advance(HOUR);
    const raider = memberOf(await sync(registry, deps, ['role-raider']));
    expect(raider).toMatchObject({ rank: 'raider', rankSince: joined + 2 * HOUR });

    const list = await registry.execute(
      { name: 'member-list', input: {}, caller: makeCaller('leader') },
      deps,
    );
    expect(list).toMatchObject({
      data: [{ displayName: 'Wren', rankSince: joined + 2 * HOUR, syncedAt: joined + 2 * HOUR }],
    });
  });

  it('leaves a member recorded before the date existed at null until their rank changes', async () => {
    const clock = fixedClock();
    const registry = testRegistry<IdentityDeps>([...identityCommands], clock);
    const deps = createMemoryIdentityDeps({ ...ROLE_MAP });
    await deps.identity.upsertMember({
      guildId: TEST_GUILD_ID,
      discordId: 'd-wren',
      displayName: 'Wren',
      roleIds: ['role-recruit'],
      rank: 'recruit',
      tier: 'recruit',
      syncedAt: clock.now() - HOUR,
      rankSince: null,
    });

    expect(memberOf(await sync(registry, deps, ['role-recruit'])).rankSince).toBeNull();
    clock.advance(HOUR);
    expect(memberOf(await sync(registry, deps, ['role-raider'])).rankSince).toBe(clock.now());
  });
});
