import type { Caller } from '@vintage/guild-kit';
import { makeCaller, previewAndConfirm, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { identityCommands } from '../src/commands';
import type { Character, Member } from '../src/contract';
import { resolveTier } from '../src/domain/tier';
import type { IdentityDeps } from '../src/store';
import { createMemoryIdentityDeps } from '../src/testing';

const ROLE_MAP = {
  'role-officer': 'officer',
  'role-raider': 'raider',
  'role-trial': 'trial',
} as const;

describe('resolveTier', () => {
  it('uses the highest mapped role, with member as the floor', () => {
    expect(resolveTier(true, ['role-trial', 'role-officer'], ROLE_MAP)).toBe('officer');
    expect(resolveTier(true, ['unmapped'], ROLE_MAP)).toBe('member');
    expect(resolveTier(true, [], ROLE_MAP)).toBe('member');
  });

  it('is public for someone not in the guild, whatever roles are cached', () => {
    expect(resolveTier(false, ['role-officer'], ROLE_MAP)).toBe('public');
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
      { discordId: 'd-aeryn', displayName: 'Aeryn', inGuild: true, roleIds: ['role-raider'] },
      system,
    );
    aeryn = (synced.data as { member: Member }).member;
    asAeryn = makeCaller(aeryn.tier, { memberId: aeryn.id, discordId: aeryn.discordId });
  });

  it('member-sync derives the tier from Discord roles and reports changes', async () => {
    expect(aeryn.tier).toBe('raider');
    const promoted = await run(
      'member-sync',
      { discordId: 'd-aeryn', displayName: 'Aeryn', inGuild: true, roleIds: ['role-officer'] },
      system,
    );
    expect(promoted).toMatchObject({
      success: true,
      data: { member: { id: aeryn.id, tier: 'officer' }, previousTier: 'raider' },
    });
  });

  it('member-sync is not available to raiders', async () => {
    const result = await run(
      'member-sync',
      { discordId: 'x', displayName: 'X', inGuild: true, roleIds: [] },
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

  it('member-list is for trials and up and shows each main', async () => {
    await run('character-add', { name: 'Aeryn', class: 'druid', spec: 'balance' }, asAeryn);
    const list = await run('member-list', {}, asAeryn);
    expect(list).toMatchObject({
      success: true,
      data: [{ displayName: 'Aeryn', main: { name: 'Aeryn' } }],
    });

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
