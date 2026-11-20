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

describe('secondary roles and developer admin access', () => {
  it('stores optional secondaryRole, clears duplicates of main role, and clears on class change', async () => {
    const registry = testRegistry<IdentityDeps>([...identityCommands]);
    const deps = createMemoryIdentityDeps({ ...ROLE_MAP });
    const asMember = makeCaller('raider', { memberId: 'm1' });
    const run = (name: string, input: unknown) =>
      registry.execute({ name, input, caller: asMember }, deps);

    const added = await run('character-add', {
      name: 'Bram',
      class: 'warrior',
      spec: 'protection',
      secondaryRole: 'melee',
    });
    expect(added).toMatchObject({ success: true, data: { role: 'tank', secondaryRole: 'melee' } });
    const { id } = added.data as Character;

    const same = await run('character-update', { characterId: id, role: 'melee' });
    expect(same).toMatchObject({ success: true, data: { role: 'melee', secondaryRole: null } });

    const flex = await run('character-update', { characterId: id, secondaryRole: 'tank' });
    expect(flex).toMatchObject({ success: true, data: { role: 'melee', secondaryRole: 'tank' } });

    const cleared = await run('character-update', { characterId: id, secondaryRole: null });
    expect(cleared).toMatchObject({ success: true, data: { secondaryRole: null } });

    await run('character-update', { characterId: id, secondaryRole: 'tank' });
    const reclassed = await run('character-update', {
      characterId: id,
      class: 'mage',
      spec: 'frost',
    });
    expect(reclassed).toMatchObject({
      success: true,
      data: { role: 'ranged', secondaryRole: null },
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
