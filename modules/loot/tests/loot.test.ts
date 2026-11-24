import {
  createMethodRegistry,
  DEFAULT_LOOT_METHODS,
  type LootMethod,
  type MsosState,
} from '@vintage/loot-core';
import { fixedClock, makeCaller, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { lootCommands } from '../src/commands';
import type { LootAward, LootDropInput, RaidAttendee, RankedCandidate } from '../src/contract';
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

const ATTENDEES: RaidAttendee[] = [
  {
    characterId: 'c_tank',
    characterName: 'Thane',
    memberId: 'm_tank',
    class: 'warrior',
    spec: 'Protection',
    role: 'tank',
    alsoRoles: ['melee'],
    rank: 'raider',
  },
  {
    characterId: 'c_melee',
    characterName: 'Bramble',
    memberId: 'm_melee',
    class: 'rogue',
    spec: 'Combat',
    role: 'melee',
    alsoRoles: [],
    rank: 'raider',
  },
  {
    characterId: 'c_heal',
    characterName: 'Mina',
    memberId: 'm_heal',
    class: 'priest',
    spec: 'Holy',
    role: 'healer',
    alsoRoles: ['ranged'],
    rank: 'recruit',
  },
];

function seedRaid(
  deps: ReturnType<typeof createMemoryLootDeps>,
  overrides: { eventId?: string; lootMethodId?: string | null } = {},
) {
  deps.lootRaids.putRaid(TEST_GUILD_ID, {
    eventId: overrides.eventId ?? 'raid_1',
    name: 'Wednesday Molten Core',
    lootMethodId: overrides.lootMethodId ?? null,
    attendees: ATTENDEES,
  });
}

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

describe('loot methods, candidates, awards, and history (#26)', () => {
  const clock = fixedClock(1_700_000_000_000);
  const registry = testRegistry<LootDeps>([...lootCommands], clock);

  const exec = (
    deps: LootDeps,
    name: string,
    input: unknown,
    tier: 'public' | 'member' | 'leader' | 'officer' = 'officer',
    confirmToken?: string,
  ) =>
    registry.execute(
      { name, input, caller: makeCaller(tier), ...(confirmToken ? { confirmToken } : {}) },
      deps,
    );

  async function confirmAward(deps: LootDeps, input: Record<string, unknown>) {
    const preview = await exec(deps, 'loot-award', input, 'officer');
    expect(preview.success).toBe(true);
    const { confirmToken } = preview.data as { confirmToken: string };
    expect(confirmToken).toBeTruthy();
    return exec(deps, 'loot-award', input, 'officer', confirmToken);
  }

  it('lists msos as the default method and lets officers configure it with version bumps', async () => {
    const deps = createMemoryLootDeps();

    const initial = await exec(deps, 'loot-methods-list', {}, 'member');
    expect(initial.success).toBe(true);
    const { methods } = initial.data as {
      defaultMethodId: string;
      methods: { id: string; isDefault: boolean; configured: boolean; configVersion: number }[];
    };
    expect(methods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'msos',
          isDefault: true,
          configured: false,
          configVersion: 0,
        }),
      ]),
    );

    // Leaders cannot configure loot methods (officer-only).
    expect(
      await exec(deps, 'loot-method-configure', { methodId: 'msos', config: {} }, 'leader'),
    ).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });

    // Invalid config is rejected by the method's Zod schema.
    expect(
      await exec(
        deps,
        'loot-method-configure',
        { methodId: 'msos', config: { maxMainspecPerRaid: 99 } },
        'officer',
      ),
    ).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });

    // Valid config saves as v1, and a second update bumps to v2.
    const v1 = await exec(
      deps,
      'loot-method-configure',
      { methodId: 'msos', config: { maxMainspecPerRaid: 1, plusOne: true } },
      'officer',
    );
    expect(v1).toMatchObject({
      success: true,
      data: { method: { methodId: 'msos', configVersion: 1 } },
    });

    const v2 = await exec(
      deps,
      'loot-method-configure',
      { methodId: 'msos', config: { maxMainspecPerRaid: 2, plusOne: true } },
      'officer',
    );
    expect(v2).toMatchObject({
      success: true,
      data: { method: { methodId: 'msos', configVersion: 2 } },
    });
  });

  it('ranks candidates under msos (defaulting when the raid has no lootMethodId)', async () => {
    const deps = createMemoryLootDeps();
    seedRaid(deps);

    const res = await exec(
      deps,
      'loot-candidates',
      {
        eventId: 'raid_1',
        itemId: 18832,
        itemName: 'Brutality Blade',
        roles: ['melee'],
        classes: ['warrior', 'rogue'],
      },
      'leader',
    );
    expect(res.success).toBe(true);
    const data = res.data as {
      methodId: string;
      methodVersion: number;
      configVersion: number;
      candidates: RankedCandidate[];
    };
    expect(data.methodId).toBe('msos');
    expect(data.methodVersion).toBe(1);
    expect(data.configVersion).toBe(0);
    // Bramble (melee MS) first, Thane (tank with melee OS) second, Mina (healer) ineligible.
    expect(data.candidates.map((c) => [c.characterName, c.tier])).toEqual([
      ['Bramble', 'mainspec'],
      ['Thane', 'offspec'],
      ['Mina', 'ineligible'],
    ]);
  });

  it('loot-award is officer-only, destructive (preview -> confirm), stamps versions, and updates state', async () => {
    const deps = createMemoryLootDeps();
    seedRaid(deps);
    await exec(
      deps,
      'loot-method-configure',
      { methodId: 'msos', config: { maxMainspecPerRaid: 1, plusOne: true } },
      'officer',
    );

    const awardInput = {
      eventId: 'raid_1',
      itemId: 18821,
      itemName: 'Quick Strike Ring',
      roles: ['melee'],
      characterId: 'c_melee',
      intent: 'mainspec',
      roll: 84,
    };

    // Leaders cannot run loot-award.
    expect(await exec(deps, 'loot-award', awardInput, 'leader')).toMatchObject({
      success: false,
      error: { code: 'COMMAND_NOT_FOUND' },
    });

    // Preview does not persist any award.
    const preview = await exec(deps, 'loot-award', awardInput, 'officer');
    expect(preview.success).toBe(true);
    expect(deps.loot.awards.size).toBe(0);
    expect(preview.data).toMatchObject({
      confirmToken: expect.any(String),
      preview: {
        willAward: {
          characterName: 'Bramble',
          methodId: 'msos',
          methodVersion: 1,
          configVersion: 1,
        },
        overridden: false,
      },
    });

    // Confirming persists the award with methodId, methodVersion, configVersion, and applies state.
    const { confirmToken } = preview.data as { confirmToken: string };
    const confirmed = await exec(deps, 'loot-award', awardInput, 'officer', confirmToken);
    expect(confirmed.success).toBe(true);
    const { award } = confirmed.data as { award: LootAward };
    expect(award).toMatchObject({
      eventId: 'raid_1',
      itemId: 18821,
      characterId: 'c_melee',
      characterName: 'Bramble',
      intent: 'mainspec',
      methodId: 'msos',
      methodVersion: 1,
      configVersion: 1,
      roll: 84,
    });

    const savedCfg = await deps.loot.getMethodConfig(TEST_GUILD_ID, 'msos');
    const state = savedCfg?.state as MsosState;
    expect(state.winsByEvent.raid_1?.c_melee).toMatchObject({ mainspec: 1, offspec: 0 });

    // A second MS award to Bramble in the same raid is blocked by maxMainspecPerRaid: 1.
    const blocked = await exec(
      deps,
      'loot-award',
      { ...awardInput, itemId: 19138, itemName: 'Band of Accuria' },
      'officer',
    );
    expect(blocked).toMatchObject({ success: false, error: { code: 'AWARD_NOT_ALLOWED' } });

    // Officer override without a note is refused; with a note, preview -> confirm succeeds.
    expect(
      await exec(deps, 'loot-award', { ...awardInput, itemId: 19138, override: true }, 'officer'),
    ).toMatchObject({ success: false, error: { code: 'OVERRIDE_NOTE_REQUIRED' } });

    const overridden = await confirmAward(deps, {
      ...awardInput,
      itemId: 19138,
      itemName: 'Band of Accuria',
      override: true,
      note: 'No other melee needed the ring',
    });
    expect(overridden).toMatchObject({
      success: true,
      data: { overridden: true, award: { itemId: 19138, note: 'No other melee needed the ring' } },
    });

    // loot-history filters by eventId and characterId, newest first, and is guild-scoped.
    const history = await exec(deps, 'loot-history', { characterId: 'c_melee' }, 'member');
    expect(history.success).toBe(true);
    const { awards } = history.data as { awards: LootAward[] };
    expect(awards.map((a) => a.itemId)).toEqual([19138, 18821]);
  });

  it('supports swapping in a second LootMethod selected per raid without changing host code', async () => {
    const flatMethod: LootMethod<{ note: string }, { total: number }> = {
      id: 'flat-test',
      name: 'Flat Test',
      description: 'Test method proving the host is method-agnostic.',
      version: 3,
      configSchema: z.object({ note: z.string().default('ok') }),
      defaultConfig: { note: 'ok' },
      initialState: () => ({ total: 0 }),
      candidates: (_item, ctx) =>
        ctx.raid.attendees.map((a) => ({
          characterId: a.characterId,
          characterName: a.characterName,
          memberId: a.memberId,
          tier: 'mainspec',
          priority: 1,
          reason: `Flat (${ctx.config.note})`,
          recentWins: 0,
        })),
      validateAward: () => ({ ok: true }),
      apply: (_award, ctx) => ({ total: ctx.state.total + 1 }),
    };

    const deps = createMemoryLootDeps({
      lootMethods: createMethodRegistry([...DEFAULT_LOOT_METHODS, flatMethod]),
    });
    seedRaid(deps, { eventId: 'raid_custom', lootMethodId: 'flat-test' });

    const ranked = await exec(
      deps,
      'loot-candidates',
      { eventId: 'raid_custom', itemId: 19019 },
      'leader',
    );
    expect(ranked).toMatchObject({
      success: true,
      data: { methodId: 'flat-test', methodVersion: 3 },
    });

    const awarded = await confirmAward(deps, {
      eventId: 'raid_custom',
      itemId: 19019,
      characterId: 'c_tank',
      intent: 'mainspec',
    });
    expect(awarded).toMatchObject({
      success: true,
      data: { award: { methodId: 'flat-test', methodVersion: 3, configVersion: 0 } },
    });
    const cfg = await deps.loot.getMethodConfig(TEST_GUILD_ID, 'flat-test');
    expect(cfg?.state).toEqual({ total: 1 });
  });
});
