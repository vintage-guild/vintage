import { encodeBridge, type RaidExport } from '@vintage/bridge-format';
import type { Caller } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import {
  fixedClock,
  makeCaller,
  previewAndConfirm,
  TEST_GUILD_ID,
  testRegistry,
} from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { raidsCommands } from '../src/commands';
import type { ExportCheck, RaidAttendance, RaidEvent, RaidRecord, Signup } from '../src/contract';
import { checkExport, expectedSignups } from '../src/domain/export-check';
import type { RaidsDeps } from '../src/store';
import { createMemoryRaidsDeps } from '../src/testing';

const G = TEST_GUILD_ID;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
/** Tue 27 Oct 2026, 00:00 UTC: the night nightExport() was taken (its first snapshot is 00:01). */
const RAID_START = Date.UTC(2026, 9, 27, 0);
const AT_START = RAID_START / 1000;

const member = (id: string): Member => ({
  id,
  guildId: G,
  discordId: `d-${id}`,
  displayName: id,
  roleIds: [],
  inServer: true,
  rank: 'raider',
  tier: 'raider',
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
});

const character = (
  id: string,
  name: string,
  cls: Character['class'],
  spec: string,
  role: Character['role'],
): Character => ({
  id,
  guildId: G,
  memberId: id,
  name,
  class: cls,
  spec,
  role,
  isMain: true,
});

const MEMBERS = ['aeryn', 'bram', 'cade', 'dara'].map(member);
const CHARACTERS = [
  character('aeryn', 'Aeryn', 'warrior', 'protection', 'tank'),
  character('bram', 'Bramble', 'priest', 'holy', 'healer'),
  character('cade', 'Cade', 'mage', 'frost', 'ranged'),
  character('dara', 'Dara', 'rogue', 'combat', 'melee'),
];

/** An export of one evening: Aeryn and Bramble in every snapshot, a pick-up for two. */
function nightExport(overrides: Partial<RaidExport> = {}): RaidExport {
  return {
    v: 1,
    kind: 'raid-export',
    exportedAt: 1_793_070_000,
    addonVersion: '0.1.0',
    exporter: 'Aeryn',
    attendance: [
      {
        at: 1_793_059_300,
        label: 'start',
        members: [
          { name: 'Aeryn', class: 'warrior', group: 1, online: true },
          { name: 'Bramble', class: 'priest', group: 1, online: true },
          { name: 'Doran-Stonemaul', class: 'rogue', group: 2, online: true },
        ],
      },
      {
        at: 1_793_062_900,
        label: 'Lucifron',
        members: [
          { name: 'Aeryn', class: 'warrior', group: 1, online: true },
          { name: 'Bramble', class: 'priest', group: 1, online: false },
          { name: 'Doran-Stonemaul', class: 'rogue', group: 2, online: true },
        ],
      },
      {
        at: 1_793_066_500,
        members: [
          { name: 'Aeryn', group: 1, online: true },
          { name: 'Bramble', group: 1, online: true },
        ],
      },
    ],
    loot: [
      { itemId: 16_800, looter: 'Bramble', at: 1_793_063_000, source: 'Lucifron' },
      { itemId: 17_011, looter: 'Doran-Stonemaul', at: 1_793_063_100, count: 2 },
    ],
    items: [{ itemId: 16_800, name: 'Arcanist Boots', quality: 4 }],
    ...overrides,
  };
}

const members = (...names: string[]) => names.map((name) => ({ name, group: 1, online: true }));

const encode = (payload: RaidExport) => {
  const encoded = encodeBridge(payload);
  if (!encoded.ok) throw new Error(encoded.error.message);
  return encoded.value;
};

describe('raid-export-check', () => {
  let clock: ReturnType<typeof fixedClock>;
  let registry: ReturnType<typeof testRegistry<RaidsDeps>>;
  let deps: ReturnType<typeof createMemoryRaidsDeps>;
  let raid: RaidEvent;
  const leader = makeCaller('leader', { memberId: 'leader-1' });
  const as = (memberId: string) => makeCaller('raider', { memberId });

  const run = (input: unknown, caller: Caller = leader) =>
    registry.execute({ name: 'raid-export-check', input, caller }, deps);
  const check = async (input: unknown): Promise<{ data: ExportCheck; reasoning?: string }> => {
    const result = await run(input);
    if (!result.success) throw new Error(JSON.stringify(result.error));
    return { data: result.data as ExportCheck, reasoning: result.reasoning };
  };
  const ok = async <T>(name: string, input: unknown, caller: Caller): Promise<T> => {
    const result = await registry.execute({ name, input, caller }, deps);
    if (!result.success) throw new Error(`${name} failed: ${JSON.stringify(result.error)}`);
    return result.data as T;
  };

  beforeEach(async () => {
    clock = fixedClock(RAID_START - 2 * DAY);
    registry = testRegistry<RaidsDeps>([...raidsCommands], clock);
    deps = createMemoryRaidsDeps(MEMBERS, CHARACTERS);
    raid = await ok<RaidEvent>(
      'raid-create',
      { name: 'Molten Core', instance: 'Molten Core', size: 10, startsAt: RAID_START },
      leader,
    );
    for (const [who, status] of [
      ['aeryn', 'accepted'],
      ['bram', 'accepted'],
      ['cade', 'accepted'],
      ['dara', 'declined'],
    ] as const) {
      await ok('signup-set', { eventId: raid.id, characterId: who, status }, as(who));
    }
  });

  it('is for raid leaders and officers', async () => {
    expect(await run({ exportString: encode(nightExport()) }, as('aeryn'))).toMatchObject({
      error: { code: 'COMMAND_NOT_FOUND' },
    });
  });

  it('refuses what is not an export, with the bridge format’s own codes and advice', async () => {
    expect(await run({ exportString: 'great raid everyone' })).toMatchObject({
      success: false,
      error: { code: 'NOT_A_BRIDGE_STRING', suggestion: expect.stringContaining('!VIN:') },
    });
    const importString = encodeBridge({
      v: 1,
      kind: 'raid-import',
      guildId: G,
      generatedAt: 1,
      raid: { eventId: raid.id, title: 'Molten Core', startsAt: 1 },
      roster: [],
      groups: [],
      loot: { methodId: 'unset', methodVersion: 1, configVersion: 0, mode: 'group' },
      candidates: [],
    });
    expect(importString.ok).toBe(true);
    expect(await run({ exportString: importString.ok ? importString.value : '' })).toMatchObject({
      error: {
        code: 'WRONG_KIND',
        suggestion: expect.stringContaining('export string into the website'),
      },
    });
  });

  it('matches the export to the raid the leader picks', async () => {
    const { data, reasoning } = await check({
      exportString: encode(nightExport()),
      eventId: raid.id,
    });
    expect(data.event).toMatchObject({ id: raid.id, name: 'Molten Core', status: 'open' });
    expect(data.eventSource).toBe('input');
    expect(data.snapshots).toEqual([
      { at: 1_793_059_300, label: 'start', present: 3, online: 3 },
      { at: 1_793_062_900, label: 'Lucifron', present: 3, online: 2 },
      { at: 1_793_066_500, label: null, present: 2, online: 2 },
    ]);
    const seen = (name: string, cls: string, snapshots: number, id: string | null) => ({
      name,
      class: cls,
      snapshots,
      characterId: id,
      memberId: id,
      status: id ? 'accepted' : null,
      matchedWithoutRealm: false,
    });
    expect(data.attendees).toEqual([
      seen('Aeryn', 'warrior', 3, 'aeryn'),
      seen('Bramble', 'priest', 3, 'bram'),
      seen('Doran-Stonemaul', 'rogue', 2, null),
    ]);
    expect(data.loot).toEqual([
      {
        itemId: 16_800,
        itemName: 'Arcanist Boots',
        looter: 'Bramble',
        characterId: 'bram',
        at: 1_793_063_000,
        count: 1,
        source: 'Lucifron',
      },
      {
        itemId: 17_011,
        itemName: null,
        looter: 'Doran-Stonemaul',
        characterId: null,
        at: 1_793_063_100,
        count: 2,
        source: null,
      },
    ]);
    expect(data.unknownNames).toEqual(['Doran-Stonemaul']);
    // Cade said yes and never showed; Dara declined, so she isn't missed.
    expect(data.absent).toEqual([
      { characterId: 'cade', characterName: 'Cade', status: 'accepted' },
    ]);
    expect(data.otherGuild).toBe(false);
    expect(data.declinedButSeen).toEqual([]);
    expect(data.warnings).toEqual([]);
    expect(reasoning).toBe(
      'Molten Core: 3 people over 3 snapshots, 2 drops; 1 not signed up, 1 expected but not seen',
    );
  });

  it('uses the raid the export names when the addon imported it in this guild', async () => {
    const { data } = await check({
      exportString: encode(nightExport({ guildId: G, eventId: raid.id })),
    });
    expect(data.event?.id).toBe(raid.id);
    expect(data.eventSource).toBe('export');
  });

  it('ignores a raid id from another guild and says so', async () => {
    const { data, reasoning } = await check({
      exportString: encode(nightExport({ guildId: 'g_other', eventId: raid.id })),
    });
    expect(data).toMatchObject({ event: null, eventSource: null, otherGuild: true, absent: [] });
    expect(data.warnings.map((w) => w.code)).toEqual(['OTHER_GUILD']);
    expect(data.unknownNames).toEqual([]);
    expect(reasoning).toMatch(/^No raid matched: 3 people/);
  });

  it('refuses a raid the leader names that does not exist', async () => {
    expect(await run({ exportString: encode(nightExport()), eventId: 'evt_nope' })).toMatchObject({
      error: { code: 'RAID_NOT_FOUND' },
    });
  });

  it('matches names in another case, and with a realm only when nobody else could be meant', async () => {
    const payload = nightExport({
      attendance: [{ at: AT_START, members: members('Aeryn-Stonemaul', 'bramble') }],
      loot: [],
    });
    const { data } = await check({ exportString: encode(payload), eventId: raid.id });
    expect(data.attendees.map((a) => [a.characterId, a.matchedWithoutRealm])).toEqual([
      ['aeryn', true],
      ['bram', false],
    ]);
  });

  it('does not lend a signup to a stranger from another realm', async () => {
    // The guild's Aeryn is there too, so Aeryn-Stonemaul is someone else.
    const both = nightExport({
      attendance: [{ at: AT_START, members: members('Aeryn', 'Aeryn-Stonemaul') }],
      loot: [{ itemId: 16_800, looter: 'Aeryn-Stonemaul', at: AT_START }],
    });
    const withPlain = (await check({ exportString: encode(both), eventId: raid.id })).data;
    expect(withPlain.attendees.map((a) => a.characterId)).toEqual(['aeryn', null]);
    expect(withPlain.loot[0]?.characterId).toBeNull();
    expect(withPlain.unknownNames).toEqual(['Aeryn-Stonemaul']);
    // Two Aeryns from two other realms: neither is ours for sure.
    const twoRealms = nightExport({
      attendance: [{ at: AT_START, members: members('Aeryn-Stonemaul', 'Aeryn-Bloodfen') }],
      loot: [],
    });
    const either = (await check({ exportString: encode(twoRealms), eventId: raid.id })).data;
    expect(either.attendees.map((a) => a.characterId)).toEqual([null, null]);
  });

  it('lists someone who declined but came, and does not miss them', async () => {
    const payload = nightExport({
      attendance: [{ at: AT_START, members: members('Aeryn', 'Bramble', 'Cade', 'Dara') }],
      loot: [],
    });
    const { data, reasoning } = await check({ exportString: encode(payload), eventId: raid.id });
    expect(data.declinedButSeen).toEqual(['Dara']);
    expect(data.unknownNames).toEqual([]);
    expect(data.absent).toEqual([]);
    expect(reasoning).toContain('1 declined but came');
  });

  it('does not count a benched signup as missing', async () => {
    const signups = await ok<Signup[]>('signup-list', { eventId: raid.id }, leader);
    const cade = signups.find((s) => s.characterId === 'cade');
    await ok('roster-bench', { signupId: cade?.id }, leader);
    const { data } = await check({ exportString: encode(nightExport()), eventId: raid.id });
    expect(data.absent).toEqual([]);
  });

  it('warns when the picked raid is not the one the addon made the export for', async () => {
    const { data, reasoning } = await check({
      exportString: encode(nightExport({ guildId: G, eventId: 'evt_other' })),
      eventId: raid.id,
    });
    expect(data.warnings).toEqual([
      {
        code: 'OTHER_RAID',
        message: 'The addon made this export for a different raid than Molten Core.',
      },
    ]);
    expect(reasoning).toMatch(/1 warning$/);
  });

  it('warns when no snapshot is near the raid’s start', async () => {
    const later = await ok<RaidEvent>(
      'raid-create',
      { name: 'Onyxia', instance: 'Onyxia’s Lair', size: 40, startsAt: RAID_START + 2 * DAY },
      leader,
    );
    const { data } = await check({ exportString: encode(nightExport()), eventId: later.id });
    expect(data.warnings).toEqual([
      {
        code: 'TIMES_APART',
        message: 'The export’s first snapshot is 2 days before Onyxia started.',
      },
    ]);
    const early = nightExport({
      attendance: [{ at: AT_START - 3 * 3600, label: 'start', members: members('Aeryn') }],
    });
    const { data: before } = await check({ exportString: encode(early), eventId: raid.id });
    expect(before.warnings.map((w) => w.message)).toEqual([
      'The export’s first snapshot is 3 hours before Molten Core started.',
    ]);
  });

  it('records nothing', async () => {
    const before = await ok('signup-list', { eventId: raid.id }, leader);
    const emitted = deps.events.emitted.length;
    await check({ exportString: encode(nightExport()), eventId: raid.id });
    expect(await ok('signup-list', { eventId: raid.id }, leader)).toEqual(before);
    expect(deps.events.emitted.length).toBe(emitted);
  });
});

describe('expectedSignups', () => {
  const signup = (characterId: string, over: Partial<Signup> = {}): Signup => ({
    id: `s-${characterId}`,
    guildId: G,
    eventId: 'evt',
    memberId: characterId,
    characterId,
    characterName: characterId,
    class: 'mage',
    spec: 'frost',
    role: 'ranged',
    status: 'accepted',
    note: null,
    signedUpAt: 0,
    updatedAt: 0,
    roster: 'pending',
    group: null,
    queued: false,
    promotedAt: null,
    ...over,
  });

  it('is everyone going with a spot before a roster is made', () => {
    const ids = expectedSignups([
      signup('yes'),
      signup('late', { status: 'late' }),
      signup('queued', { queued: true }),
      signup('benched', { roster: 'benched' }),
      signup('maybe', { status: 'tentative' }),
      signup('no', { status: 'declined' }),
    ]).map((s) => s.characterId);
    expect(ids).toEqual(['yes', 'late']);
  });

  it('is the roster once there is one, as raid-complete counts it', () => {
    const ids = expectedSignups([
      signup('yes'),
      signup('in', { roster: 'rostered', group: 1 }),
      signup('maybe', { status: 'tentative', roster: 'rostered', group: 2 }),
    ]).map((s) => s.characterId);
    expect(ids).toEqual(['in', 'maybe']);
  });

  it('leaves nobody missing when there is no raid', () => {
    const check = checkExport(nightExport(), null, [signup('yes')], {
      guildId: G,
      eventSource: null,
    });
    expect(check.absent).toEqual([]);
  });
});

describe('raid-export-record', () => {
  let clock: ReturnType<typeof fixedClock>;
  let registry: ReturnType<typeof testRegistry<RaidsDeps>>;
  let deps: ReturnType<typeof createMemoryRaidsDeps>;
  let raid: RaidEvent;
  const officer = makeCaller('officer', { memberId: 'officer-1' });
  const leader = makeCaller('leader', { memberId: 'leader-1' });
  const as = (memberId: string) => makeCaller('raider', { memberId });

  const ok = async <T>(name: string, input: unknown, caller: Caller): Promise<T> => {
    const result = await registry.execute({ name, input, caller }, deps);
    if (!result.success) throw new Error(`${name} failed: ${JSON.stringify(result.error)}`);
    return result.data as T;
  };
  const record = (input: unknown, caller: Caller = officer) =>
    previewAndConfirm(registry, { name: 'raid-export-record', input, caller }, deps);
  const attendance = (eventId = raid.id) =>
    ok<{ record: RaidRecord | null; attendance: RaidAttendance[] }>(
      'attendance-list',
      { eventId },
      as('aeryn'),
    );
  const raidEvents = () => deps.events.emitted.filter((e) => e.type.startsWith('raid-'));

  beforeEach(async () => {
    clock = fixedClock(RAID_START - 2 * DAY);
    registry = testRegistry<RaidsDeps>([...raidsCommands], clock);
    deps = createMemoryRaidsDeps(MEMBERS, CHARACTERS);
    raid = await ok<RaidEvent>(
      'raid-create',
      { name: 'Molten Core', instance: 'Molten Core', size: 10, startsAt: RAID_START },
      leader,
    );
    for (const who of ['aeryn', 'bram', 'cade']) {
      await ok('signup-set', { eventId: raid.id, characterId: who, status: 'accepted' }, as(who));
    }
    clock.advance(2 * DAY + 6 * HOUR);
  });

  it('is for officers', async () => {
    expect(
      await registry.execute(
        {
          name: 'raid-export-record',
          input: { exportString: encode(nightExport()), eventId: raid.id },
          caller: leader,
        },
        deps,
      ),
    ).toMatchObject({ error: { code: 'COMMAND_NOT_FOUND' } });
  });

  it('previews the record without saving it', async () => {
    const preview = await registry.execute(
      {
        name: 'raid-export-record',
        input: { exportString: encode(nightExport()), eventId: raid.id },
        caller: officer,
      },
      deps,
    );
    expect(preview).toMatchObject({
      success: true,
      data: {
        confirmToken: expect.any(String),
        preview: {
          event: { id: raid.id, status: 'open' },
          replaces: null,
          completes: true,
          check: { unknownNames: ['Doran-Stonemaul'], absent: [{ characterId: 'cade' }] },
        },
      },
    });
    expect((await attendance()).record).toBeNull();
    expect(deps.raidLoot.drops.size).toBe(0);
    expect(raidEvents()).toEqual([]);
  });

  it('records who was in any snapshot and what dropped, then completes the raid', async () => {
    const { result } = await record({ exportString: encode(nightExport()), eventId: raid.id });
    expect(result).toMatchObject({
      success: true,
      reasoning: 'Recorded Molten Core: 3 attended, 2 drops; completes Molten Core',
      data: { event: { status: 'completed' } },
    });

    const { record: saved, attendance: people } = await attendance();
    expect(saved).toMatchObject({
      guildId: G,
      eventId: raid.id,
      exporter: 'Aeryn',
      exportedAt: 1_793_070_000_000,
      snapshots: 3,
      attended: 3,
      drops: 2,
      recordedBy: 'officer-1',
    });
    expect(people.map((p) => [p.name, p.characterId, p.snapshots, p.labels])).toEqual([
      ['Aeryn', 'aeryn', 3, ['start', 'Lucifron']],
      ['Bramble', 'bram', 3, ['start', 'Lucifron']],
      ['Doran-Stonemaul', null, 2, ['start', 'Lucifron']],
    ]);
    expect(people[0]).toMatchObject({
      class: 'warrior',
      memberId: 'aeryn',
      firstSeenAt: 1_793_059_300_000,
      lastSeenAt: 1_793_066_500_000,
    });

    expect(deps.raidLoot.drops.get(`${G}/${raid.id}`)).toEqual([
      {
        itemId: 16_800,
        itemName: 'Arcanist Boots',
        count: 1,
        looter: 'Bramble',
        characterId: 'bram',
        memberId: 'bram',
        at: 1_793_063_000_000,
        source: 'Lucifron',
        lootMethodId: raid.lootMethodId,
        recordedAt: clock.now(),
      },
      expect.objectContaining({ itemId: 17_011, looter: 'Doran-Stonemaul', count: 2 }),
    ]);

    const attendees = [
      { memberId: 'aeryn', characterId: 'aeryn' },
      { memberId: 'bram', characterId: 'bram' },
    ];
    expect(raidEvents()).toEqual([
      {
        guildId: G,
        type: 'raid-completed',
        payload: { eventId: raid.id, scheduleId: null, startsAt: RAID_START, attendees },
      },
      {
        guildId: G,
        type: 'raid-recorded',
        payload: { eventId: raid.id, attendees, drops: 2, replaced: false },
      },
    ]);
  });

  it('uses the raid the export names when the officer names none', async () => {
    const { result } = await record({
      exportString: encode(nightExport({ guildId: G, eventId: raid.id })),
    });
    expect(result).toMatchObject({ success: true, data: { event: { id: raid.id } } });
  });

  it('changes nothing when the same export is pasted again', async () => {
    const exportString = encode(nightExport());
    await record({ exportString, eventId: raid.id });
    const before = await attendance();
    const emitted = deps.events.emitted.length;

    const { preview, result } = await record({ exportString, eventId: raid.id });
    expect(preview).toMatchObject({ data: { preview: { unchanged: true } } });
    expect(result).toMatchObject({
      success: true,
      data: { unchanged: true, record: before.record },
      reasoning: 'Molten Core already has this export recorded; nothing changed',
    });
    expect(await attendance()).toEqual(before);
    expect(deps.events.emitted).toHaveLength(emitted);
  });

  it('replaces the earlier record when a different export is confirmed', async () => {
    await record({ exportString: encode(nightExport()), eventId: raid.id });
    const later = nightExport({
      exportedAt: 1_793_071_000,
      attendance: [{ at: 1_793_066_500, label: 'end', members: members('Aeryn') }],
      loot: [],
    });
    const { preview, result } = await record({ exportString: encode(later), eventId: raid.id });
    expect(preview).toMatchObject({
      data: { preview: { replaces: { exporter: 'Aeryn', attended: 3 }, completes: false } },
    });
    expect(result).toMatchObject({
      success: true,
      reasoning: 'Recorded Molten Core: 1 attended, 0 drops; replaces the export recorded before',
    });
    const { attendance: people } = await attendance();
    expect(people.map((p) => p.name)).toEqual(['Aeryn']);
    expect(deps.raidLoot.drops.get(`${G}/${raid.id}`)).toEqual([]);
    expect(raidEvents().map((e) => e.type)).toEqual([
      'raid-completed',
      'raid-recorded',
      'raid-recorded',
    ]);
    expect(deps.events.emitted.at(-1)).toMatchObject({
      type: 'raid-recorded',
      payload: { replaced: true, drops: 0 },
    });
  });

  it('refuses an export it cannot place on a raid that happened', async () => {
    const run = async (input: unknown) => (await record(input)).result;
    expect(await run({ exportString: encode(nightExport()) })).toMatchObject({
      error: { code: 'RAID_NOT_MATCHED', suggestion: expect.stringContaining('eventId') },
    });
    expect(
      await run({ exportString: encode(nightExport({ attendance: [] })), eventId: raid.id }),
    ).toMatchObject({ error: { code: 'EXPORT_EMPTY' } });
    expect(await run({ exportString: encode(nightExport()), eventId: 'nope' })).toMatchObject({
      error: { code: 'RAID_NOT_FOUND' },
    });

    const next = await ok<RaidEvent>(
      'raid-create',
      { name: 'Onyxia', instance: 'Onyxia’s Lair', size: 40, startsAt: clock.now() + DAY },
      leader,
    );
    expect(await run({ exportString: encode(nightExport()), eventId: next.id })).toMatchObject({
      error: { code: 'RAID_NOT_STARTED' },
    });
    await previewAndConfirm(
      registry,
      { name: 'raid-cancel', input: { eventId: next.id }, caller: leader },
      deps,
    );
    clock.advance(2 * DAY);
    expect(await run({ exportString: encode(nightExport()), eventId: next.id })).toMatchObject({
      error: { code: 'RAID_CANCELLED' },
    });
  });

  it('shows attendance to recruits and up, empty until recorded', async () => {
    expect(await attendance()).toMatchObject({ record: null, attendance: [] });
    expect(
      await registry.execute(
        { name: 'attendance-list', input: { eventId: raid.id }, caller: makeCaller('member') },
        deps,
      ),
    ).toMatchObject({ error: { code: 'COMMAND_NOT_FOUND' } });
  });
});
