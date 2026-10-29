import { makeCaller, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { lootCommands } from '../src/commands';
import type { LootDropInput } from '../src/contract';
import type { LootDeps } from '../src/store';
import { createMemoryLootDeps } from '../src/testing';

const drop = (itemId: number, at: number): LootDropInput => ({
  itemId,
  itemName: null,
  count: 1,
  looter: 'Bramble',
  characterId: 'bram',
  memberId: 'bram',
  at,
  source: null,
  lootMethodId: null,
  recordedAt: 0,
});

describe('loot-list', () => {
  const registry = testRegistry<LootDeps>([...lootCommands]);
  const list = (deps: LootDeps, eventId: string, tier: 'member' | 'public' = 'member') =>
    registry.execute({ name: 'loot-list', input: { eventId }, caller: makeCaller(tier) }, deps);

  it('lists a raid’s drops in the order they were looted, and only that raid’s', async () => {
    const deps = createMemoryLootDeps();
    await deps.loot.replaceDrops(TEST_GUILD_ID, 'raid_1', [drop(2, 200), drop(1, 100)]);
    await deps.loot.replaceDrops(TEST_GUILD_ID, 'raid_2', [drop(3, 50)]);
    await deps.loot.replaceDrops('other-guild', 'raid_1', [drop(4, 10)]);

    const result = await list(deps, 'raid_1');
    expect(result).toMatchObject({ success: true, reasoning: '2 drops recorded' });
    const { drops } = result.data as { drops: { itemId: number; guildId: string }[] };
    expect(drops.map((d) => d.itemId)).toEqual([1, 2]);
    expect(drops.every((d) => d.guildId === TEST_GUILD_ID)).toBe(true);
  });

  it('replacing a raid’s drops leaves none of the old ones', async () => {
    const deps = createMemoryLootDeps();
    await deps.loot.replaceDrops(TEST_GUILD_ID, 'raid_1', [drop(1, 100), drop(2, 200)]);
    await deps.loot.replaceDrops(TEST_GUILD_ID, 'raid_1', [drop(5, 300)]);
    const result = await list(deps, 'raid_1');
    expect((result.data as { drops: { itemId: number }[] }).drops.map((d) => d.itemId)).toEqual([
      5,
    ]);
  });

  it('says when nothing is recorded, and is hidden from public callers', async () => {
    const deps = createMemoryLootDeps();
    expect(await list(deps, 'raid_1')).toMatchObject({
      success: true,
      data: { drops: [] },
      reasoning: 'No loot recorded for this raid',
    });
    expect(await list(deps, 'raid_1', 'public')).toMatchObject({
      success: false,
      error: { code: 'COMMAND_NOT_FOUND' },
    });
  });
});
