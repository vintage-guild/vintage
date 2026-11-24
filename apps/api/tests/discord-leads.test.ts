import { defaultConfig } from '@vintage/coordinator/contract';
import { type Interaction, InteractionType } from '@vintage/discord-kit';
import { error, success } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import type { RaidEvent, Signup } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import { handleLeadsInteraction, type LeadsPorts } from '../src/discord-leads';

const LEADER: Member = {
  id: 'm_rook',
  guildId: 'g1',
  discordId: 'd_rook',
  displayName: 'Rook',
  rank: 'raid-leader',
  tier: 'leader',
  roleIds: [],
  rankSince: null,
  inServer: true,
  prefs: { dmOptOut: false },
  syncedAt: 0,
};

const RAIDER: Member = {
  ...LEADER,
  id: 'm_aeryn',
  discordId: 'd_aeryn',
  displayName: 'Aeryn',
  rank: 'raider',
  tier: 'raider',
};

const MOONGLADE: Member = {
  ...RAIDER,
  id: 'm_moon',
  discordId: 'd_moon',
  displayName: 'Moonglade',
};

const EVENT: RaidEvent = {
  id: 'evt_mc',
  guildId: 'g1',
  scheduleId: null,
  name: 'Molten Core',
  instance: 'Molten Core',
  kind: 'raid',
  access: 'guild',
  size: 10,
  roleTargets: { tank: 2, healer: 2, melee: 3, ranged: 3 },
  startsAt: Date.UTC(2026, 11, 2, 20, 0),
  durationMinutes: 180,
  status: 'open',
  notes: null,
  lootMethodId: null,
  configVersion: 1,
  rosterApprovedAt: null,
  rosterApprovedBy: null,
};

function makeSignup(overrides: Partial<Signup> & { id: string }): Signup {
  return {
    guildId: 'g1',
    eventId: 'evt_mc',
    memberId: 'm_moon',
    characterId: 'c_moon',
    characterName: 'Moonglade',
    class: 'druid',
    spec: 'restoration',
    role: 'healer',
    rolePicked: false,
    alsoRoles: ['tank'],
    status: 'bench',
    lateMinutes: null,
    note: null,
    signedUpAt: 0,
    updatedAt: 0,
    updatedBy: 'm_moon',
    roster: 'pending',
    group: null,
    queued: false,
    promotedAt: null,
    ...overrides,
  };
}

function buttonClick(customId: string, discordId: string): Interaction {
  return {
    id: 'i1',
    application_id: 'app1',
    token: 'tok1',
    type: InteractionType.MESSAGE_COMPONENT,
    guild_id: 'dg1',
    member: { user: { id: discordId, username: discordId }, roles: [] },
    data: { custom_id: customId, component_type: 2 },
  };
}

function replyText(res: Awaited<ReturnType<typeof handleLeadsInteraction>>): string {
  if (!res || !('data' in res) || !res.data || !('content' in res.data)) return '';
  return res.data.content ?? '';
}

function makePorts(
  signups: Signup[],
  event: RaidEvent = EVENT,
): {
  ports: LeadsPorts;
  ran: { name: string; input: unknown }[];
  mentions: { channelId: string; content: string; discordUserId: string }[];
  cleared: string[];
  ticks: number;
} {
  const ran: { name: string; input: unknown }[] = [];
  const mentions: { channelId: string; content: string; discordUserId: string }[] = [];
  const cleared: string[] = [];
  let ticks = 0;
  const members = [LEADER, RAIDER, MOONGLADE];
  const ports: LeadsPorts = {
    discordGuildId: 'dg1',
    guildId: 'g1',
    memberByDiscordId: async (id) => members.find((m) => m.discordId === id) ?? null,
    memberById: async (id) => members.find((m) => m.id === id) ?? null,
    event: async (id) => (id === event.id ? event : null),
    signups: async () => signups,
    config: async () => ({ ...defaultConfig('g1'), signupChannelId: 'ch_signups' }),
    run: async (_caller, name, input) => {
      ran.push({ name, input });
      return success({});
    },
    clearGroups: async (eventId) => {
      cleared.push(eventId);
    },
    postMention: async (channelId, content, discordUserId) => {
      mentions.push({ channelId, content, discordUserId });
    },
    afterChange: async () => {
      ticks += 1;
    },
  };
  return {
    ports,
    ran,
    mentions,
    cleared,
    get ticks() {
      return ticks;
    },
  };
}

describe('discord-leads buttons (party-approve, party-redraft, seat)', () => {
  it('refuses non-leaders with "needs the Raid Leader rank" (J61, J64)', async () => {
    const ctx = makePorts([makeSignup({ id: 's_moon' })]);
    const res = await handleLeadsInteraction(
      buttonClick('seat:evt_mc:s_moon:tank:1', RAIDER.discordId),
      ctx.ports,
    );
    expect(replyText(res)).toContain('Raid Leader');
    expect(ctx.ran).toHaveLength(0);
    expect(ctx.mentions).toHaveLength(0);
  });

  it('approves drafted parties on party-approve and triggers a tick (J64)', async () => {
    const ctx = makePorts([]);
    const res = await handleLeadsInteraction(
      buttonClick('party-approve:evt_mc', LEADER.discordId),
      ctx.ports,
    );
    expect(ctx.ran).toEqual([{ name: 'roster-approve', input: { eventId: 'evt_mc' } }]);
    expect(ctx.ticks).toBe(1);
    expect(replyText(res)).toContain('Approved parties');
  });

  it('clears manual groups on party-redraft', async () => {
    const ctx = makePorts([]);
    const res = await handleLeadsInteraction(
      buttonClick('party-redraft:evt_mc', LEADER.discordId),
      ctx.ports,
    );
    expect(ctx.cleared).toEqual(['evt_mc']);
    expect(ctx.ticks).toBe(1);
    expect(replyText(res)).toContain('Redrafted parties');
  });

  it('seats Standby via alsoRoles into dropout group, sets role, and mentions once (J61)', async () => {
    const ctx = makePorts([makeSignup({ id: 's_moon', role: 'healer', alsoRoles: ['tank'] })]);
    const res = await handleLeadsInteraction(
      buttonClick('seat:evt_mc:s_moon:tank:1', LEADER.discordId),
      ctx.ports,
    );
    expect(ctx.ran).toEqual([
      {
        name: 'signup-set',
        input: { eventId: 'evt_mc', characterId: 'c_moon', status: 'accepted', role: 'tank' },
      },
      {
        name: 'roster-move',
        input: { signupId: 's_moon', group: 1 },
      },
    ]);
    expect(ctx.mentions).toEqual([
      {
        channelId: 'ch_signups',
        content: "<@d_moon> You're in for **Molten Core** as **tank**.",
        discordUserId: 'd_moon',
      },
    ]);
    expect(ctx.ticks).toBe(1);
    expect(replyText(res)).toContain('Seated **Moonglade** as **tank** in group 1.');
  });

  it('reports who took the seat when the dropout group is already full', async () => {
    const fullGroup = Array.from({ length: 5 }, (_, i) =>
      makeSignup({
        id: `s_g${i}`,
        characterName: `Player${i}`,
        status: 'accepted',
        roster: 'rostered',
        group: 1,
        updatedAt: 100 + i,
      }),
    );
    const ctx = makePorts([...fullGroup, makeSignup({ id: 's_moon' })]);
    const res = await handleLeadsInteraction(
      buttonClick('seat:evt_mc:s_moon:tank:1', LEADER.discordId),
      ctx.ports,
    );
    expect(replyText(res)).toContain('already taken (taken by **Player4**)');
    expect(ctx.ran).toHaveLength(0);
    expect(ctx.mentions).toHaveLength(0);
  });

  it('refuses seat button when the raid is already full at event.size before mutating signup (#345)', async () => {
    const smallEvent: RaidEvent = { ...EVENT, size: 2 };
    const seated = [0, 1].map((i) =>
      makeSignup({
        id: `s_seated_${i}`,
        memberId: `m_s_${i}`,
        characterId: `c_s_${i}`,
        characterName: `Seated${i}`,
        status: 'accepted',
        roster: 'rostered',
        group: 1,
      }),
    );
    const ctx = makePorts([...seated, makeSignup({ id: 's_moon' })], smallEvent);
    const res = await handleLeadsInteraction(
      buttonClick('seat:evt_mc:s_moon:tank:1', LEADER.discordId),
      ctx.ports,
    );
    expect(replyText(res)).toContain('already full (2/2 seated)');
    expect(ctx.ran).toHaveLength(0);
    expect(ctx.mentions).toHaveLength(0);
  });

  it('surfaces roster-approve rejection (e.g. ROSTER_OVERCOMMITTED) without triggering a tick (#345)', async () => {
    const ctx = makePorts([]);
    ctx.ports.run = async (_caller, name, input) => {
      ctx.ran.push({ name, input });
      return error('ROSTER_OVERCOMMITTED', 'Molten Core has 12 seated for 10 seats', {
        suggestion: 'Move 2 seated players to Standby first',
        retryable: false,
      });
    };
    const res = await handleLeadsInteraction(
      buttonClick('party-approve:evt_mc', LEADER.discordId),
      ctx.ports,
    );
    expect(replyText(res)).toContain('12 seated for 10 seats');
    expect(ctx.ticks).toBe(0);
  });
});
