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
      name: 'vintage',
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

describe('discord-absences (/vintage absence, Mark absent, autocomplete)', () => {
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
          return success({
            absence: DATE_ABSENCE,
            stillSignedUp: [
              {
                eventId: EVENT.id,
                name: EVENT.name,
                startsAt: EVENT.startsAt,
                status: 'accepted',
                coverage: 'away',
              },
            ],
          });
        }
        if (name === 'absence-list') return success({ absences: [DATE_ABSENCE, WEEKLY_LATE] });
        if (name === 'absence-remove') return success({ removed: DATE_ABSENCE });
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
    expect(JSON.stringify(res)).toContain(`absence-mark:absent:${EVENT.id}`);
  });

  it('lists and removes absences from wrapped command responses (#321)', async () => {
    const { ports } = makePorts();
    const listed = await handleAbsenceInteraction(slash('list', []), ports);
    expect(replyText(listed)).toContain('Dec 3 to Dec 7 · work trip');
    expect(replyText(listed)).toContain('15m late Thursdays');

    const removed = await handleAbsenceInteraction(
      slash('remove', [{ name: 'absence', value: 'abs_1' }]),
      ports,
    );
    expect(replyText(removed)).toBe('Removed Dec 3 to Dec 7.');
  });

  it('splits Mark absent and Mark late buttons when a weekly rule mixes away and late nights (#321)', async () => {
    const { ports } = makePorts();
    ports.run = async (_caller, name) => {
      if (name === 'absence-weekly-set') {
        return success({
          absence: {
            ...WEEKLY_LATE,
            nights: [
              { day: 'wed', type: 'away', lateMinutes: null },
              { day: 'thu', type: 'late', lateMinutes: 15 },
            ],
          },
          stillSignedUp: [
            {
              eventId: 'evt_wed',
              name: 'Wed MC',
              startsAt: EVENT.startsAt - 86_400_000,
              status: 'accepted',
              coverage: 'away',
            },
            {
              eventId: 'evt_thu',
              name: 'Thu BWL',
              startsAt: EVENT.startsAt,
              status: 'accepted',
              coverage: { type: 'late', lateMinutes: 15 },
            },
          ],
        });
      }
      return success({});
    };
    const submit: Interaction = {
      id: 'i_wk',
      application_id: 'app1',
      token: 'tok1',
      type: InteractionType.MODAL_SUBMIT,
      guild_id: 'dg1',
      member: { user: { id: RAIDER.discordId, username: 'Cade' }, roles: [] },
      data: {
        custom_id: 'absence-weekly-modal',
        components: [
          {
            type: 18,
            component: { type: 3, custom_id: 'absent_days', values: ['wed'] },
          },
          {
            type: 18,
            component: { type: 3, custom_id: 'late_days', values: ['thu'] },
          },
          {
            type: 18,
            component: { type: 3, custom_id: 'late_minutes', values: ['15'] },
          },
          {
            type: 18,
            component: { type: 4, custom_id: 'reason', value: '' },
          },
        ],
      },
    };
    const res = await handleAbsenceInteraction(submit, ports);
    const json = JSON.stringify(res);
    expect(json).toContain('absence-mark:absent:evt_wed');
    expect(json).toContain('absence-mark:late-15:evt_thu');
    expect(json).not.toContain('absence-mark:absent:evt_wed,evt_thu');
  });

  it('opens the Absence modal with 25-day date selects and submits selected dates (#321)', async () => {
    const { ports, ran } = makePorts();
    // Mon 26 Oct 2026 16:00 UTC = Mon 26 Oct 2026 12:00 America/New_York
    ports.now = () => Date.UTC(2026, 9, 26, 16);
    const opened = await handleAbsenceInteraction(slash('add', []), ports);
    const modalData = (
      opened as {
        type: number;
        data: {
          custom_id: string;
          components: {
            type: number;
            label: string;
            component: {
              type: number;
              custom_id: string;
              required?: boolean;
              options?: { label: string; value: string }[];
            };
          }[];
        };
      }
    ).data;
    expect(modalData.custom_id).toBe('absence-add-modal');
    expect(modalData.components.map((f) => f.label)).toEqual([
      'First day out',
      'Last day out',
      'Reason',
    ]);
    const fromSelect = modalData.components[0]!.component;
    const toSelect = modalData.components[1]!.component;
    expect(fromSelect.type).toBe(3);
    expect(fromSelect.required).toBe(true);
    expect(fromSelect.options).toHaveLength(25);
    expect(fromSelect.options?.[0]).toMatchObject({ label: 'Today', value: '2026-10-26' });
    expect(toSelect.type).toBe(3);
    expect(toSelect.required).toBe(false);
    expect(toSelect.options).toHaveLength(25);

    // Clicking "Absent more days" opens the same date-picker modal.
    const more = await handleAbsenceInteraction(
      {
        id: 'i_more',
        application_id: 'app1',
        token: 'tok1',
        type: InteractionType.MESSAGE_COMPONENT,
        guild_id: 'dg1',
        member: { user: { id: RAIDER.discordId, username: 'Cade' }, roles: [] },
        data: { custom_id: 'absence-more-days', component_type: 2 },
      },
      ports,
    );
    expect((more as { data: { custom_id: string } }).data.custom_id).toBe('absence-add-modal');

    // Submitting selected dates forwards them cleanly to absence-add.
    const submitted = await handleAbsenceInteraction(
      {
        id: 'i_add_sub',
        application_id: 'app1',
        token: 'tok1',
        type: InteractionType.MODAL_SUBMIT,
        guild_id: 'dg1',
        member: { user: { id: RAIDER.discordId, username: 'Cade' }, roles: [] },
        data: {
          custom_id: 'absence-add-modal',
          components: [
            { type: 18, component: { type: 3, custom_id: 'from', values: ['2026-10-28'] } },
            { type: 18, component: { type: 3, custom_id: 'to', values: ['2026-10-30'] } },
            { type: 18, component: { type: 4, custom_id: 'reason', value: 'Out of town' } },
          ],
        },
      },
      ports,
    );
    expect(ran.at(-1)).toEqual({
      name: 'absence-add',
      input: { from: '2026-10-28', to: '2026-10-30', reason: 'Out of town', memberId: undefined },
    });
    expect(replyText(submitted)).toContain("You're absent");
  });

  it('opens the Weekly modal with weekday and late-minutes selects pre-filled from current rule (#321)', async () => {
    const { ports, ran } = makePorts();
    ports.absences = async () => [
      {
        ...WEEKLY_LATE,
        nights: [
          { day: 'wed', type: 'away', lateMinutes: null },
          { day: 'thu', type: 'late', lateMinutes: 15 },
        ],
        reason: 'Work shift',
      },
    ];
    const opened = await handleAbsenceInteraction(slash('weekly', []), ports);
    const fields = (
      opened as {
        data: {
          custom_id: string;
          components: {
            label: string;
            component: {
              type: number;
              custom_id: string;
              value?: string;
              options?: { label: string; value: string; default?: boolean }[];
            };
          }[];
        };
      }
    ).data.components;
    expect(fields.map((f) => f.label)).toEqual([
      'Absent nights',
      'Late nights',
      'How late on late nights',
      'Reason for absent nights',
    ]);
    expect(fields[0]!.component.type).toBe(3);
    expect(fields[0]!.component.options).toHaveLength(7);
    expect(fields[0]!.component.options?.filter((o) => o.default).map((o) => o.value)).toEqual([
      'wed',
    ]);
    expect(fields[1]!.component.options?.filter((o) => o.default).map((o) => o.value)).toEqual([
      'thu',
    ]);
    expect(fields[2]!.component.type).toBe(3);
    expect(fields[2]!.component.options?.map((o) => o.value)).toEqual(['5', '15', '30']);
    expect(fields[2]!.component.options?.find((o) => o.default)?.value).toBe('15');
    expect(fields[3]!.component.value).toBe('Work shift');

    // Picking the same weekday in both selects is refused.
    const dup = await handleAbsenceInteraction(
      {
        id: 'i_dup',
        application_id: 'app1',
        token: 'tok1',
        type: InteractionType.MODAL_SUBMIT,
        guild_id: 'dg1',
        member: { user: { id: RAIDER.discordId, username: 'Cade' }, roles: [] },
        data: {
          custom_id: 'absence-weekly-modal',
          components: [
            { type: 18, component: { type: 3, custom_id: 'absent_days', values: ['wed'] } },
            { type: 18, component: { type: 3, custom_id: 'late_days', values: ['wed'] } },
            { type: 18, component: { type: 3, custom_id: 'late_minutes', values: ['15'] } },
            { type: 18, component: { type: 4, custom_id: 'reason', value: '' } },
          ],
        },
      },
      ports,
    );
    expect(replyText(dup)).toContain('Pick Wednesday as absent or late, not both.');

    // Submitting with empty selects clears the weekly rule.
    ports.run = async (_caller, name, input) => {
      ran.push({ name, input });
      return success({ absence: null, stillSignedUp: [] });
    };
    const cleared = await handleAbsenceInteraction(
      {
        id: 'i_clr',
        application_id: 'app1',
        token: 'tok1',
        type: InteractionType.MODAL_SUBMIT,
        guild_id: 'dg1',
        member: { user: { id: RAIDER.discordId, username: 'Cade' }, roles: [] },
        data: {
          custom_id: 'absence-weekly-modal',
          components: [
            { type: 18, component: { type: 3, custom_id: 'absent_days', values: [] } },
            { type: 18, component: { type: 3, custom_id: 'late_days', values: [] } },
            { type: 18, component: { type: 3, custom_id: 'late_minutes', values: [] } },
            { type: 18, component: { type: 4, custom_id: 'reason', value: '' } },
          ],
        },
      },
      ports,
    );
    expect(ran.at(-1)).toEqual({ name: 'absence-weekly-set', input: { nights: [] } });
    expect(replyText(cleared)).toBe('No weekly nights set.');
  });

  it('keeps Mark absent button custom_id within 100 chars and labels honestly when truncated (#321)', async () => {
    const { ports } = makePorts();
    const longIds = ['a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32)];
    ports.run = async () =>
      success({
        absence: DATE_ABSENCE,
        stillSignedUp: longIds.map((eventId, i) => ({
          eventId,
          name: `Raid ${i + 1}`,
          startsAt: EVENT.startsAt + i * 86_400_000,
          status: 'accepted',
          coverage: 'away',
        })),
      });
    const res = await handleAbsenceInteraction(
      slash('add', [{ name: 'from', value: '2026-12-03' }]),
      ports,
    );
    const rows = (
      res as { data?: { components?: { components?: { custom_id?: string; label?: string }[] }[] } }
    )?.data?.components;
    const btn = rows?.[0]?.components?.[0];
    expect(btn?.custom_id?.length).toBeLessThanOrEqual(100);
    expect(btn?.custom_id).toBe(`absence-mark:absent:${longIds[0]},${longIds[1]}`);
    expect(btn?.label).toBe('Mark 2 of 3 absent');
  });

  it('refuses a raider using member: on /vintage absence add (J54)', async () => {
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

  it('autocompletes own active absences for /vintage absence remove', async () => {
    const { ports } = makePorts();
    const interaction: Interaction = {
      id: 'i2',
      application_id: 'app1',
      token: 'tok1',
      type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE,
      guild_id: 'dg1',
      member: { user: { id: RAIDER.discordId, username: 'Cade' }, roles: [] },
      data: {
        name: 'vintage',
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
