import { encodeBridge, type RaidExport } from '@vintage/bridge-format';
import type { Caller } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import { fixedClock, makeCaller, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { raidsCommands } from '../src/commands';
import type { ExportCheck, RaidEvent, Signup } from '../src/contract';
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
