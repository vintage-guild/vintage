import { describe, expect, it } from 'vitest';
import {
  createMethodRegistry,
  DEFAULT_MSOS_CONFIG,
  defaultLootMethods,
  type LootAwardRecord,
  type LootItem,
  type MethodContext,
  type MsosConfig,
  type MsosState,
  msosMethod,
  type RaidAttendee,
} from './index';

const ATTENDEES: RaidAttendee[] = [
  {
    characterId: 'c_aeryn',
    characterName: 'Aeryn',
    memberId: 'm_aeryn',
    class: 'warrior',
    spec: 'protection',
    role: 'tank',
    alsoRoles: ['melee'],
    rank: 'raider',
  },
  {
    characterId: 'c_bram',
    characterName: 'Bramble',
    memberId: 'm_bram',
    class: 'priest',
    spec: 'holy',
    role: 'healer',
    alsoRoles: ['ranged'],
    rank: 'raider',
  },
  {
    characterId: 'c_moonglade',
    characterName: 'Moonglade',
    memberId: 'm_moon',
    class: 'druid',
    spec: 'feral-dps',
    role: 'melee',
    alsoRoles: ['healer', 'tank'],
    rank: 'raider',
  },
  {
    characterId: 'c_cade',
    characterName: 'Cadence',
    memberId: 'm_cade',
    class: 'mage',
    spec: 'frost',
    role: 'ranged',
    alsoRoles: [],
    rank: 'raider',
  },
];

const HEALER_RING: LootItem = {
  itemId: 19140,
  itemName: 'Cauterizing Band',
  roles: ['healer'],
};

const PLATE_HELM: LootItem = {
  itemId: 16963,
  itemName: 'Helm of Wrath',
  roles: ['tank'],
  classes: ['warrior'],
};

const makeCtx = (
  config: Partial<MsosConfig> = {},
  state: MsosState = msosMethod.initialState(DEFAULT_MSOS_CONFIG),
  recentAwards: LootAwardRecord[] = [],
): MethodContext<MsosConfig, MsosState> => ({
  config: { ...DEFAULT_MSOS_CONFIG, ...config },
  state,
  raid: {
    eventId: 'raid_1',
    attendees: ATTENDEES,
    recentAwards,
    now: 1_700_000_000_000,
  },
});

const award = (
  characterId: string,
  characterName: string,
  intent: LootAwardRecord['intent'] = 'mainspec',
): LootAwardRecord => ({
  id: `aw_${characterId}`,
  eventId: 'raid_1',
  itemId: HEALER_RING.itemId,
  itemName: HEALER_RING.itemName,
  characterId,
  characterName,
  memberId: null,
  intent,
  methodId: 'msos',
  methodVersion: 1,
  configVersion: 1,
  roll: null,
  note: null,
  awardedAt: 1_700_000_000_000,
  awardedBy: 'officer_1',
});

describe('msosMethod (Mainspec over Offspec)', () => {
  it('ranks mainspec ahead of offspec and marks ineligible classes last', () => {
    const ringCandidates = msosMethod.candidates(HEALER_RING, makeCtx());
    expect(ringCandidates[0]).toMatchObject({
      characterName: 'Bramble',
      tier: 'mainspec',
      reason: 'Mainspec (healer)',
    });
    expect(ringCandidates.slice(1).every((c) => c.tier === 'offspec')).toBe(true);
    expect(ringCandidates.find((c) => c.characterName === 'Moonglade')?.reason).toBe(
      'Offspec (declared off-role)',
    );

    const plateCandidates = msosMethod.candidates(PLATE_HELM, makeCtx());
    expect(plateCandidates[0]).toMatchObject({
      characterName: 'Aeryn',
      tier: 'mainspec',
    });
    expect(plateCandidates.slice(1).every((c) => c.tier === 'ineligible')).toBe(true);
  });

  it('supports MS+1 tiebreaking and per-raid mainspec win caps without mutating state', () => {
    const twoHealers: RaidAttendee[] = [
      ATTENDEES[1]!,
      {
        characterId: 'c_ana',
        characterName: 'Anarra',
        memberId: 'm_ana',
        class: 'paladin',
        spec: 'holy',
        role: 'healer',
        alsoRoles: [],
        rank: 'officer',
      },
    ];
    const baseCtx: MethodContext<MsosConfig, MsosState> = {
      config: { ...DEFAULT_MSOS_CONFIG, plusOne: true, maxMainspecPerRaid: 1 },
      state: msosMethod.initialState(DEFAULT_MSOS_CONFIG),
      raid: { eventId: 'raid_1', attendees: twoHealers, recentAwards: [], now: 1 },
    };

    const nextState = msosMethod.apply(award('c_ana', 'Anarra', 'mainspec'), baseCtx);
    // Original state must not be mutated.
    expect(baseCtx.state.winsByEvent).toEqual({});
    expect(nextState.winsByEvent.raid_1?.c_ana).toEqual({ mainspec: 1, offspec: 0 });

    // Anarra hit the 1 MS cap, so Bramble is now the sole mainspec candidate and Anarra drops to offspec.
    const ranked = msosMethod.candidates(HEALER_RING, { ...baseCtx, state: nextState });
    expect(ranked.map((c) => [c.characterName, c.tier])).toEqual([
      ['Bramble', 'mainspec'],
      ['Anarra', 'offspec'],
    ]);
    expect(ranked[1]?.reason).toContain('Reached 1 MS cap');

    // validateAward rejects a second mainspec award to Anarra under the cap.
    expect(
      msosMethod.validateAward(
        {
          eventId: 'raid_1',
          item: HEALER_RING,
          characterId: 'c_ana',
          characterName: 'Anarra',
          memberId: 'm_ana',
          intent: 'mainspec',
        },
        { ...baseCtx, state: nextState },
      ),
    ).toMatchObject({ ok: false, code: 'MS_CAP_REACHED' });

    // Standings report each attendee's MS/OS tally, fewest MS wins first.
    expect(msosMethod.standings!({ ...baseCtx, state: nextState })).toEqual([
      {
        characterId: 'c_bram',
        characterName: 'Bramble',
        memberId: 'm_bram',
        label: '0 MS, 0 OS',
        value: 0,
      },
      {
        characterId: 'c_ana',
        characterName: 'Anarra',
        memberId: 'm_ana',
        label: '1 MS, 0 OS',
        value: 1,
      },
    ]);
  });

  it('validates attendee presence, class eligibility, and disabled offspec', () => {
    const ctx = makeCtx({ allowOffspec: false });
    expect(
      msosMethod.validateAward(
        {
          eventId: 'raid_1',
          item: HEALER_RING,
          characterId: 'c_ghost',
          characterName: 'Ghost',
          memberId: null,
          intent: 'mainspec',
        },
        ctx,
      ),
    ).toMatchObject({ ok: false, code: 'NOT_IN_RAID' });

    expect(
      msosMethod.validateAward(
        {
          eventId: 'raid_1',
          item: HEALER_RING,
          characterId: 'c_cade',
          characterName: 'Cadence',
          memberId: 'm_cade',
          intent: 'offspec',
        },
        ctx,
      ),
    ).toMatchObject({ ok: false, code: 'OFFSPEC_DISABLED' });

    expect(
      msosMethod.validateAward(
        {
          eventId: 'raid_1',
          item: PLATE_HELM,
          characterId: 'c_cade',
          characterName: 'Cadence',
          memberId: 'm_cade',
          intent: 'mainspec',
        },
        makeCtx(),
      ),
    ).toMatchObject({ ok: false, code: 'CLASS_INELIGIBLE' });
  });
});

describe('createMethodRegistry', () => {
  it('registers default MS/OS method and rejects duplicate ids', () => {
    expect(defaultLootMethods.has('msos')).toBe(true);
    expect(defaultLootMethods.list().map((m) => m.id)).toEqual(['msos']);
    expect(() => createMethodRegistry([msosMethod, msosMethod])).toThrow(/duplicate loot method/);
  });
});
