import { makeCaller, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { identityCommands } from '../src/commands';
import type { Character, Member } from '../src/contract';
import type { IdentityDeps } from '../src/store';
import { createMemoryIdentityDeps } from '../src/testing';

const ROLE_MAP = {
  'role-officer': 'officer' as const,
  'role-flex': 'flex-raider' as const,
};

describe('other roles and developer admin access', () => {
  it('stores alsoRoles the class can play, without the main role, cleared on class change', async () => {
    const registry = testRegistry<IdentityDeps>([...identityCommands]);
    const deps = createMemoryIdentityDeps({ ...ROLE_MAP });
    const asMember = makeCaller('raider', { memberId: 'm1' });
    const run = (name: string, input: unknown) =>
      registry.execute({ name, input, caller: asMember }, deps);

    const added = await run('character-add', {
      name: 'Bram',
      class: 'warrior',
      spec: 'protection',
      alsoRoles: ['melee', 'tank', 'melee'],
    });
    expect(added).toMatchObject({ success: true, data: { role: 'tank', alsoRoles: ['melee'] } });
    const { id } = added.data as Character;

    const plain = await run('character-add', { name: 'Kel', class: 'mage', spec: 'frost' });
    expect(plain).toMatchObject({ success: true, data: { alsoRoles: [] } });

    const cantHeal = await run('character-update', { characterId: id, alsoRoles: ['healer'] });
    expect(cantHeal).toMatchObject({ success: false, error: { code: 'INVALID_ROLE' } });
    const mageTank = await run('character-add', {
      name: 'Nim',
      class: 'mage',
      spec: 'fire',
      alsoRoles: ['tank'],
    });
    expect(mageTank).toMatchObject({ success: false, error: { code: 'INVALID_ROLE' } });

    // A new main role leaves the list.
    const same = await run('character-update', { characterId: id, role: 'melee' });
    expect(same).toMatchObject({ success: true, data: { role: 'melee', alsoRoles: [] } });

    const flex = await run('character-update', { characterId: id, alsoRoles: ['tank'] });
    expect(flex).toMatchObject({ success: true, data: { role: 'melee', alsoRoles: ['tank'] } });

    const cleared = await run('character-update', { characterId: id, alsoRoles: [] });
    expect(cleared).toMatchObject({ success: true, data: { alsoRoles: [] } });

    await run('character-update', { characterId: id, alsoRoles: ['tank'] });
    const reclassed = await run('character-update', {
      characterId: id,
      class: 'mage',
      spec: 'frost',
    });
    expect(reclassed).toMatchObject({
      success: true,
      data: { role: 'ranged', alsoRoles: [] },
    });
  });

  it('grants officer tier via adminAccess while keeping the member’s real Discord guild rank', async () => {
    const registry = testRegistry<IdentityDeps>([...identityCommands]);
    const deps = createMemoryIdentityDeps({ ...ROLE_MAP });
    const system = makeCaller('officer', { surface: 'system', memberId: undefined });

    const synced = await registry.execute(
      {
        name: 'member-sync',
        input: {
          discordId: 'dev-1',
          displayName: 'Bloodfen',
          inServer: true,
          roleIds: ['role-flex'],
          adminAccess: true,
        },
        caller: system,
      },
      deps,
    );
    expect(synced.success).toBe(true);
    const { member } = synced.data as { member: Member };
    expect(member.rank).toBe('flex-raider');
    expect(member.tier).toBe('officer');

    // Leaving the server revokes officer tier even with adminAccess set.
    const left = await registry.execute(
      {
        name: 'member-sync',
        input: {
          discordId: 'dev-1',
          displayName: 'Bloodfen',
          inServer: false,
          roleIds: [],
          adminAccess: true,
        },
        caller: system,
      },
      deps,
    );
    const { member: departed } = left.data as { member: Member };
    expect(departed.rank).toBeNull();
    expect(departed.tier).toBe('public');
  });
});
