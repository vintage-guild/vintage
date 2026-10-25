import { makeCaller, previewAndConfirm, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type DirectoryMember,
  type GuildDirectory,
  identityCommands,
  planRoleSync,
  readDirectory,
} from '../src/commands';
import { diffRoleRankMap } from '../src/commands/guild-roles';
import type { Member } from '../src/contract';
import type { IdentityDeps } from '../src/store';
import { createMemoryIdentityDeps } from '../src/testing';

const OFFICER = '100000000000000001';
const RAIDER = '100000000000000002';
const FLEX = '100000000000000003';
const MEMBER = '100000000000000004';

const dm = (discordId: string, displayName: string, roleIds: string[] = []): DirectoryMember => ({
  discordId,
  displayName,
  roleIds,
});

describe('planRoleSync', () => {
  it('syncs new members from the directory as in the server with their roles', () => {
    expect(planRoleSync([dm('d1', 'Aeryn', [RAIDER])], [])).toEqual([
      { discordId: 'd1', displayName: 'Aeryn', inServer: true, roleIds: [RAIDER] },
    ]);
  });

  it('still syncs unchanged members so syncedAt reflects the last check', () => {
    const plan = planRoleSync(
      [dm('d1', 'Aeryn', [RAIDER])],
      [{ discordId: 'd1', displayName: 'Aeryn' }],
    );
    expect(plan).toEqual([
      { discordId: 'd1', displayName: 'Aeryn', inServer: true, roleIds: [RAIDER] },
    ]);
  });

  it('carries role and name changes through as the new values', () => {
    const plan = planRoleSync(
      [dm('d1', 'Aeryn the Bold', [OFFICER])],
      [{ discordId: 'd1', displayName: 'Aeryn' }],
    );
    expect(plan).toEqual([
      { discordId: 'd1', displayName: 'Aeryn the Bold', inServer: true, roleIds: [OFFICER] },
    ]);
  });

  it('marks known members missing from the directory as gone, with no roles', () => {
    const plan = planRoleSync(
      [dm('d1', 'Aeryn', [RAIDER])],
      [
        { discordId: 'd1', displayName: 'Aeryn' },
        { discordId: 'd2', displayName: 'Kol' },
      ],
    );
    expect(plan).toEqual([
      { discordId: 'd1', displayName: 'Aeryn', inServer: true, roleIds: [RAIDER] },
      { discordId: 'd2', displayName: 'Kol', inServer: false, roleIds: [] },
    ]);
  });

  it('marks everyone gone when the directory is empty (callers guard against that)', () => {
    const plan = planRoleSync([], [{ discordId: 'd1', displayName: 'Aeryn' }]);
    expect(plan).toEqual([{ discordId: 'd1', displayName: 'Aeryn', inServer: false, roleIds: [] }]);
  });

  it('collapses duplicate directory entries to the last one and de-duplicates roles', () => {
    const plan = planRoleSync(
      [dm('d1', 'Aeryn', [MEMBER]), dm('d2', 'Kol'), dm('d1', 'Aeryn', [RAIDER, RAIDER, FLEX])],
      [],
    );
    expect(plan).toEqual([
      { discordId: 'd1', displayName: 'Aeryn', inServer: true, roleIds: [RAIDER, FLEX] },
      { discordId: 'd2', displayName: 'Kol', inServer: true, roleIds: [] },
    ]);
  });

  it('plans each departed member once even if known twice', () => {
    const plan = planRoleSync(
      [],
      [
        { discordId: 'd2', displayName: 'Kol' },
        { discordId: 'd2', displayName: 'Kol' },
      ],
    );
    expect(plan).toHaveLength(1);
  });

  it('falls back to the known name, then the Discord id, for a blank display name', () => {
    const plan = planRoleSync(
      [dm('d1', '  '), dm('d3', '')],
      [{ discordId: 'd1', displayName: 'Aeryn' }],
    );
    expect(plan.map((p) => p.displayName)).toEqual(['Aeryn', 'd3']);
  });
});

describe('readDirectory', () => {
  const pages = (...list: DirectoryMember[][]): GuildDirectory & { cursors: (string | null)[] } => {
    const cursors: (string | null)[] = [];
    return {
      cursors,
      async page(cursor) {
        cursors.push(cursor);
        const index = cursor === null ? 0 : Number(cursor);
        return {
          members: list[index] ?? [],
          next: index + 1 < list.length ? String(index + 1) : null,
        };
      },
    };
  };

  it('pages until the directory says there is no next page', async () => {
    const directory = pages([dm('d1', 'A')], [dm('d2', 'B')], [dm('d3', 'C')]);
    const members = await readDirectory(directory);
    expect(members.map((m) => m.discordId)).toEqual(['d1', 'd2', 'd3']);
    expect(directory.cursors).toEqual([null, '1', '2']);
  });

  it('refuses a partial read when there are too many pages', async () => {
    const directory = pages([dm('d1', 'A')], [dm('d2', 'B')], [dm('d3', 'C')]);
    await expect(readDirectory(directory, { maxPages: 2 })).rejects.toThrow(/partial/);
  });

  it('stops on a cursor that does not advance', async () => {
    const stuck: GuildDirectory = {
      page: async () => ({ members: [dm('d1', 'A')], next: 'same' }),
    };
    await expect(readDirectory(stuck)).rejects.toThrow(/stuck/);
  });
});

describe('diffRoleRankMap', () => {
  it('lists added, changed, and removed roles and counts unchanged ones', () => {
    expect(
      diffRoleRankMap(
        { [OFFICER]: 'officer', [RAIDER]: 'raider', [MEMBER]: 'member' },
        { [OFFICER]: 'officer', [RAIDER]: 'flex-raider', [FLEX]: 'flex-raider' },
      ),
    ).toEqual({
      added: [{ discordRoleId: FLEX, rank: 'flex-raider' }],
      removed: [{ discordRoleId: MEMBER, rank: 'member' }],
      changed: [{ discordRoleId: RAIDER, from: 'raider', to: 'flex-raider' }],
      unchanged: 1,
    });
  });
});

describe('guild-roles commands', () => {
  const registry = testRegistry<IdentityDeps>([...identityCommands]);
  const officer = makeCaller('officer');
  const leader = makeCaller('leader');
  const raider = makeCaller('raider');
  const system = makeCaller('officer', { surface: 'system', memberId: undefined });
  let deps: ReturnType<typeof createMemoryIdentityDeps>;

  const run = (name: string, input: unknown, caller = officer) =>
    registry.execute({ name, input, caller }, deps);
  const setRoles = (roles: Record<string, string>, caller = officer) =>
    previewAndConfirm(registry, { name: 'guild-roles-set', input: { roles }, caller }, deps);

  beforeEach(() => {
    deps = createMemoryIdentityDeps({ [OFFICER]: 'officer', [RAIDER]: 'raider' });
  });

  it('guild-roles-get returns the map to leaders and up', async () => {
    expect(await run('guild-roles-get', {}, leader)).toMatchObject({
      success: true,
      data: { [OFFICER]: 'officer', [RAIDER]: 'raider' },
    });
    expect(await run('guild-roles-get', {}, raider)).toMatchObject({
      success: false,
      error: { code: 'COMMAND_NOT_FOUND' },
    });
  });

  it('guild-roles-get explains an empty map', async () => {
    deps = createMemoryIdentityDeps();
    const result = await run('guild-roles-get', {}, leader);
    expect(result).toMatchObject({ success: true, data: {} });
    expect(result.reasoning).toMatch(/guild-roles-set/);
  });

  it('guild-roles-set previews the diff without saving, then saves on confirm', async () => {
    const next = { [OFFICER]: 'officer', [RAIDER]: 'flex-raider', [MEMBER]: 'member' };
    const preview = await run('guild-roles-set', { roles: next });
    expect(preview).toMatchObject({
      success: true,
      data: {
        preview: {
          diff: {
            added: [{ discordRoleId: MEMBER, rank: 'member' }],
            changed: [{ discordRoleId: RAIDER, from: 'raider', to: 'flex-raider' }],
            removed: [],
            unchanged: 1,
          },
        },
        confirmToken: expect.any(String),
      },
    });
    expect(await deps.identity.getRoleRankMap(TEST_GUILD_ID)).toEqual({
      [OFFICER]: 'officer',
      [RAIDER]: 'raider',
    });

    const { result } = await setRoles(next);
    expect(result).toMatchObject({ success: true, data: { roles: next } });
    expect(await deps.identity.getRoleRankMap(TEST_GUILD_ID)).toEqual(next);
  });

  it('guild-roles-set replaces the whole map: roles left out lose their rank', async () => {
    await setRoles({ [OFFICER]: 'officer' });
    expect(await deps.identity.getRoleRankMap(TEST_GUILD_ID)).toEqual({ [OFFICER]: 'officer' });
  });

  it('guild-roles-set requires the confirm token', async () => {
    const result = await registry.execute(
      {
        name: 'guild-roles-set',
        input: { roles: { [OFFICER]: 'officer' } },
        caller: officer,
        confirmToken: 'forged',
      },
      deps,
    );
    expect(result).toMatchObject({ success: false, error: { code: 'CONFIRMATION_INVALID' } });
  });

  it('guild-roles-set rejects unknown ranks and non-snowflake role ids', async () => {
    const badRank = await run('guild-roles-set', {
      roles: { [OFFICER]: 'officer', [RAIDER]: 'gm' },
    });
    expect(badRank).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    const badId = await run('guild-roles-set', {
      roles: { [OFFICER]: 'officer', '@Raider': 'raider' },
    });
    expect(badId).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('guild-roles-set refuses a map without an officer role', async () => {
    const result = await run('guild-roles-set', { roles: { [RAIDER]: 'raider' } });
    expect(result).toMatchObject({ success: false, error: { code: 'OFFICER_ROLE_REQUIRED' } });
    const empty = await run('guild-roles-set', { roles: {} });
    expect(empty).toMatchObject({ success: false, error: { code: 'OFFICER_ROLE_REQUIRED' } });
  });

  it('guild-roles-set is officer-only', async () => {
    const result = await run('guild-roles-set', { roles: { [OFFICER]: 'officer' } }, leader);
    expect(result).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });
  });

  it('guild-roles-set only touches the caller guild', async () => {
    const elsewhere = makeCaller('officer', { guildId: 'another-guild' });
    await setRoles({ [MEMBER]: 'officer' }, elsewhere);
    expect(await deps.identity.getRoleRankMap('another-guild')).toEqual({ [MEMBER]: 'officer' });
    expect(await deps.identity.getRoleRankMap(TEST_GUILD_ID)).toEqual({
      [OFFICER]: 'officer',
      [RAIDER]: 'raider',
    });
  });

  it('member-sync uses the new map once it is saved', async () => {
    const sync = () =>
      run(
        'member-sync',
        { discordId: 'd1', displayName: 'Aeryn', inServer: true, roleIds: [MEMBER] },
        system,
      );
    expect(await sync()).toMatchObject({ data: { member: { rank: null, tier: 'public' } } });
    await setRoles({ [OFFICER]: 'officer', [MEMBER]: 'member' });
    expect(await sync()).toMatchObject({ data: { member: { rank: 'member', tier: 'member' } } });
  });

  it('a planned sync makes departed members public and keeps present ones ranked', async () => {
    for (const [discordId, roleIds] of [
      ['d1', [RAIDER]],
      ['d2', [RAIDER]],
    ] as const) {
      await run(
        'member-sync',
        { discordId, displayName: discordId, inServer: true, roleIds },
        system,
      );
    }
    const known = await deps.identity.listMembers(TEST_GUILD_ID);
    for (const input of planRoleSync([dm('d1', 'd1', [RAIDER])], known)) {
      await run('member-sync', input, system);
    }
    const after = await deps.identity.listMembers(TEST_GUILD_ID);
    const byId = (id: string) => after.find((m) => m.discordId === id) as Member;
    expect(byId('d1')).toMatchObject({ rank: 'raider', tier: 'raider' });
    expect(byId('d2')).toMatchObject({ rank: null, tier: 'public', roleIds: [] });
  });
});
