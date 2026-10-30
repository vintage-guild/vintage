import { encodeBridge } from '@vintage/bridge-format';
import { coordinatorCommands } from '@vintage/coordinator/commands';
import { createMemoryCoordinatorDeps } from '@vintage/coordinator/testing';
import {
  ApplicationCommandOptionType,
  type Interaction,
  InteractionType,
  MessageFlags,
} from '@vintage/discord-kit';
import type { Tier } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { raidsCommands } from '@vintage/raids/commands';
import type { ExportCheck, RaidEvent } from '@vintage/raids/contract';
import { createMemoryRaidsDeps } from '@vintage/raids/testing';
import { fixedClock, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type EventAutocompletePorts,
  type EventPorts,
  exportCheckText,
  handleEventAutocomplete,
  handleEventInteraction,
  parseLocalTime,
} from '../src/discord-events';

const GUILD = 'guild-test';
const DISCORD_GUILD = '600000000000000001';
const NY = 'America/New_York';
/** Mon 26 Oct 2026, 12:00 New York. */
const NOW = Date.UTC(2026, 9, 26, 16);
/** Tue 10 Nov 2026, 20:00 New York (EST). */
const TUE_8PM = Date.UTC(2026, 10, 11, 1);
const HOUR = 60 * 60 * 1000;

const member = (id: string, tier: Tier): Member => ({
  id,
  guildId: GUILD,
  discordId: `d-${id}`,
  displayName: id,
  roleIds: [],
  inServer: true,
  rank: null,
  tier,
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
});
const MEMBERS = [member('rook', 'leader'), member('aeryn', 'raider')];

describe('parseLocalTime', () => {
  it('reads 24-hour and am/pm times in the guild zone', () => {
    expect(parseLocalTime('2026-11-10 20:00', NY)).toBe(TUE_8PM);
    expect(parseLocalTime('2026-11-10 8pm', NY)).toBe(TUE_8PM);
    expect(parseLocalTime(' 2026-11-10  8:30 PM ', NY)).toBe(TUE_8PM + HOUR / 2);
    expect(parseLocalTime('2026-11-10 12am', NY)).toBe(Date.UTC(2026, 10, 10, 5));
    expect(parseLocalTime('2026-11-10 20:00', 'Europe/Berlin')).toBe(Date.UTC(2026, 10, 10, 19));
  });

  it('refuses what it cannot read, days that do not exist, and the skipped DST hour', () => {
    expect(parseLocalTime('next tuesday 8pm', NY)).toBeNull();
    expect(parseLocalTime('2026-02-31 20:00', NY)).toBeNull();
    expect(parseLocalTime('2026-11-10 13pm', NY)).toBeNull();
    expect(parseLocalTime('2026-11-10 24:00', NY)).toBeNull();
    expect(parseLocalTime('2026-03-08 02:30', NY)).toBeNull();
  });
});

type Deps = ReturnType<typeof createMemoryRaidsDeps> &
  ReturnType<typeof createMemoryCoordinatorDeps>;
let deps: Deps;
let ticks: number;
let ports: EventPorts;

beforeEach(async () => {
  deps = {
    ...createMemoryRaidsDeps(MEMBERS),
    ...createMemoryCoordinatorDeps(() => ({ guildId: GUILD, events: [], members: [] })),
  };
  await deps.coordinator.setConfig(GUILD, { signupChannelId: '400000000000000001' }, 0);
  const registry = testRegistry<Deps>([...raidsCommands, ...coordinatorCommands], fixedClock(NOW));
  ticks = 0;
  ports = {
    discordGuildId: DISCORD_GUILD,
    guildId: GUILD,
    memberByDiscordId: async (discordId) => MEMBERS.find((m) => m.discordId === discordId) ?? null,
    run: (caller, name, input) => registry.execute({ name, input, caller }, deps),
    afterChange: async () => {
      ticks++;
    },
    now: () => NOW,
  };
});

const T = ApplicationCommandOptionType;
const slash = (
  who: string,
  sub: string,
  options: Record<string, string | number>,
  guildId = DISCORD_GUILD,
): Interaction => ({
  id: 'i',
  application_id: 'app',
  token: 'tok',
  type: InteractionType.APPLICATION_COMMAND,
  guild_id: guildId,
  channel_id: '400000000000000009',
  member: { user: { id: `d-${who}`, username: who }, roles: [] },
  data: {
    name: 'random',
    options: [
      {
        name: 'event',
        type: T.SUB_COMMAND_GROUP,
        options: [
          {
            name: sub,
            type: T.SUB_COMMAND,
            options: Object.entries(options).map(([name, value]) => ({
              name,
              value,
              type: typeof value === 'number' ? T.INTEGER : T.STRING,
            })),
          },
        ],
      },
    ],
  },
});

const said = (r: unknown) => (r as { data?: { content?: string; flags?: number } }).data ?? {};
const BASICS = { name: 'Onyxia run', instance: 'Onyxia’s Lair', size: 40 };

describe('/random event create', () => {
  it('makes the raid as the raid leader, in the guild clock, and starts a tick', async () => {
    const reply = said(
      await handleEventInteraction(
        slash('rook', 'create', { ...BASICS, start: '2026-11-10 8pm' }),
        ports,
      ),
    );
    const [raid] = await deps.raids.listEvents(GUILD);
    expect(raid).toMatchObject({
      name: 'Onyxia run',
      instance: 'Onyxia’s Lair',
      size: 40,
      startsAt: TUE_8PM,
      durationMinutes: 180,
      status: 'open',
    });
    expect(ticks).toBe(1);
    expect(reply.flags).toBe(MessageFlags.EPHEMERAL);
    expect(reply.content).toContain(`<t:${TUE_8PM / 1000}:F>`);
    expect(reply.content).toContain('signup card goes up');
  });

  it('uses the first active schedule’s zone as the guild clock', async () => {
    await deps.raids.insertSchedule({
      guildId: GUILD,
      name: 'Old night',
      instance: 'Molten Core',
      kind: 'raid',
      size: 40,
      recurrence: { weekdays: ['wed'], time: '20:00', timeZone: 'Australia/Sydney' },
      durationMinutes: 180,
      timings: { leadDays: 7, reminderHours: [72, 24], lockHours: 2 },
      roleTargets: null,
      lootMethodId: null,
      notes: null,
      active: false,
      configVersion: 1,
    });
    await deps.raids.insertSchedule({
      guildId: GUILD,
      name: 'Raid night',
      instance: 'Molten Core',
      kind: 'raid',
      size: 40,
      recurrence: { weekdays: ['tue'], time: '20:00', timeZone: 'Europe/Berlin' },
      durationMinutes: 180,
      timings: { leadDays: 7, reminderHours: [72, 24], lockHours: 2 },
      roleTargets: null,
      lootMethodId: null,
      notes: null,
      active: true,
      configVersion: 1,
    });
    await handleEventInteraction(
      slash('rook', 'create', { ...BASICS, start: '2026-11-10 20:00' }),
      ports,
    );
    const [raid] = await deps.raids.listEvents(GUILD);
    expect(raid?.startsAt).toBe(Date.UTC(2026, 10, 10, 19));
  });

  it('falls back to a paused schedule’s zone, as the site’s calendar does', async () => {
    await deps.raids.insertSchedule({
      guildId: GUILD,
      name: 'Raid night',
      instance: 'Molten Core',
      kind: 'raid',
      size: 40,
      recurrence: { weekdays: ['tue'], time: '20:00', timeZone: 'Europe/Berlin' },
      durationMinutes: 180,
      timings: { leadDays: 7, reminderHours: [72, 24], lockHours: 2 },
      roleTargets: null,
      lootMethodId: null,
      notes: null,
      active: false,
      configVersion: 1,
    });
    await handleEventInteraction(
      slash('rook', 'create', { ...BASICS, start: '2026-11-10 20:00' }),
      ports,
    );
    const [raid] = await deps.raids.listEvents(GUILD);
    expect(raid?.startsAt).toBe(Date.UTC(2026, 10, 10, 19));
  });

  it('tells a raider it needs a raid leader, and makes nothing', async () => {
    const reply = said(
      await handleEventInteraction(
        slash('aeryn', 'create', { ...BASICS, start: '2026-11-10 20:00' }),
        ports,
      ),
    );
    expect(reply.content).toContain('needs the Raid Leader rank');
    expect(await deps.raids.listEvents(GUILD)).toEqual([]);
    expect(ticks).toBe(0);
  });

  it('explains a time it cannot read, and passes the command’s own refusals through', async () => {
    const bad = said(
      await handleEventInteraction(slash('rook', 'create', { ...BASICS, start: 'tuesday' }), ports),
    );
    expect(bad.content).toContain("couldn't read “tuesday”");
    expect(bad.content).toContain('2026-11-10 20:00');
    const past = said(
      await handleEventInteraction(
        slash('rook', 'create', { ...BASICS, start: '2026-10-01 20:00' }),
        ports,
      ),
    );
    expect(past.content).not.toContain('Made');
    expect(await deps.raids.listEvents(GUILD)).toEqual([]);
  });

  it('makes a dungeon with the counts given, and says so', async () => {
    const reply = said(
      await handleEventInteraction(
        slash('rook', 'create', {
          name: 'Cathedral run',
          instance: 'Scarlet Monastery',
          size: 5,
          start: '2026-11-10 8pm',
          kind: 'dungeon',
          tanks: 1,
          healers: 1,
          dps: 3,
        }),
        ports,
      ),
    );
    const [event] = await deps.raids.listEvents(GUILD);
    expect(event).toMatchObject({
      kind: 'dungeon',
      size: 5,
      roleTargets: { tank: 1, healer: 1, dps: 3 },
    });
    expect(reply.content).toContain(
      'Made **Cathedral run** (Scarlet Monastery, 5-player dungeon) for',
    );
    expect(reply.content).toContain('looking for 1 tank · 1 healer · 3 DPS');
  });

  it('sends no role targets unless a count is given; the rest of the dps fills the size', async () => {
    await handleEventInteraction(
      slash('rook', 'create', { ...BASICS, start: '2026-11-10 8pm' }),
      ports,
    );
    await handleEventInteraction(
      slash('rook', 'create', { ...BASICS, name: 'Ony 2', start: '2026-11-10 9pm', tanks: 3 }),
      ports,
    );
    const [plain, tuned] = await deps.raids.listEvents(GUILD);
    expect(plain).toMatchObject({ kind: 'raid', roleTargets: null });
    // Healers from the 40-person default (10); dps is what is left.
    expect(tuned?.roleTargets).toEqual({ tank: 3, healer: 10, dps: 27 });
  });

  it('makes an open "other" event with no size or instance, and asks a raid for both', async () => {
    const reply = said(
      await handleEventInteraction(
        slash('rook', 'create', {
          name: 'Westfall levelling',
          start: '2026-11-10 8pm',
          kind: 'other',
        }),
        ports,
      ),
    );
    const [event] = await deps.raids.listEvents(GUILD);
    expect(event).toMatchObject({ kind: 'other', size: null, instance: '' });
    expect(reply.content).toContain('Made **Westfall levelling** (open event) for');
    expect(reply.content).toContain('looking for any roles');
    const raid = said(
      await handleEventInteraction(
        slash('rook', 'create', { name: 'Ony', start: '2026-11-10 9pm' }),
        ports,
      ),
    );
    expect(raid.content).toContain("That raid isn't valid. size: A raid needs a size");
    expect(await deps.raids.listEvents(GUILD)).toHaveLength(1);
  });

  it('passes a size the kind does not allow back as the command says it', async () => {
    const reply = said(
      await handleEventInteraction(
        slash('rook', 'create', { ...BASICS, size: 7, start: '2026-11-10 8pm', kind: 'dungeon' }),
        ports,
      ),
    );
    expect(reply.content).toContain("A dungeon can't be 7 players");
    expect(await deps.raids.listEvents(GUILD)).toEqual([]);
  });
});

describe('/random event pick-night', () => {
  it('opens a raid-night vote with the times, closing after the vote hours', async () => {
    const reply = said(
      await handleEventInteraction(
        slash('rook', 'pick-night', {
          ...BASICS,
          times: '2026-11-12 20:00; 2026-11-10 8pm',
          vote_hours: 48,
        }),
        ports,
      ),
    );
    const [poll] = [...deps.coordinatorPolls.polls.values()];
    expect(poll).toMatchObject({ tags: ['raid-night'], closesAt: NOW + 48 * HOUR });
    expect(poll?.options.map((o) => Number(o.value))).toEqual([TUE_8PM, TUE_8PM + 2 * 24 * HOUR]);
    expect([...deps.coordinator.raidNights.values()]).toEqual([
      expect.objectContaining({ name: 'Onyxia run', size: 40, outcome: 'pending' }),
    ]);
    expect(reply.content).toContain('vote on **Onyxia run**’s night is up');
    expect(reply.content?.indexOf(`<t:${TUE_8PM / 1000}:F>`)).toBeLessThan(
      reply.content?.indexOf(`<t:${(TUE_8PM + 2 * 24 * HOUR) / 1000}:F>`) ?? 0,
    );
  });

  it('carries the kind and counts to the raid night', async () => {
    const reply = said(
      await handleEventInteraction(
        slash('rook', 'pick-night', {
          name: 'WSG premade',
          instance: 'Warsong Gulch',
          size: 10,
          kind: 'battleground',
          healers: 3,
          times: '2026-11-12 20:00; 2026-11-10 8pm',
        }),
        ports,
      ),
    );
    expect([...deps.coordinator.raidNights.values()]).toEqual([
      expect.objectContaining({
        kind: 'battleground',
        size: 10,
        roleTargets: { tank: 0, healer: 3, dps: 7 },
      }),
    ]);
    expect(reply.content).toContain('becomes the 10-player battleground');
  });

  it('names the time it could not read', async () => {
    const reply = said(
      await handleEventInteraction(
        slash('rook', 'pick-night', { ...BASICS, times: '2026-11-10 20:00; friday' }),
        ports,
      ),
    );
    expect(reply.content).toContain("couldn't read “friday”");
    expect(deps.coordinatorPolls.polls.size).toBe(0);
  });
});

describe('scope', () => {
  it('refuses other servers and members it does not know', async () => {
    const elsewhere = said(
      await handleEventInteraction(
        slash('rook', 'create', { ...BASICS, start: '2026-11-10 20:00' }, '999'),
        ports,
      ),
    );
    expect(elsewhere.content).toContain('only runs raids in the Vintage guild server');
    const stranger = said(
      await handleEventInteraction(
        slash('nobody', 'create', { ...BASICS, start: '2026-11-10 20:00' }),
        ports,
      ),
    );
    expect(stranger.content).toContain("I don't know you yet");
  });

  it('ignores other commands', async () => {
    const poll = {
      ...slash('rook', 'create', {}),
      data: { name: 'random', options: [{ name: 'poll', type: T.SUB_COMMAND_GROUP }] },
    };
    expect(await handleEventInteraction(poll as Interaction, ports)).toBeNull();
  });
});

const exportCheck = (over: Partial<ExportCheck> = {}): ExportCheck => ({
  event: { id: 'e1', name: 'Molten Core', startsAt: TUE_8PM, status: 'completed' },
  eventSource: 'input',
  otherGuild: false,
  exporter: 'Aeryn',
  exportedAt: 0,
  addonVersion: '0.1.0',
  snapshots: [{ at: 1, label: 'start', present: 2, online: 2 }],
  attendees: [
    {
      name: 'Aeryn',
      snapshots: 1,
      characterId: 'c1',
      memberId: 'm1',
      status: 'accepted',
      matchedWithoutRealm: false,
    },
  ],
  loot: [],
  itemsSeen: 0,
  unknownNames: [],
  absent: [],
  declinedButSeen: [],
  standby: [],
  warnings: [],
  ...over,
});

const many = (n: number, what: string) => Array.from({ length: n }, (_, i) => `${what}${i}`);

describe('/random event check-export, the reply', () => {
  const lineOf = (text: string, prefix: string) =>
    text.split('\n').findIndex((l) => l.startsWith(prefix));

  it('puts warnings and who to follow up with before the attendance and loot', () => {
    const aeryn = exportCheck().attendees[0]!;
    const text = exportCheckText(
      exportCheck({
        warnings: [
          {
            code: 'TIMES_APART',
            message: 'The export’s first snapshot is 2 days before Molten Core started.',
          },
        ],
        unknownNames: ['Doran-Stonemaul'],
        absent: [{ characterId: 'c3', characterName: 'Cadence', status: 'accepted' }],
        declinedButSeen: ['Nimue'],
        standby: [{ characterId: 'c9', name: 'Fenna', reason: 'standby' }],
        attendees: [{ ...aeryn, name: 'Aeryn-Stonemaul', matchedWithoutRealm: true }],
        loot: [
          {
            itemId: 1,
            itemName: 'Arcanist Boots',
            looter: 'Aeryn',
            characterId: 'c1',
            at: 1,
            count: 1,
            source: null,
          },
        ],
      }),
    );
    const order = [
      '**Molten Core**',
      '⚠️ The export’s first snapshot is 2 days before',
      'Not signed up: Doran-Stonemaul',
      'Signed up but not seen: Cadence',
      'Declined but came: Nimue',
      'Stood by: Fenna',
      'Matched by name only: Aeryn-Stonemaul',
      'Export by Aeryn',
      'Seen: Aeryn-Stonemaul (1/1)',
      'Loot: Arcanist Boots → Aeryn',
    ].map((prefix) => lineOf(text, prefix));
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(text).toMatch(/\n-# Nothing was recorded\.$/);
  });

  it('says when no raid matched, and lists nobody as missing', () => {
    const text = exportCheckText(
      exportCheck({
        event: null,
        eventSource: null,
        otherGuild: true,
        unknownNames: ['Aeryn'],
        warnings: [
          {
            code: 'OTHER_GUILD',
            message: 'This export names another guild, so the raid it names was ignored.',
          },
        ],
      }),
    );
    expect(text.split('\n').slice(0, 2)).toEqual([
      '**No raid matched.** Add `event:` to check it against one.',
      '⚠️ This export names another guild, so the raid it names was ignored.',
    ]);
    expect(text).not.toContain('Not signed up');
  });

  it('stays inside Discord’s limit on a long night and keeps who to follow up with', () => {
    const aeryn = exportCheck().attendees[0]!;
    const text = exportCheckText(
      exportCheck({
        snapshots: many(40, 'Boss').map((label) => ({ at: 1, label, present: 40, online: 39 })),
        attendees: many(40, 'Raider-With-A-Long-Realm-Name').map((name) => ({
          ...aeryn,
          name,
          snapshots: 40,
        })),
        unknownNames: many(20, 'Stranger'),
        absent: many(3, 'Missing').map((characterName) => ({
          characterId: characterName,
          characterName,
          status: 'accepted' as const,
        })),
        loot: many(30, 'A Very Long Epic Item Name Of The Ages').map((itemName, i) => ({
          itemId: i,
          itemName,
          looter: 'Raider-With-A-Long-Realm-Name0',
          characterId: null,
          at: 1,
          count: 1,
          source: 'Ragnaros the Firelord',
        })),
      }),
    );
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toContain('Not signed up: Stranger0, ');
    expect(text).toContain('Stranger11 and 8 more');
    expect(text).toContain('Signed up but not seen: Missing0, Missing1, Missing2');
    expect(text).toContain('Boss7 40 (1 offline) and 32 more');
    expect(text).toMatch(/\n-# Nothing was recorded\.$/);
  });

  it('points at the suggestions when event: is a typed name, not a raid', async () => {
    const encoded = encodeBridge({
      v: 1,
      kind: 'raid-export',
      exportedAt: 1,
      addonVersion: '0.1.0',
      exporter: 'Aeryn',
      attendance: [],
      loot: [],
      items: [],
    });
    if (!encoded.ok) throw new Error(encoded.error.message);
    const reply = said(
      await handleEventInteraction(
        slash('rook', 'check-export', { export: encoded.value, event: 'Molten Core' }),
        ports,
      ),
    );
    expect(reply.flags).toBe(MessageFlags.EPHEMERAL);
    expect(reply.content).toContain('Pick it from the suggestions in `event:`');
  });
});

describe('/random event check-export, suggesting raids', () => {
  const raid = (id: string, name: string, startsAt: number, status = 'open') =>
    ({ id, guildId: GUILD, name, startsAt, status }) as RaidEvent;
  const EVENTS = [
    raid('tomorrow', 'Onyxia', NOW + 20 * HOUR),
    raid('last-week', 'Molten Core', NOW - 6 * 24 * HOUR),
    raid('cancelled', 'Zul’Gurub', NOW - 2 * HOUR, 'cancelled'),
    raid('last-night', 'Molten Core', NOW - 16 * HOUR, 'completed'),
  ];
  let windows: { from: number; to: number }[];
  const autocompletePorts = (): EventAutocompletePorts => ({
    discordGuildId: DISCORD_GUILD,
    guildId: GUILD,
    memberByDiscordId: async (discordId) => MEMBERS.find((m) => m.discordId === discordId) ?? null,
    events: async (window) => {
      windows.push(window);
      return EVENTS;
    },
    timeZone: async () => NY,
    now: () => NOW,
  });
  beforeEach(() => {
    windows = [];
  });

  /** Typing into `focused` of check-export, as Discord sends it while the leader types. */
  const typing = (
    who: string,
    focused: 'event' | 'export',
    value: string,
    guildId = DISCORD_GUILD,
  ) => {
    const i = slash(who, 'check-export', {}, guildId);
    const sub = i.data!.options![0]!.options![0]!;
    sub.options = [
      { name: 'export', type: T.STRING, value: focused === 'export' ? value : '!VIN:1!x' },
      ...(focused === 'event' ? [{ name: 'event', type: T.STRING, value }] : []),
    ].map((o) => (o.name === focused ? { ...o, focused: true } : o));
    return { ...i, type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE } as Interaction;
  };
  const choices = async (i: Interaction) =>
    (
      (await handleEventAutocomplete(i, autocompletePorts())) as {
        data: { choices: { name: string; value: string }[] };
      }
    ).data.choices;

  it('lists raids that started, latest first, then upcoming ones, and no cancelled raids', async () => {
    expect(await choices(typing('rook', 'event', ''))).toEqual([
      { name: 'Molten Core · Sun, Oct 25, 8:00 PM', value: 'last-night' },
      { name: 'Molten Core · Tue, Oct 20, 12:00 PM', value: 'last-week' },
      { name: 'Onyxia · Tue, Oct 27, 8:00 AM', value: 'tomorrow' },
    ]);
    expect(windows).toEqual([{ from: NOW - 7 * 24 * HOUR, to: NOW + 24 * HOUR }]);
    const typed = await choices(typing('rook', 'event', 'ony'));
    expect(typed.map((c) => c.value)).toEqual(['tomorrow']);
  });

  it('suggests nothing in another server, for another option, or for a raider', async () => {
    expect(await choices(typing('rook', 'event', '', '999'))).toEqual([]);
    expect(await choices(typing('rook', 'export', '!VIN'))).toEqual([]);
    expect(await choices(typing('aeryn', 'event', ''))).toEqual([]);
    expect(windows).toEqual([]);
  });

  it('leaves slash commands alone', async () => {
    const run = slash('rook', 'check-export', {});
    expect(await handleEventAutocomplete(run, autocompletePorts())).toBeNull();
  });
});
