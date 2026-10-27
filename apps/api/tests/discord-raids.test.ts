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
import { createMemoryRaidsDeps } from '@vintage/raids/testing';
import { fixedClock, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleRaidInteraction, parseLocalTime, type RaidPorts } from '../src/discord-raids';

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
  rank: null,
  tier,
  prefs: { dmOptOut: false },
  syncedAt: 0,
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
let ports: RaidPorts;

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
        name: 'raid',
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

describe('/random raid create', () => {
  it('makes the raid as the raid leader, in the guild clock, and starts a tick', async () => {
    const reply = said(
      await handleRaidInteraction(
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
      size: 40,
      recurrence: { weekdays: ['wed'], time: '20:00', timeZone: 'Australia/Sydney' },
      durationMinutes: 180,
      timings: { leadDays: 7, reminderHours: [72, 24], lockHours: 2 },
      roleTargets: null,
      lootMethodId: null,
      active: false,
      configVersion: 1,
    });
    await deps.raids.insertSchedule({
      guildId: GUILD,
      name: 'Raid night',
      instance: 'Molten Core',
      size: 40,
      recurrence: { weekdays: ['tue'], time: '20:00', timeZone: 'Europe/Berlin' },
      durationMinutes: 180,
      timings: { leadDays: 7, reminderHours: [72, 24], lockHours: 2 },
      roleTargets: null,
      lootMethodId: null,
      active: true,
      configVersion: 1,
    });
    await handleRaidInteraction(
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
      size: 40,
      recurrence: { weekdays: ['tue'], time: '20:00', timeZone: 'Europe/Berlin' },
      durationMinutes: 180,
      timings: { leadDays: 7, reminderHours: [72, 24], lockHours: 2 },
      roleTargets: null,
      lootMethodId: null,
      active: false,
      configVersion: 1,
    });
    await handleRaidInteraction(
      slash('rook', 'create', { ...BASICS, start: '2026-11-10 20:00' }),
      ports,
    );
    const [raid] = await deps.raids.listEvents(GUILD);
    expect(raid?.startsAt).toBe(Date.UTC(2026, 10, 10, 19));
  });

  it('tells a raider it needs a raid leader, and makes nothing', async () => {
    const reply = said(
      await handleRaidInteraction(
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
      await handleRaidInteraction(slash('rook', 'create', { ...BASICS, start: 'tuesday' }), ports),
    );
    expect(bad.content).toContain("couldn't read “tuesday”");
    expect(bad.content).toContain('2026-11-10 20:00');
    const past = said(
      await handleRaidInteraction(
        slash('rook', 'create', { ...BASICS, start: '2026-10-01 20:00' }),
        ports,
      ),
    );
    expect(past.content).not.toContain('Made');
    expect(await deps.raids.listEvents(GUILD)).toEqual([]);
  });
});

describe('/random raid pick-night', () => {
  it('opens a raid-night vote with the times, closing after the vote hours', async () => {
    const reply = said(
      await handleRaidInteraction(
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

  it('names the time it could not read', async () => {
    const reply = said(
      await handleRaidInteraction(
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
      await handleRaidInteraction(
        slash('rook', 'create', { ...BASICS, start: '2026-11-10 20:00' }, '999'),
        ports,
      ),
    );
    expect(elsewhere.content).toContain('only runs raids in the Vintage guild server');
    const stranger = said(
      await handleRaidInteraction(
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
    expect(await handleRaidInteraction(poll as Interaction, ports)).toBeNull();
  });
});
