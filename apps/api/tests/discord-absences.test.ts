import {
  ApplicationCommandOptionType,
  type Interaction,
  InteractionType,
} from '@vintage/discord-kit';
import { success } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import type { Absence, RaidEvent, Signup } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import {
  type AbsencePorts,
  handleAbsenceAutocomplete,
  handleAbsenceInteraction,
} from '../src/discord-absences';
import { handleSignupInteraction, type SignupPorts } from '../src/discord-signups';

const RAIDER: Member = {
  id: 'm_cade',
  guildId: 'g1',
  discordId: 'd_cade',
  displayName: 'Cade',
  rank: 'raider',
  tier: 'raider',
  roleIds: [],
  rankSince: null,
  inServer: true,
  prefs: { dmOptOut: false },
  syncedAt: 0,
};

const LEADER: Member = {
  ...RAIDER,
  id: 'm_ana',
  discordId: 'd_ana',
  displayName: 'Ana',
  rank: 'officer',
  tier: 'officer',
};

const FRIEND: Member = {
  ...RAIDER,
  id: 'm_wren',
  discordId: 'd_wren',
  displayName: 'Wren',
  rank: 'friend',
  tier: 'friend',
};

const CHAR: Character = {
  id: 'c_cade',
  guildId: 'g1',
  memberId: 'm_cade',
  name: 'Cade',
  class: 'druid',
  spec: 'restoration',
  role: 'healer',
  alsoRoles: ['tank'],
  isMain: true,
};

const EVENT: RaidEvent = {
  id: 'evt_thu',
  guildId: 'g1',
  scheduleId: null,
  name: 'Raid night',
  instance: 'Molten Core',
  kind: 'raid',
  access: 'guild',
  size: 40,
  roleTargets: { tank: 4, healer: 10, melee: 13, ranged: 13 },
  // Thu Dec 3, 2026 20:00 America/New_York (EST = UTC-5 -> Fri Dec 4 01:00 UTC)
  startsAt: Date.UTC(2026, 11, 4, 1, 0),
  durationMinutes: 180,
  status: 'open',
  notes: null,
  lootMethodId: null,
  configVersion: 1,
  rosterApprovedAt: null,
  rosterApprovedBy: null,
};

const WEEKLY_LATE: Absence = {
  id: 'abs_wk',
  guildId: 'g1',
  memberId: 'm_cade',
  kind: 'weekly',
  from: null,
  to: null,
  nights: [{ day: 'thu', type: 'late', lateMinutes: 15 }],
  timeZone: 'America/New_York',
  reason: null,
  createdBy: 'm_cade',
  createdAt: 0,
  endedAt: null,
};

const DATE_ABSENCE: Absence = {
  id: 'abs_1',
  guildId: 'g1',
  memberId: 'm_cade',
  kind: 'dates',
  from: '2026-12-03',
  to: '2026-12-07',
  nights: null,
  timeZone: 'America/New_York',
  reason: 'work trip',
  createdBy: 'm_cade',
  createdAt: 0,
  endedAt: null,
};

function slash(
  sub: string,
  options: { name: string; value: string }[],
  discordId = RAIDER.discordId,
): Interaction {
  return {
    id: 'i1',
    application_id: 'app1',
    token: 'tok1',
    type: InteractionType.APPLICATION_COMMAND,
    guild_id: 'dg1',
    member: { user: { id: discordId, username: discordId }, roles: [] },
    data: {
      name: 'random',
      options: [
        {
          type: ApplicationCommandOptionType.SUB_COMMAND_GROUP,
          name: 'absence',
          options: [
            {
              type: ApplicationCommandOptionType.SUB_COMMAND,
              name: sub,
              options: options.map((o) => ({
                type: ApplicationCommandOptionType.STRING,
                name: o.name,
                value: o.value,
              })),
            },
          ],
        },
      ],
    },
  };
}

function replyText(res: unknown): string {
  const r = res as { data?: { content?: string } } | null;
  return r?.data?.content ?? '';
}

describe('discord-absences (/random absence, Mark absent, autocomplete)', () => {
  function makePorts() {
    const ran: { name: string; input: unknown }[] = [];
    const ports: AbsencePorts = {
      discordGuildId: 'dg1',
      guildId: 'g1',
      memberByDiscordId: async (id) => [RAIDER, LEADER].find((m) => m.discordId === id) ?? null,
      absences: async () => [DATE_ABSENCE, WEEKLY_LATE],
      characters: async () => [CHAR],
      signup: async () => ({ characterId: CHAR.id }),
      run: async (_caller, name, input) => {
        ran.push({ name, input });
        if (name === 'absence-add') {
          return success({ absence: DATE_ABSENCE, stillSignedUp: [EVENT] });
        }
        if (name === 'absence-list') return success([DATE_ABSENCE, WEEKLY_LATE]);
        if (name === 'absence-remove') return success(DATE_ABSENCE);
        return success({});
      },
      afterChange: async () => {},
    };
    return { ports, ran };
  }

  it('adds a date absence and offers Mark absent when stillSignedUp is non-empty (J53)', async () => {
    const { ports, ran } = makePorts();
    const res = await handleAbsenceInteraction(
      slash('add', [
        { name: 'from', value: '2026-12-03' },
        { name: 'to', value: '2026-12-07' },
        { name: 'reason', value: 'work trip' },
      ]),
      ports,
    );
    expect(ran[0]).toEqual({
      name: 'absence-add',
      input: { from: '2026-12-03', to: '2026-12-07', reason: 'work trip', memberId: undefined },
    });
    expect(replyText(res)).toContain("You're absent Dec 3 to Dec 7.");
    expect(replyText(res)).toContain('still signed up for Raid night');
  });

  it('refuses a raider using member: on /random absence add (J54)', async () => {
    const { ports, ran } = makePorts();
    const res = await handleAbsenceInteraction(
      slash('add', [
        { name: 'from', value: '2026-12-03' },
        { name: 'member', value: LEADER.discordId },
      ]),
      ports,
    );
    expect(replyText(res)).toContain('Raid Leader rank');
    expect(ran).toHaveLength(0);
  });

  it('autocompletes own active absences for /random absence remove', async () => {
    const { ports } = makePorts();
    const interaction: Interaction = {
      id: 'i2',
      application_id: 'app1',
      token: 'tok1',
      type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE,
      guild_id: 'dg1',
      member: { user: { id: RAIDER.discordId, username: 'Cade' }, roles: [] },
      data: {
        name: 'random',
        options: [
          {
            type: ApplicationCommandOptionType.SUB_COMMAND_GROUP,
            name: 'absence',
            options: [
              {
                type: ApplicationCommandOptionType.SUB_COMMAND,
                name: 'remove',
                options: [
                  {
                    type: ApplicationCommandOptionType.STRING,
                    name: 'absence',
                    value: 'dec',
                    focused: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const res = await handleAbsenceAutocomplete(interaction, ports);
    const choices = (res as { data?: { choices?: { name: string; value: string }[] } })?.data
      ?.choices;
    expect(choices).toEqual([{ name: 'Dec 3 to Dec 7 · work trip', value: 'abs_1' }]);
  });
});

describe('discord-signups (weekly late on Accept, On time this week, Friend on-the-spot sync)', () => {
  function makeSignupPorts(overrides: Partial<SignupPorts> = {}) {
    const sets: unknown[] = [];
    const ports: SignupPorts = {
      discordGuildId: 'dg1',
      guildId: 'g1',
      memberByDiscordId: async (id) => (id === RAIDER.discordId ? RAIDER : null),
      characters: async () => [CHAR],
      event: async () => EVENT,
      signup: async () => null,
      signups: async () => [],
      signupSuggest: async () =>
        success({
          characterId: CHAR.id,
          characterName: CHAR.name,
          spec: CHAR.spec,
          role: CHAR.role,
          reason: 'your main',
        }),
      signupSet: async (_caller, input) => {
        sets.push(input);
        const s: Signup = {
          id: 's1',
          guildId: 'g1',
          eventId: EVENT.id,
          memberId: RAIDER.id,
          characterId: CHAR.id,
          characterName: CHAR.name,
          class: CHAR.class,
          spec: CHAR.spec,
          role: CHAR.role,
          rolePicked: false,
          alsoRoles: CHAR.alsoRoles,
          status: input.status,
          lateMinutes: input.lateMinutes ?? null,
          note: input.note ?? null,
          signedUpAt: 0,
          updatedAt: 0,
          updatedBy: RAIDER.id,
          roster: 'pending',
          group: null,
          queued: false,
          promotedAt: null,
        };
        return success(s);
      },
      characterAdd: async () => success(CHAR),
      absences: async () => [WEEKLY_LATE],
      afterChange: async () => {},
      ...overrides,
    };
    return { ports, sets };
  }

  it('signs up as Late (15m) with On time this week button when Accept hits a weekly late night (J56)', async () => {
    const { ports, sets } = makeSignupPorts();
    const click: Interaction = {
      id: 'i3',
      application_id: 'app1',
      token: 'tok1',
      type: InteractionType.MESSAGE_COMPONENT,
      guild_id: 'dg1',
      member: { user: { id: RAIDER.discordId, username: 'Cade' }, roles: [] },
      data: { custom_id: `signup:${EVENT.id}:accepted`, component_type: 2 },
    };
    const res = await handleSignupInteraction(click, ports);
    expect(sets[0]).toMatchObject({ status: 'late', lateMinutes: 15 });
    expect(replyText(res)).toContain('15 minutes');
    const rows = (res as { data?: { components?: unknown[] } })?.data?.components ?? [];
    // <= 5 rows, includes Can also play + On time this week.
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(rows)).toContain('signup-also:');
    expect(JSON.stringify(rows)).toContain('signup-ontime:');
  });

  it('syncs a new Friend on the spot when they press Accept on an open raid (J70)', async () => {
    let synced = false;
    const openRaid: RaidEvent = { ...EVENT, access: 'open' };
    const { ports } = makeSignupPorts({
      event: async () => openRaid,
      memberByDiscordId: async () => null,
      syncMember: async (input) => {
        synced = true;
        expect(input.discordId).toBe(FRIEND.discordId);
        expect(input.roleIds).toEqual(['role_friend']);
        return FRIEND;
      },
    });
    const click: Interaction = {
      id: 'i4',
      application_id: 'app1',
      token: 'tok1',
      type: InteractionType.MESSAGE_COMPONENT,
      guild_id: 'dg1',
      member: {
        user: { id: FRIEND.discordId, username: 'Wren' },
        roles: ['role_friend'],
      },
      data: { custom_id: `signup:${openRaid.id}:accepted`, component_type: 2 },
    };
    const res = await handleSignupInteraction(click, ports);
    expect(synced).toBe(true);
    expect(replyText(res)).toContain('Accepted');
  });
});
