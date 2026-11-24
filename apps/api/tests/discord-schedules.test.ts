import {
  ApplicationCommandOptionType,
  type Embed,
  type Interaction,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from '@vintage/discord-kit';
import type { Tier } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { raidsCommands } from '@vintage/raids/commands';
import type { RaidEvent, Schedule } from '@vintage/raids/contract';
import { createMemoryRaidsDeps } from '@vintage/raids/testing';
import { fixedClock, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleScheduleAutocomplete,
  handleScheduleInteraction,
  NEEDS_LEADER_SCHEDULE,
  NO_SCHEDULES,
  SCHED_FORM_IDS,
  SCHEDULE_CANCELLED,
  type SchedulePorts,
} from '../src/discord-schedules';

const GUILD = 'guild-test';
const DISCORD_GUILD = '600000000000000001';
/** Mon 26 Oct 2026, 12:00 New York (16:00 UTC). */
const NOW = Date.UTC(2026, 9, 26, 16);

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

let members: Member[];
let deps: ReturnType<typeof createMemoryRaidsDeps>;
let ticks: number;
let ports: SchedulePorts;

beforeEach(() => {
  members = [
    member('rook', 'leader'),
    member('aeryn', 'raider'),
    member('pip', 'member'),
    member('vex', 'leader'),
  ];
  deps = createMemoryRaidsDeps(members);
  const registry = testRegistry(raidsCommands, fixedClock(NOW));
  ticks = 0;
  ports = {
    discordGuildId: DISCORD_GUILD,
    guildId: GUILD,
    memberByDiscordId: async (discordId) => members.find((m) => m.discordId === discordId) ?? null,
    run: (caller, name, input) => registry.execute({ name, input, caller }, deps),
    afterChange: async () => {
      ticks++;
    },
    now: () => NOW,
  };
});

const base = (who: string) => ({
  id: 'i',
  application_id: 'app',
  token: 'token',
  guild_id: DISCORD_GUILD,
  member: { user: { id: `d-${who}`, username: who }, roles: [] },
});

const slash = (who: string, sub: string, options: Record<string, string> = {}): Interaction => ({
  ...base(who),
  type: InteractionType.APPLICATION_COMMAND,
  data: {
    name: 'vintage',
    options: [
      {
        name: 'schedule',
        type: ApplicationCommandOptionType.SUB_COMMAND_GROUP,
        options: [
          {
            name: sub,
            type: ApplicationCommandOptionType.SUB_COMMAND,
            options: Object.entries(options).map(([name, value]) => ({
              name,
              type: ApplicationCommandOptionType.STRING,
              value,
            })),
          },
        ],
      },
    ],
  },
});

const modalSubmit = (
  who: string,
  customId: string,
  fields: { text?: Record<string, string>; select?: Record<string, string[]> },
  preview?: { embeds?: Embed[] },
): Interaction => ({
  ...base(who),
  type: InteractionType.MODAL_SUBMIT,
  ...(preview ? { message: { id: 'm1', ...preview } } : {}),
  data: {
    custom_id: customId,
    components: [
      ...Object.entries(fields.text ?? {}).map(([custom_id, value]) => ({
        type: 18,
        component: { type: 4, custom_id, value },
      })),
      ...Object.entries(fields.select ?? {}).map(([custom_id, values]) => ({
        type: 18,
        component: { type: 3, custom_id, values },
      })),
    ],
  },
});

const click = (who: string, customId: string, preview: { embeds?: Embed[] }): Interaction => ({
  ...base(who),
  type: InteractionType.MESSAGE_COMPONENT,
  message: { id: 'm1', ...preview },
  data: { custom_id: customId, component_type: 2 },
});

const selectHours = (who: string, value: string, preview: { embeds?: Embed[] }): Interaction => ({
  ...base(who),
  type: InteractionType.MESSAGE_COMPONENT,
  message: { id: 'm1', ...preview },
  data: { custom_id: SCHED_FORM_IDS.hours, component_type: 3, values: [value] },
});

const autocomplete = (who: string, sub: string, query: string): Interaction => ({
  ...base(who),
  type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE,
  data: {
    name: 'vintage',
    options: [
      {
        name: 'schedule',
        type: ApplicationCommandOptionType.SUB_COMMAND_GROUP,
        options: [
          {
            name: sub,
            type: ApplicationCommandOptionType.SUB_COMMAND,
            options: [
              {
                name: 'schedule',
                type: ApplicationCommandOptionType.STRING,
                value: query,
                focused: true,
              },
            ],
          },
        ],
      },
    ],
  },
});

type ReplyData = { content?: string; embeds?: Embed[]; components?: unknown[]; flags?: number };

const dataOf = (res: unknown) => (res as { data: ReplyData }).data;

describe('discord schedules (/vintage schedule)', () => {
  it('runs the 2-stage create form, creates the schedule, materializes this week, and triggers a tick', async () => {
    const opened = await handleScheduleInteraction(slash('rook', 'create'), ports);
    expect(opened?.type).toBe(InteractionResponseType.MODAL);
    expect((opened as { data: { custom_id: string; components: unknown[] } }).data.custom_id).toBe(
      SCHED_FORM_IDS.details,
    );
    expect((opened as { data: { components: unknown[] } }).data.components).toHaveLength(5);

    // Stage 1 submit -> preview with 2 action rows (buttons + Length select).
    const step1 = await handleScheduleInteraction(
      modalSubmit('rook', SCHED_FORM_IDS.details, {
        text: { name: 'Raid night', where: 'Molten Core' },
        select: { kind: ['raid'], weekdays: ['mon', 'wed'], time: ['20:00'] },
      }),
      ports,
    );
    expect(step1?.type).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
    const preview1 = dataOf(step1);
    expect(preview1.flags).toBe(MessageFlags.EPHEMERAL);
    expect(preview1.components).toHaveLength(2);
    expect(JSON.stringify(preview1.embeds)).toContain('Mondays and Wednesdays at 8:00 PM');

    // Toggle Open to pugs and pick 4 hours length on preview.
    const toggled = await handleScheduleInteraction(
      click('rook', SCHED_FORM_IDS.access, preview1),
      ports,
    );
    const previewAccess = dataOf(toggled);
    expect(JSON.stringify(previewAccess.embeds)).toContain('Open to pugs');

    const resizedHours = await handleScheduleInteraction(
      selectHours('rook', '4', previewAccess),
      ports,
    );
    const previewHours = dataOf(resizedHours);
    expect(JSON.stringify(previewHours.embeds)).toContain('4 hours');

    // Open stage 2 modal -> 5 fields for raid (Size + Tanks/Healers/Melee/Ranged).
    const stage2Modal = await handleScheduleInteraction(
      click('rook', SCHED_FORM_IDS.next, previewHours),
      ports,
    );
    expect(stage2Modal?.type).toBe(InteractionResponseType.MODAL);
    expect((stage2Modal as { data: { components: unknown[] } }).data.components).toHaveLength(5);

    // Submit stage 2 -> preview at step 2 with Create schedule button.
    const step2 = await handleScheduleInteraction(
      modalSubmit(
        'rook',
        `${SCHED_FORM_IDS.kind}:raid`,
        {
          select: { size: ['40'] },
          text: { tanks: '4', healers: '10', melee: '13', ranged: '13' },
        },
        previewHours,
      ),
      ports,
    );
    const preview2 = dataOf(step2);
    expect(JSON.stringify(preview2.components)).toContain('Create schedule');

    // Click Create schedule -> creates schedule, materializes raids, ticks coordinator.
    const created = await handleScheduleInteraction(
      click('rook', SCHED_FORM_IDS.save, preview2),
      ports,
    );
    expect(dataOf(created).content).toBe(
      "Made **Raid night** (Molten Core, 40-player raid) on Mondays and Wednesdays at 8:00 PM. This week's raids are posting now.",
    );
    expect(ticks).toBe(1);
    const schedules = [...deps.raids.schedules.values()];
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      name: 'Raid night',
      instance: 'Molten Core',
      kind: 'raid',
      access: 'open',
      size: 40,
      durationMinutes: 240,
      roleTargets: { tank: 4, healer: 10, melee: 13, ranged: 13 },
      recurrence: { weekdays: ['mon', 'wed'], time: '20:00' },
    });
    const events = [...deps.raids.events.values()] as RaidEvent[];
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('lists empty and populated schedules for members, and enforces leader tier for mutating subcommands', async () => {
    const empty = await handleScheduleInteraction(slash('pip', 'list'), ports);
    expect(dataOf(empty).content).toBe(NO_SCHEDULES);

    // Raider cannot create, edit, pause, or resume.
    for (const sub of ['create', 'edit', 'pause', 'resume']) {
      const denied = await handleScheduleInteraction(
        slash('aeryn', sub, sub === 'create' ? {} : { schedule: 's1' }),
        ports,
      );
      expect(dataOf(denied).content).toBe(NEEDS_LEADER_SCHEDULE);
    }

    const s1 = await deps.raids.insertSchedule({
      guildId: GUILD,
      name: 'MC Night',
      instance: 'Molten Core',
      kind: 'raid',
      access: 'guild',
      size: 40,
      recurrence: { weekdays: ['mon'], time: '20:00', timeZone: 'America/New_York' },
      durationMinutes: 180,
      timings: { leadDays: 7, reminderHours: [72, 30], digestHours: 24, lockHours: 2 },
      roleTargets: null,
      lootMethodId: null,
      notes: 'Bring fire resist.',
      active: true,
      configVersion: 1,
    });
    const s2 = await deps.raids.insertSchedule({
      guildId: GUILD,
      name: 'BWL Night',
      instance: 'Blackwing Lair',
      kind: 'raid',
      access: 'guild',
      size: 40,
      recurrence: { weekdays: ['wed'], time: '20:00', timeZone: 'America/New_York' },
      durationMinutes: 180,
      timings: { leadDays: 7, reminderHours: [72, 30], digestHours: 24, lockHours: 2 },
      roleTargets: null,
      lootMethodId: null,
      notes: null,
      active: false,
      configVersion: 1,
    });

    const listed = await handleScheduleInteraction(slash('pip', 'list'), ports);
    const content = dataOf(listed).content ?? '';
    expect(content).toContain('**MC Night**');
    expect(content).toContain('Mondays at 8:00 PM (New York) · next <t:');
    expect(content).toContain('**BWL Night** *(paused)*');

    // Autocomplete leads with active on pause, paused on resume, and returns [] for raiders.
    const autoPorts = {
      discordGuildId: DISCORD_GUILD,
      guildId: GUILD,
      memberByDiscordId: ports.memberByDiscordId,
      schedules: () => deps.raids.listSchedules(GUILD),
    };
    const pauseAuto = await handleScheduleAutocomplete(
      autocomplete('rook', 'pause', ''),
      autoPorts,
    );
    expect((pauseAuto as { data: { choices: { value: string }[] } }).data.choices[0]?.value).toBe(
      s1.id,
    );
    const resumeAuto = await handleScheduleAutocomplete(
      autocomplete('rook', 'resume', ''),
      autoPorts,
    );
    expect((resumeAuto as { data: { choices: { value: string }[] } }).data.choices[0]?.value).toBe(
      s2.id,
    );
    const raiderAuto = await handleScheduleAutocomplete(
      autocomplete('aeryn', 'edit', ''),
      autoPorts,
    );
    expect((raiderAuto as { data: { choices: unknown[] } }).data.choices).toEqual([]);
  });

  it('opens schedule edit directly at preview step 2, preserves unshown fields, and supports pause/resume/cancel', async () => {
    const existing = await deps.raids.insertSchedule({
      guildId: GUILD,
      name: 'MC Night',
      instance: 'Molten Core',
      kind: 'raid',
      access: 'guild',
      size: 40,
      recurrence: { weekdays: ['mon'], time: '20:00', timeZone: 'Europe/London' },
      durationMinutes: 180,
      timings: { leadDays: 10, reminderHours: [48], digestHours: 12, lockHours: 3 },
      roleTargets: null,
      lootMethodId: 'loot-1',
      notes: 'Bring fire resist.',
      active: true,
      configVersion: 1,
    });

    // Edit opens straight to step 2 preview with Save schedule.
    const opened = await handleScheduleInteraction(
      slash('rook', 'edit', { schedule: existing.id }),
      ports,
    );
    const preview = dataOf(opened);
    expect(JSON.stringify(preview.components)).toContain('Save schedule');

    // Change only length to 3.5h on preview and save -> unshown fields stay untouched!
    const changedLen = await handleScheduleInteraction(selectHours('rook', '3.5', preview), ports);
    const saved = await handleScheduleInteraction(
      click('rook', SCHED_FORM_IDS.save, dataOf(changedLen)),
      ports,
    );
    expect(dataOf(saved).content).toBe(
      'Saved **MC Night**. Raids already posted keep their old details; change those one at a time on the site.',
    );
    const stored = deps.raids.schedules.get(existing.id) as Schedule;
    expect(stored.durationMinutes).toBe(210);
    expect(stored.recurrence.timeZone).toBe('Europe/London');
    expect(stored.timings).toEqual({
      leadDays: 10,
      reminderHours: [48],
      digestHours: 12,
      lockHours: 3,
    });
    expect(stored.notes).toBe('Bring fire resist.');
    expect(stored.lootMethodId).toBe('loot-1');

    // Cancel clears the preview.
    const cancelled = await handleScheduleInteraction(
      click('rook', SCHED_FORM_IDS.cancel, preview),
      ports,
    );
    expect(dataOf(cancelled).content).toBe(SCHEDULE_CANCELLED);

    // Pause and resume.
    const paused = await handleScheduleInteraction(
      slash('rook', 'pause', { schedule: existing.id }),
      ports,
    );
    expect(dataOf(paused).content).toBe('Paused **MC Night**. No new raids until you resume it.');
    expect(deps.raids.schedules.get(existing.id)?.active).toBe(false);

    const beforeTicks = ticks;
    const resumed = await handleScheduleInteraction(
      slash('rook', 'resume', { schedule: existing.id }),
      ports,
    );
    expect(dataOf(resumed).content).toBe('Resumed **MC Night**. Its next raids post shortly.');
    expect(deps.raids.schedules.get(existing.id)?.active).toBe(true);
    expect(ticks).toBe(beforeTicks + 1);
  });
});
