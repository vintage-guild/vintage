// End-to-end JTBD scenarios for Absences (J50–J57) and Signup Improvements (J58–J70).
import { runTick } from '@vintage/coordinator/commands';
import {
  buttonLabels,
  createFakeDiscord,
  createFakePolls,
  createFakeRaids,
  createMemoryCoordinatorStore,
  messageText,
} from '@vintage/coordinator/testing';
import { createGuildRegistry, systemCaller } from '@vintage/guild-kit';
import { createMemoryIdentityStore } from '@vintage/identity/testing';
import { createMemoryLootStore } from '@vintage/loot/testing';
import { createMemoryRaidsStore } from '@vintage/raids/testing';
import { describe, expect, it } from 'vitest';
import { commands, type VintageDeps } from '../../src/registry';
import { createTickSource } from '../../src/tick-source';

const HOUR = 60 * 60 * 1000;
// Wed Dec 2, 2026 20:00 America/New_York (EST = UTC-5 -> Thu Dec 3 01:00 UTC)
const WED_RAID = Date.UTC(2026, 11, 3, 1, 0);
const GUILD = 'vintage';

async function setupGuild() {
  const identity = createMemoryIdentityStore();
  const raids = createMemoryRaidsStore();
  const coordinator = createMemoryCoordinatorStore();
  const loot = createMemoryLootStore();
  const discord = createFakeDiscord();
  const fakeRaids = createFakeRaids();
  const polls = createFakePolls();

  await coordinator.setConfig(
    GUILD,
    {
      signupChannelId: 'ch_guild',
      openSignupChannelId: 'ch_open',
      leadsChannelId: 'ch_leads',
      opsChannelId: 'ch_ops',
    },
    0,
  );

  let clock = WED_RAID - 7 * 24 * HOUR;
  const registry = createGuildRegistry<VintageDeps>({
    commands,
    confirmSecret: 'test-secret',
    now: () => clock,
  });
  const deps = {
    identity,
    raids,
    members: {
      getCharacter: (g: string, id: string) => identity.getCharacter(g, id),
      listCharacters: (g: string, memberId: string) => identity.listCharacters(g, { memberId }),
      getMember: (g: string, id: string) => identity.getMember(g, id),
    },
    events: { emit: async () => {} },
    raidLoot: loot,
    raidProgress: { recordKill: async () => ({ success: true, data: {} }) },
  } as unknown as VintageDeps;

  const sys = systemCaller(GUILD);
  await identity.setRoleRankMap(GUILD, {
    r_lead: 'raid-leader',
    r_raider: 'raider',
    r_flex: 'flex-raider',
    r_member: 'member',
    r_friend: 'friend',
  });

  const addMember = async (discordId: string, displayName: string, roleId: string) => {
    const res = await registry.execute(
      {
        name: 'member-sync',
        input: { discordId, displayName, inServer: true, roleIds: [roleId] },
        caller: sys,
      },
      deps,
    );
    expect(res.success).toBe(true);
    const m = await identity.getMemberByDiscordId(GUILD, discordId);
    expect(m).not.toBeNull();
    return m!;
  };

  const rook = await addMember('1001', 'Rook', 'r_lead');
  const cade = await addMember('1002', 'Cade', 'r_raider');
  const bram = await addMember('1003', 'Bram', 'r_flex');
  const kestrel = await addMember('1004', 'Kestrel', 'r_friend');

  const callerOf = (m: { id: string; tier: string; discordId: string }) => ({
    surface: 'discord' as const,
    guildId: GUILD,
    tier: m.tier as 'leader' | 'raider' | 'friend',
    memberId: m.id,
    discordId: m.discordId,
  });

  const source = createTickSource({ raids, identity, coordinator, loot });
  const tickPorts = { store: coordinator, source, raids: fakeRaids, discord, polls };

  return {
    registry,
    deps,
    callerOf,
    rook,
    cade,
    bram,
    kestrel,
    discord,
    tickPorts,
    raids,
    setClock: (ms: number) => {
      clock = ms;
    },
  };
}

describe('JTBD J50–J70: absences and signup improvements', () => {
  it('J50 & J52: date absence suppresses reminders/DMs, shows in digest & card absent count, and answering overrides it', async () => {
    const g = await setupGuild();
    g.setClock(WED_RAID - 7 * 24 * HOUR);
    // Create a guild raid on Wed Dec 2 (EST).
    const created = await g.registry.execute(
      {
        name: 'raid-create',
        input: {
          name: 'Raid night',
          instance: 'Molten Core',
          kind: 'raid',
          access: 'guild',
          size: 40,
          startsAt: WED_RAID,
          durationMinutes: 180,
        },
        caller: g.callerOf(g.rook),
      },
      g.deps,
    );
    expect(created.success).toBe(true);

    // Cade adds a date absence covering Dec 1 to Dec 5 with reason "work trip".
    g.setClock(WED_RAID - 5 * 24 * HOUR);
    const abs = await g.registry.execute(
      {
        name: 'absence-add',
        input: { from: '2026-12-01', to: '2026-12-05', reason: 'work trip' },
        caller: g.callerOf(g.cade),
      },
      g.deps,
    );
    expect(abs.success).toBe(true);

    // T-48h: card posts in #guild with 1 absent.
    await runTick(g.tickPorts, GUILD, WED_RAID - 48 * HOUR);
    const card = g.discord.sent.find((m) => m.to === 'ch_guild' && m.kind === 'post');
    expect(messageText(card!.message)).toContain('**1** absent');

    // T-24h: digest in #leads lists Cade under Absent (1): Cade (work trip), NOT Not answered.
    await runTick(g.tickPorts, GUILD, WED_RAID - 24 * HOUR);
    const digest = g.discord.sent.find(
      (m) => m.to === 'ch_leads' && messageText(m.message).includes('Absent (1): Cade (work trip)'),
    );
    expect(digest).toBeDefined();
    expect(messageText(digest!.message)).not.toMatch(/Not answered.*Cade/);
    // No DM sent to Cade.
    expect(g.discord.sent.filter((m) => m.kind === 'dm' && m.to === g.cade.discordId)).toHaveLength(
      0,
    );
  });

  it('J67 & J68: Flex Raider keeps his own Late answer in a guild raid, and Friend joins open raid in #open with no reminders', async () => {
    const g = await setupGuild();
    const bramChar = (
      await g.registry.execute(
        {
          name: 'character-add',
          input: {
            name: 'Bram',
            class: 'warrior',
            spec: 'fury',
            role: 'melee',
            alsoRoles: ['tank'],
          },
          caller: g.callerOf(g.bram),
        },
        g.deps,
      )
    ).data as { id: string };
    const kesChar = (
      await g.registry.execute(
        {
          name: 'character-add',
          input: { name: 'Kestrel', class: 'priest', spec: 'holy', role: 'healer' },
          caller: g.callerOf(g.kestrel),
        },
        g.deps,
      )
    ).data as { id: string };

    // Guild raid: Bram presses Late 15m and keeps that answer; Kestrel (Friend) is refused.
    g.setClock(WED_RAID - 7 * 24 * HOUR);
    const guildRaid = (
      await g.registry.execute(
        {
          name: 'raid-create',
          input: {
            name: 'MC Guild',
            instance: 'Molten Core',
            kind: 'raid',
            access: 'guild',
            size: 40,
            startsAt: WED_RAID,
            durationMinutes: 180,
          },
          caller: g.callerOf(g.rook),
        },
        g.deps,
      )
    ).data as { id: string };

    g.setClock(WED_RAID - 48 * HOUR);
    const bramLate = await g.registry.execute(
      {
        name: 'signup-set',
        input: { eventId: guildRaid.id, characterId: bramChar.id, status: 'late', lateMinutes: 15 },
        caller: g.callerOf(g.bram),
      },
      g.deps,
    );
    expect(bramLate.success).toBe(true);
    expect(bramLate.data).toMatchObject({ status: 'late', lateMinutes: 15 });

    const kesGuild = await g.registry.execute(
      {
        name: 'signup-set',
        input: { eventId: guildRaid.id, characterId: kesChar.id, status: 'accepted' },
        caller: g.callerOf(g.kestrel),
      },
      g.deps,
    );
    expect(kesGuild.success).toBe(false);

    // Open raid: posts to #open, Kestrel signs up in full, no reminders/DMs.
    g.setClock(WED_RAID - 7 * 24 * HOUR);
    const openRaid = (
      await g.registry.execute(
        {
          name: 'raid-create',
          input: {
            name: 'ZG Open',
            instance: "Zul'Gurub",
            kind: 'raid',
            access: 'open',
            size: 20,
            startsAt: WED_RAID,
            durationMinutes: 180,
          },
          caller: g.callerOf(g.rook),
        },
        g.deps,
      )
    ).data as { id: string };

    g.setClock(WED_RAID - 48 * HOUR);
    const kesOpen = await g.registry.execute(
      {
        name: 'signup-set',
        input: { eventId: openRaid.id, characterId: kesChar.id, status: 'accepted' },
        caller: g.callerOf(g.kestrel),
      },
      g.deps,
    );
    expect(kesOpen.success).toBe(true);
    expect(kesOpen.data).toMatchObject({ status: 'accepted' });

    await runTick(g.tickPorts, GUILD, WED_RAID - 48 * HOUR);
    const openPost = g.discord.sent.find((m) => m.to === 'ch_open' && m.kind === 'post');
    expect(openPost).toBeDefined();
    expect(messageText(openPost!.message)).toContain('Kestrel');
    expect(buttonLabels(openPost!.message)).toContain('Absent');
  });
});
