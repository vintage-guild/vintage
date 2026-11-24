// Recurring raid schedules from Discord (`/vintage schedule ...`, raid-scheduling.plan.md §2).
// Pure over ports, so Convex (`convex/discord.ts`) and the JTBD host run the same flow:
//   /vintage schedule create         → stage 1 modal `schedform:new` (Name, Kind, Where, Nights,
//                                      Time) → preview (Set up schedule, Edit details, Open to
//                                      pugs toggle, Cancel, Length select) → stage 2 modal
//                                      `schedform:kind:<kind>` (Size, Tanks, Healers, Melee,
//                                      Ranged) → preview → Create schedule → schedule-create,
//                                      schedule-materialize({ scheduleId }), afterChange()
//   /vintage schedule list           → schedule-list({ includeInactive: true }), showing nights,
//                                      time, paused status, and nextStartsAt
//   /vintage schedule edit <id>      → filled-in preview straight at step 2 (Save schedule, Edit
//                                      details, Edit size and comp, Open to pugs, Cancel, Length);
//                                      sends only changed fields to schedule-update so unshown
//                                      settings (timeZone, timings, notes, lootMethodId) stay intact
//   /vintage schedule pause <id>     → schedule-update({ scheduleId, active: false })
//   /vintage schedule resume <id>    → schedule-update({ scheduleId, active: true }),
//                                      schedule-materialize({ scheduleId }), afterChange()
import {
  actionRow,
  autocompleteResult,
  ButtonStyle,
  button,
  type Embed,
  embed,
  focusedOption,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  type Label,
  label,
  labelledTextInput,
  type MessageData,
  modal,
  modalSelections,
  modalValues,
  radioGroup,
  reply,
  stringSelect,
  subcommandPath,
  updateMessage,
} from '@vintage/discord-kit';
import { type Caller, tierAllows } from '@vintage/guild-kit';
import {
  AKind,
  accessOf,
  defaultRoleTargets,
  EVENT_KINDS,
  type EventKind,
  hasSplitDpsTargets,
  instanceOptional,
  KIND_LABELS,
  KIND_SIZES,
  kindNoun,
  MAX_EVENT_SIZE,
  RAID_ACCESS,
  type RaidAccess,
  type RoleTargets,
  type Schedule,
  sizeFits,
  sizeLabel,
  sizesText,
  totalRoleTargets,
  WEEKDAYS,
  type Weekday,
} from '@vintage/raids/contract';
import { z } from 'zod';
import {
  commandOptions,
  discordCaller,
  ephemeral,
  failureText,
  type MemberPorts,
  type OptionValues,
  SLASH_COMMAND,
} from './discord-common';
import { hoursOptions, timeOptions, timeText, usualSize, zoneCity } from './discord-event-form';
import {
  DEFAULT_RAID_HOURS,
  type EventPorts,
  type GuildClock,
  guildClock,
  rolesText,
  roleTargetsFrom,
  whatText,
  when,
} from './discord-events';

export const SCHEDULE_GROUP = 'schedule';
export const SCHED_FORM_PREFIX = 'schedform';
export const SCHED_FORM_IDS = {
  details: `${SCHED_FORM_PREFIX}:new`,
  kind: `${SCHED_FORM_PREFIX}:kind`,
  next: `${SCHED_FORM_PREFIX}:next`,
  edit: `${SCHED_FORM_PREFIX}:edit`,
  editKind: `${SCHED_FORM_PREFIX}:edit-kind`,
  access: `${SCHED_FORM_PREFIX}:access`,
  hours: `${SCHED_FORM_PREFIX}:hours`,
  save: `${SCHED_FORM_PREFIX}:save`,
  cancel: `${SCHED_FORM_PREFIX}:cancel`,
} as const;

export const NEEDS_LEADER_SCHEDULE =
  'Managing schedules from Discord needs the Raid Leader rank or higher. Ask a raid leader or officer.';
export const NO_SCHEDULES = 'No schedules yet. Use `/vintage schedule create` to add one.';
export const SCHEDULE_CANCELLED = 'Cancelled, nothing was saved.';

const DRAFT_TAG = 's1.';
const MAX = { name: 60, where: 60, hours: 4, count: 2 } as const;
const COUNTS = ['tanks', 'healers', 'melee', 'ranged'] as const;
type Count = (typeof COUNTS)[number];
const COUNT_LABELS: Record<Count, string> = {
  tanks: 'Tanks',
  healers: 'Healers',
  melee: 'Melee',
  ranged: 'Ranged',
};

const WEEKDAY_ORDER: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_PLURAL: Record<Weekday, string> = {
  sun: 'Sundays',
  mon: 'Mondays',
  tue: 'Tuesdays',
  wed: 'Wednesdays',
  thu: 'Thursdays',
  fri: 'Fridays',
  sat: 'Saturdays',
};
const WEEKDAY_NAME: Record<Weekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};
const WEEKDAY_SHORT: Record<Weekday, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const isWhole = (s: string) => /^\d{1,2}$/.test(s);

const scheduleDraftSchema = z
  .object({
    user: z.string().min(1).max(32),
    scheduleId: z.string().min(1).max(64).nullable(),
    name: z.string().max(MAX.name),
    kind: z.enum(EVENT_KINDS),
    access: z.enum(RAID_ACCESS),
    where: z.string().max(MAX.where),
    weekdays: z.array(z.enum(WEEKDAYS)).min(1).max(7),
    time: z.string().regex(HH_MM),
    timeZone: z.string().min(1).max(80),
    hours: z.string().max(MAX.hours),
    size: z.string().max(MAX.count),
    tanks: z.string().max(MAX.count),
    healers: z.string().max(MAX.count),
    melee: z.string().max(MAX.count),
    ranged: z.string().max(MAX.count),
    step: z.union([z.literal(1), z.literal(2)]),
  })
  .strict();

export type ScheduleDraft = z.infer<typeof scheduleDraftSchema>;

export type SchedulePorts = EventPorts;

export interface ScheduleAutocompletePorts extends MemberPorts {
  schedules(): Promise<Schedule[]>;
}

type ScheduleListItem = Schedule & { nextStartsAt?: number | null };

// ── Draft encoding ───────────────────────────────────────────────────────────────────────────

const toBase64Url = (text: string) => {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string) => {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

export const encodeScheduleDraft = (draft: ScheduleDraft) =>
  `${DRAFT_TAG}${toBase64Url(JSON.stringify(draft))}`;

export function decodeScheduleDraft(footer: string | undefined): ScheduleDraft | null {
  const match = /(?:^|\s)s1\.([A-Za-z0-9_-]{1,1500})$/.exec(footer ?? '');
  if (!match) return null;
  try {
    const parsed = scheduleDraftSchema.safeParse(JSON.parse(fromBase64Url(match[1]!)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const footerOf = (interaction: Interaction) => interaction.message?.embeds?.[0]?.footer?.text;
const draftOf = (interaction: Interaction) => decodeScheduleDraft(footerOf(interaction));

// ── Formatting & reading helpers ─────────────────────────────────────────────────────────────

const orderedWeekdays = (days: readonly Weekday[]): Weekday[] =>
  WEEKDAY_ORDER.filter((d) => days.includes(d));

/** "Mondays and Wednesdays", "Mondays, Wednesdays, and Fridays". */
export function nightsList(days: readonly Weekday[]): string {
  const words = orderedWeekdays(days).map((d) => WEEKDAY_PLURAL[d]);
  if (words.length <= 1) return words[0] ?? '';
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(', ')}, and ${words.at(-1)}`;
}

function minutesOf(hours: string): number | null {
  const typed = hours.trim().toLowerCase().replace(/\s*h$/, '');
  if (!typed) return DEFAULT_RAID_HOURS * 60;
  if (!/^\d+(\.\d+)?$/.test(typed)) return null;
  const minutes = Math.round(Number(typed) * 60);
  return minutes >= 30 && minutes <= 8 * 60 ? minutes : null;
}

const hoursText = (minutes: number) => {
  const h = Number((minutes / 60).toFixed(2));
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
};

function sizeOf(draft: ScheduleDraft): number | null {
  const typed = draft.size.trim();
  if (!typed) return usualSize(draft.kind);
  return isWhole(typed) ? Number(typed) : Number.NaN;
}

function countValues(draft: ScheduleDraft, size: number | null): OptionValues {
  const values: OptionValues = {};
  if (size !== null) values.size = size;
  for (const c of COUNTS) {
    const typed = draft[c].trim();
    if (isWhole(typed)) values[c] = Number(typed);
  }
  return values;
}

function targetsOfDraft(draft: ScheduleDraft, size: number | null): RoleTargets {
  const usual = defaultRoleTargets(draft.kind, size);
  return roleTargetsFrom(countValues(draft, size), draft.kind) ?? usual;
}

const sameTargets = (a: RoleTargets | null, b: RoleTargets | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export interface ScheduleDraftCheck {
  problems: string[];
  size: number | null;
  targets: RoleTargets;
  countsTyped: boolean;
  minutes: number | null;
  fields: {
    name: string;
    instance: string;
    kind: EventKind;
    access: RaidAccess;
    size: number | null;
    roleTargets: RoleTargets | null;
    weekdays: Weekday[];
    time: string;
    timeZone: string;
    durationMinutes: number;
  } | null;
}

function scheduleCompProblems(
  draft: ScheduleDraft,
  typedSize: number | null,
  size: number | null,
  targets: RoleTargets,
): string[] {
  const problems: string[] = [];
  if (Number.isNaN(typedSize) || !sizeFits(draft.kind, typedSize)) {
    problems.push(
      draft.kind === 'other'
        ? `An event is 1 to ${MAX_EVENT_SIZE} players, or leave the size empty for an open one.`
        : `${AKind(draft.kind)} is ${sizesText(draft.kind)} players.`,
    );
  }
  if (COUNTS.some((c) => draft[c].trim() && !isWhole(draft[c].trim()))) {
    problems.push('Tank, healer, melee, and ranged counts are whole numbers, 0 or more.');
  }
  if (size !== null && !Number.isNaN(typedSize) && totalRoleTargets(targets) > size) {
    problems.push(`The counts add up to more than ${size} players.`);
  }
  return problems;
}

export function checkScheduleDraft(draft: ScheduleDraft): ScheduleDraftCheck {
  const minutes = minutesOf(draft.hours);
  const typedSize = sizeOf(draft);
  const size = Number.isNaN(typedSize) ? null : typedSize;
  const targets = targetsOfDraft(draft, size);
  const countsTyped = !sameTargets(targets, defaultRoleTargets(draft.kind, size));
  const problems: string[] = [];

  if (!draft.name.trim()) problems.push(`Give the ${kindNoun(draft.kind)} schedule a name.`);
  if (!draft.where.trim() && !instanceOptional(draft.kind)) {
    problems.push('Say where it runs, like Molten Core.');
  }
  if (draft.weekdays.length === 0) problems.push('Pick at least one night.');
  if (minutes === null) problems.push('Length is half an hour to 8 hours.');
  problems.push(...scheduleCompProblems(draft, typedSize, size, targets));

  if (problems.length > 0 || minutes === null) {
    return { problems, size, targets, countsTyped, minutes, fields: null };
  }
  return {
    problems,
    size,
    targets,
    countsTyped,
    minutes,
    fields: {
      name: draft.name.trim(),
      instance: draft.where.trim(),
      kind: draft.kind,
      access: draft.access,
      size,
      roleTargets: countsTyped ? targets : null,
      weekdays: orderedWeekdays(draft.weekdays),
      time: draft.time,
      timeZone: draft.timeZone,
      durationMinutes: minutes,
    },
  };
}

export function draftFromSchedule(user: string, schedule: Schedule): ScheduleDraft {
  const saved = schedule.roleTargets;
  const split = saved && hasSplitDpsTargets(saved);
  return {
    user,
    scheduleId: schedule.id,
    name: schedule.name,
    kind: schedule.kind,
    access: accessOf(schedule),
    where: schedule.instance,
    weekdays: orderedWeekdays(schedule.recurrence.weekdays),
    time: schedule.recurrence.time,
    timeZone: schedule.recurrence.timeZone,
    hours: String(Number((schedule.durationMinutes / 60).toFixed(2))),
    size: schedule.size === null ? '' : String(schedule.size),
    tanks: saved ? String(saved.tank) : '',
    healers: saved ? String(saved.healer) : '',
    melee: split ? String(saved.melee) : '',
    ranged: split ? String(saved.ranged) : '',
    step: 2,
  };
}

// ── Modals & preview ─────────────────────────────────────────────────────────────────────────

const KIND_DESCRIPTIONS: Record<EventKind, string> = {
  raid: '10, 20 or 40 players',
  dungeon: '5 players',
  battleground: '10, 15 or 40 players, no tanks',
  other: 'Any size or open; where is optional',
};

const value = (text: string | undefined) => (text ? { value: text } : {});

/** Stage 1 modal (5/5): Name, Kind, Where, Nights (weekday multi-select), Time. */
export function scheduleDetailsForm(
  draft: Partial<ScheduleDraft>,
  clock: GuildClock,
): InteractionResponse {
  const kind = draft.kind ?? 'raid';
  const zone = draft.timeZone ?? clock.zone;
  const selectedDays = new Set(draft.weekdays ?? []);
  const kinds = EVENT_KINDS.map((k) => ({
    label: KIND_LABELS[k],
    value: k,
    description: KIND_DESCRIPTIONS[k],
    ...(k === kind ? { default: true } : {}),
  }));
  const dayOptions = WEEKDAY_ORDER.map((day) => ({
    label: WEEKDAY_NAME[day],
    value: day,
    ...(selectedDays.has(day) ? { default: true } : {}),
  }));
  return modal(
    SCHED_FORM_IDS.details,
    draft.scheduleId ? 'Edit schedule' : 'New schedule',
    label(
      'Name',
      labelledTextInput('name', {
        required: true,
        max_length: MAX.name,
        placeholder: 'Raid night',
        ...value(draft.name),
      }),
    ),
    label('Kind', radioGroup('kind', kinds)),
    label(
      'Where',
      labelledTextInput('where', {
        required: false,
        max_length: MAX.where,
        placeholder: 'Molten Core',
        ...value(draft.where),
      }),
      'Needed except for Event',
    ),
    label(
      'Nights',
      stringSelect('weekdays', dayOptions, {
        placeholder: 'Pick one or more nights',
        min_values: 1,
        max_values: 7,
      }),
    ),
    label(
      `Time (${zoneCity(zone)})`.slice(0, 45),
      stringSelect('time', timeOptions(clock.time, draft.time)),
      `In ${zone}`.slice(0, 100),
    ),
  );
}

const countsFor = (kind: EventKind): readonly Count[] =>
  kind === 'battleground' ? ['healers', 'melee', 'ranged'] : COUNTS;

const onlySize = (kind: EventKind) =>
  kind !== 'other' && KIND_SIZES[kind].length === 1 ? KIND_SIZES[kind][0]! : null;

function shownCounts(draft: ScheduleDraft): Record<Count, string> {
  const size = sizeOf(draft);
  const targets = targetsOfDraft(draft, Number.isInteger(size) ? size : null);
  const split = hasSplitDpsTargets(targets);
  return {
    tanks: draft.tanks.trim() || String(targets.tank),
    healers: draft.healers.trim() || String(targets.healer),
    melee: draft.melee.trim() || (split ? String(targets.melee) : ''),
    ranged: draft.ranged.trim() || (split ? String(targets.ranged) : ''),
  };
}

function sizeField(draft: ScheduleDraft): Label | null {
  const { kind } = draft;
  if (kind === 'other') {
    return label(
      'Size',
      labelledTextInput('size', {
        required: false,
        max_length: MAX.count,
        placeholder: 'Empty for open: no cap',
        ...value(draft.size.trim()),
      }),
    );
  }
  if (onlySize(kind) !== null) return null;
  const size = sizeOf(draft);
  const options = KIND_SIZES[kind].map((n) => ({
    label: `${n} players`,
    value: String(n),
    ...(n === size ? { default: true } : {}),
  }));
  return label(
    'Size',
    options.length <= 10 ? radioGroup('size', options) : stringSelect('size', options),
  );
}

/** Stage 2 modal (5/5 for raid/other, 4/5 for dungeon/BG): Size, Tanks, Healers, Melee, Ranged. */
export function scheduleKindForm(draft: ScheduleDraft): InteractionResponse {
  const { kind } = draft;
  const size = sizeField(draft);
  const single = onlySize(kind);
  const shown = shownCounts(draft);
  const asked = countsFor(kind);
  const counts = asked.map((c) => {
    const isSplit = c === 'melee' || c === 'ranged';
    const prefill = kind === 'other' && !draft[c].trim() ? '' : shown[c];
    return label(
      COUNT_LABELS[c],
      labelledTextInput(c, {
        required: false,
        max_length: MAX.count,
        placeholder: kind === 'other' ? '0' : isSplit ? 'Optional (split DPS)' : shown[c],
        ...value(prefill),
      }),
    );
  });
  const title = `${KIND_LABELS[kind]} comp${single ? ` (${single} players)` : ''}`;
  const fields = size ? [size, ...counts] : counts;
  return modal(`${SCHED_FORM_IDS.kind}:${kind}`, title, ...fields);
}

function readDetailsForm(
  interaction: Interaction,
  user: string,
  earlier: ScheduleDraft | null,
  defaultZone: string,
): ScheduleDraft | null {
  const text = modalValues(interaction);
  const picked = modalSelections(interaction);
  const kind = picked.kind?.[0];
  const same = earlier && earlier.kind === kind;
  const parsed = scheduleDraftSchema.safeParse({
    user,
    scheduleId: earlier?.scheduleId ?? null,
    name: (text.name ?? '').trim(),
    kind,
    access: earlier ? earlier.access : 'guild',
    where: (text.where ?? '').trim(),
    weekdays: picked.weekdays ?? [],
    time: picked.time?.[0],
    timeZone: earlier ? earlier.timeZone : defaultZone,
    hours: earlier ? earlier.hours : String(DEFAULT_RAID_HOURS),
    ...(same
      ? {
          size: earlier.size,
          tanks: earlier.tanks,
          healers: earlier.healers,
          melee: earlier.melee,
          ranged: earlier.ranged,
        }
      : { size: '', tanks: '', healers: '', melee: '', ranged: '' }),
    step: same ? earlier.step : earlier?.scheduleId ? 2 : 1,
  });
  return parsed.success ? parsed.data : null;
}

function readKindForm(draft: ScheduleDraft, interaction: Interaction): ScheduleDraft {
  const text = modalValues(interaction);
  const picked = modalSelections(interaction);
  const shown = shownCounts(draft);
  const size =
    draft.kind === 'other'
      ? (text.size ?? '')
      : onlySize(draft.kind) !== null
        ? ''
        : (picked.size?.[0] ?? '');
  const next: ScheduleDraft = { ...draft, size: size.trim().slice(0, MAX.count), step: 2 };
  const asked = countsFor(draft.kind);
  const typed = (c: Count) => (text[c] ?? '').trim().slice(0, MAX.count);
  const asShown = (c: Count) => typed(c) === shown[c] || (!typed(c) && !draft[c].trim());
  const touched = asked.some((c) => !asShown(c));
  for (const c of COUNTS) {
    if (!asked.includes(c)) next[c] = '';
    else next[c] = touched ? typed(c) : draft[c];
  }
  return next;
}

function previewSizeText(draft: ScheduleDraft, size: number | null): string {
  if (size !== null) return sizeLabel(draft.kind, size);
  return draft.kind === 'other' ? 'Open: no cap' : 'Not set';
}

function previewDescription(draft: ScheduleDraft, problems: readonly string[], primary: string) {
  if (draft.step !== 2) return '**Set up schedule** next for its size and comp.';
  if (problems.length) return `Fix what’s below, then **${primary}**.`;
  return draft.scheduleId !== null
    ? 'Check it, then **Save schedule**. Already-posted raids keep their old details.'
    : 'Check it, then **Create schedule**. This week’s raids post right away.';
}

/** Preview message (2 of 5 action rows): Row 1 buttons + Open to pugs toggle; Row 2 Length select. */
export function schedulePreviewMessage(draft: ScheduleDraft, refusal?: string): MessageData {
  const check = checkScheduleDraft(draft);
  const problems = refusal ? [...check.problems, refusal] : check.problems;
  const primaryLabel = draft.scheduleId !== null ? 'Save schedule' : 'Create schedule';
  const roles = `${rolesText(check.targets)}${check.countsTyped ? '' : ' (the usual comp)'}`;
  const fields = [
    { name: 'Kind', value: KIND_LABELS[draft.kind], inline: true },
    { name: 'Where', value: draft.where.trim() || 'Anywhere', inline: true },
    {
      name: 'Nights',
      value: `${nightsList(draft.weekdays)} at ${timeText(draft.time)} (${zoneCity(draft.timeZone)})`,
      inline: false,
    },
    { name: 'Size', value: previewSizeText(draft, check.size), inline: true },
    {
      name: 'Length',
      value: check.minutes === null ? 'Not readable yet' : hoursText(check.minutes),
      inline: true,
    },
    {
      name: 'Access',
      value: draft.access === 'open' ? 'Open to pugs' : 'Guild only',
      inline: true,
    },
    { name: 'Roles', value: roles, inline: false },
    ...(problems.length
      ? [{ name: 'Fix before saving', value: problems.map((p) => `• ${p}`).join('\n') }]
      : []),
  ];
  const card: Embed = embed({
    title: draft.name.trim() || `New ${kindNoun(draft.kind)} schedule`,
    description: previewDescription(draft, problems, primaryLabel),
    fields,
    footer: { text: `Only you can see this draft. ${encodeScheduleDraft(draft)}` },
  });
  const toggle = button(
    SCHED_FORM_IDS.access,
    draft.access === 'open' ? 'Open to pugs: On' : 'Open to pugs: Off',
    draft.access === 'open' ? ButtonStyle.PRIMARY : ButtonStyle.SECONDARY,
  );
  const buttons =
    draft.step === 2
      ? [
          button(SCHED_FORM_IDS.save, primaryLabel, ButtonStyle.SUCCESS, {
            disabled: problems.length > 0,
          }),
          button(SCHED_FORM_IDS.edit, 'Edit details'),
          button(SCHED_FORM_IDS.editKind, 'Edit size and comp'),
          toggle,
          button(SCHED_FORM_IDS.cancel, 'Cancel'),
        ]
      : [
          button(SCHED_FORM_IDS.next, 'Set up schedule', ButtonStyle.PRIMARY),
          button(SCHED_FORM_IDS.edit, 'Edit details'),
          toggle,
          button(SCHED_FORM_IDS.cancel, 'Cancel'),
        ];
  return {
    embeds: [card],
    components: [
      actionRow(...buttons),
      actionRow(
        stringSelect(SCHED_FORM_IDS.hours, hoursOptions(draft.hours), { placeholder: 'Length' }),
      ),
    ],
    allowed_mentions: { parse: [] },
  };
}

// ── Schedule lookup & commands ───────────────────────────────────────────────────────────────

async function allSchedules(ports: SchedulePorts, caller: Caller): Promise<ScheduleListItem[]> {
  const res = await ports.run(caller, 'schedule-list', { includeInactive: true });
  return res.success ? ((res.data as ScheduleListItem[] | undefined) ?? []) : [];
}

function findSchedule(list: readonly ScheduleListItem[], query: string): ScheduleListItem | null {
  const q = query.trim();
  if (!q) return null;
  return (
    list.find((s) => s.id === q) ??
    list.find((s) => s.name.toLowerCase() === q.toLowerCase()) ??
    null
  );
}

const NOT_FOUND =
  'I couldn’t find that schedule. Pick one from the suggestions, or run `/vintage schedule list`.';

async function listSchedules(ports: SchedulePorts, caller: Caller): Promise<InteractionResponse> {
  const res = await ports.run(caller, 'schedule-list', { includeInactive: true });
  if (!res.success) {
    return ephemeral(failureText(res, 'Listing schedules needs the Member rank or higher.'));
  }
  const items = (res.data as ScheduleListItem[] | undefined) ?? [];
  if (items.length === 0) return ephemeral(NO_SCHEDULES);
  const lines = items.map((s) => {
    const paused = s.active ? '' : ' *(paused)*';
    const next = s.active && s.nextStartsAt ? ` · next ${when(s.nextStartsAt)}` : '';
    return (
      `• **${s.name}**${paused} (${whatText(s)}) — ` +
      `${nightsList(s.recurrence.weekdays)} at ${timeText(s.recurrence.time)} ` +
      `(${zoneCity(s.recurrence.timeZone)})${next}`
    );
  });
  return ephemeral(lines.join('\n').slice(0, 2000));
}

async function setScheduleActive(
  ports: SchedulePorts,
  caller: Caller,
  query: string,
  active: boolean,
): Promise<InteractionResponse> {
  const target = findSchedule(await allSchedules(ports, caller), query);
  if (!target) return ephemeral(NOT_FOUND);
  const res = await ports.run(caller, 'schedule-update', { scheduleId: target.id, active });
  if (!res.success) return ephemeral(failureText(res, NEEDS_LEADER_SCHEDULE));
  const updated = res.data as Schedule;
  if (active) {
    await ports.run(caller, 'schedule-materialize', { scheduleId: updated.id });
    await ports.afterChange();
    return ephemeral(`Resumed **${updated.name}**. Its next raids post shortly.`);
  }
  return ephemeral(`Paused **${updated.name}**. No new raids until you resume it.`);
}

function diffSchedulePatch(
  existing: Schedule,
  fields: NonNullable<ScheduleDraftCheck['fields']>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.name !== existing.name) patch.name = fields.name;
  if (fields.instance !== existing.instance) patch.instance = fields.instance;
  if (fields.kind !== existing.kind) patch.kind = fields.kind;
  if (fields.access !== accessOf(existing)) patch.access = fields.access;
  if (fields.size !== existing.size) patch.size = fields.size;
  if (!sameTargets(fields.roleTargets, existing.roleTargets)) {
    patch.roleTargets = fields.roleTargets;
  }
  const prevDays = orderedWeekdays(existing.recurrence.weekdays);
  if (JSON.stringify(fields.weekdays) !== JSON.stringify(prevDays)) {
    patch.weekdays = fields.weekdays;
  }
  if (fields.time !== existing.recurrence.time) patch.time = fields.time;
  if (fields.durationMinutes !== existing.durationMinutes) {
    patch.durationMinutes = fields.durationMinutes;
  }
  return patch;
}

const done = (content: string) =>
  updateMessage({ content, embeds: [], components: [], allowed_mentions: { parse: [] } });

async function saveSchedule(
  ports: SchedulePorts,
  caller: Caller,
  draft: ScheduleDraft,
): Promise<InteractionResponse> {
  const check = checkScheduleDraft(draft);
  if (draft.step !== 2 || !check.fields) return updateMessage(schedulePreviewMessage(draft));

  if (draft.scheduleId) {
    const existing = findSchedule(await allSchedules(ports, caller), draft.scheduleId);
    if (!existing) return done(NOT_FOUND);
    const patch = diffSchedulePatch(existing, check.fields);
    if (Object.keys(patch).length === 0) {
      return done(`No changes to save for **${existing.name}**.`);
    }
    const res = await ports.run(caller, 'schedule-update', {
      scheduleId: existing.id,
      ...patch,
    });
    if (!res.success) {
      return updateMessage(schedulePreviewMessage(draft, failureText(res, NEEDS_LEADER_SCHEDULE)));
    }
    const saved = res.data as Schedule;
    return done(
      `Saved **${saved.name}**. Raids already posted keep their old details; change those one at a time on the site.`,
    );
  }

  const res = await ports.run(caller, 'schedule-create', check.fields);
  if (!res.success) {
    return updateMessage(schedulePreviewMessage(draft, failureText(res, NEEDS_LEADER_SCHEDULE)));
  }
  const created = res.data as Schedule;
  await ports.run(caller, 'schedule-materialize', { scheduleId: created.id });
  await ports.afterChange();
  return done(
    `Made **${created.name}** (${whatText(created)}) on ${nightsList(created.recurrence.weekdays)} ` +
      `at ${timeText(created.recurrence.time)}. This week's raids are posting now.`,
  );
}

// ── Interaction routing & autocomplete ───────────────────────────────────────────────────────

const isScheduleGroup = (interaction: Interaction) =>
  interaction.data?.name === SLASH_COMMAND && subcommandPath(interaction)[0] === SCHEDULE_GROUP;

const schedFormId = (interaction: Interaction) => {
  const id = interaction.data?.custom_id ?? '';
  return id.startsWith(`${SCHED_FORM_PREFIX}:`) && id.length <= 100 ? id : null;
};

export function isScheduleInteraction(interaction: Interaction): boolean {
  if (interaction.type === InteractionType.APPLICATION_COMMAND && isScheduleGroup(interaction)) {
    return true;
  }
  return (
    (interaction.type === InteractionType.MESSAGE_COMPONENT ||
      interaction.type === InteractionType.MODAL_SUBMIT) &&
    schedFormId(interaction) !== null
  );
}

const NOT_YOURS =
  'That form belongs to someone else. Start your own with `/vintage schedule create`.';
const EXPIRED =
  'I can’t read that form any more. Start again with `/vintage schedule create`; nothing was saved.';

async function handleSlash(
  interaction: Interaction,
  ports: SchedulePorts,
  caller: Caller,
  user: string,
): Promise<InteractionResponse | null> {
  const [, sub] = subcommandPath(interaction);
  if (sub === 'list') return listSchedules(ports, caller);
  if (!tierAllows(caller.tier, 'leader')) return ephemeral(NEEDS_LEADER_SCHEDULE);
  if (sub === 'create') {
    const clock = await guildClock(ports, caller);
    return scheduleDetailsForm({}, clock);
  }
  const values = commandOptions(interaction);
  const query = String(values.schedule ?? '');
  if (sub === 'edit') {
    const target = findSchedule(await allSchedules(ports, caller), query);
    if (!target) return ephemeral(NOT_FOUND);
    return reply(schedulePreviewMessage(draftFromSchedule(user, target)), { ephemeral: true });
  }
  if (sub === 'pause') return setScheduleActive(ports, caller, query, false);
  if (sub === 'resume') return setScheduleActive(ports, caller, query, true);
  return null;
}

async function handleScheduleModal(
  interaction: Interaction,
  ports: SchedulePorts,
  caller: Caller,
  user: string,
  id: string,
  earlier: ScheduleDraft | null,
): Promise<InteractionResponse> {
  if (id === SCHED_FORM_IDS.details) {
    const clock = await guildClock(ports, caller);
    const draft = readDetailsForm(interaction, user, earlier, clock.zone);
    if (!draft) return ephemeral(EXPIRED);
    const preview = schedulePreviewMessage(draft);
    return earlier ? updateMessage(preview) : reply(preview, { ephemeral: true });
  }
  if (!id.startsWith(`${SCHED_FORM_IDS.kind}:`) || !earlier) return ephemeral(EXPIRED);
  const kind = id.slice(`${SCHED_FORM_IDS.kind}:`.length);
  const draft = kind === earlier.kind ? readKindForm(earlier, interaction) : earlier;
  return updateMessage(schedulePreviewMessage(draft));
}

async function handleScheduleClick(
  interaction: Interaction,
  ports: SchedulePorts,
  caller: Caller,
  id: string,
  earlier: ScheduleDraft | null,
): Promise<InteractionResponse | null> {
  if (id === SCHED_FORM_IDS.cancel) return done(SCHEDULE_CANCELLED);
  if (!earlier) return done(EXPIRED);
  if (id === SCHED_FORM_IDS.next || id === SCHED_FORM_IDS.editKind) {
    return scheduleKindForm(earlier);
  }
  if (id === SCHED_FORM_IDS.edit) {
    return scheduleDetailsForm(earlier, await guildClock(ports, caller));
  }
  if (id === SCHED_FORM_IDS.access) {
    return updateMessage(
      schedulePreviewMessage({ ...earlier, access: earlier.access === 'open' ? 'guild' : 'open' }),
    );
  }
  if (id === SCHED_FORM_IDS.hours) {
    const hours = (interaction.data?.values?.[0] ?? '').trim().slice(0, MAX.hours);
    return updateMessage(schedulePreviewMessage({ ...earlier, hours: hours || earlier.hours }));
  }
  if (id === SCHED_FORM_IDS.save) return saveSchedule(ports, caller, earlier);
  return null;
}

async function handleComponentOrModal(
  interaction: Interaction,
  ports: SchedulePorts,
  caller: Caller,
  user: string,
): Promise<InteractionResponse | null> {
  const component = interaction.type === InteractionType.MESSAGE_COMPONENT;
  if (!tierAllows(caller.tier, 'leader')) {
    return component ? done(NEEDS_LEADER_SCHEDULE) : ephemeral(NEEDS_LEADER_SCHEDULE);
  }
  const id = schedFormId(interaction)!;
  const earlier = draftOf(interaction);
  if (earlier && earlier.user !== user) return ephemeral(NOT_YOURS);
  return interaction.type === InteractionType.MODAL_SUBMIT
    ? handleScheduleModal(interaction, ports, caller, user, id, earlier)
    : handleScheduleClick(interaction, ports, caller, id, earlier);
}

export async function handleScheduleInteraction(
  interaction: Interaction,
  ports: SchedulePorts,
): Promise<InteractionResponse | null> {
  if (!isScheduleInteraction(interaction)) return null;
  const who = await discordCaller(interaction, ports, 'schedules');
  if ('refusal' in who) return who.refusal;
  const user = interactionUser(interaction)?.id ?? '';
  return interaction.type === InteractionType.APPLICATION_COMMAND
    ? handleSlash(interaction, ports, who.caller, user)
    : handleComponentOrModal(interaction, ports, who.caller, user);
}

/** Autocomplete for `/vintage schedule edit|pause|resume` (`schedule:`). */
export async function handleScheduleAutocomplete(
  interaction: Interaction,
  ports: ScheduleAutocompletePorts,
): Promise<InteractionResponse | null> {
  if (
    interaction.type !== InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE ||
    !isScheduleGroup(interaction)
  ) {
    return null;
  }
  const none = autocompleteResult([]);
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) return none;
  const focused = focusedOption(interaction);
  if (focused?.name !== 'schedule') return none;
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member || !tierAllows(member.tier, 'leader')) return none;

  const [, sub] = subcommandPath(interaction);
  const q = focused.value.trim().toLowerCase();
  const list = (await ports.schedules()).filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.instance.toLowerCase().includes(q),
  );
  // Pause leads with active schedules; resume leads with paused ones.
  const ordered = [...list].sort((a, b) => {
    if (sub === 'pause' && a.active !== b.active) return a.active ? -1 : 1;
    if (sub === 'resume' && a.active !== b.active) return a.active ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  const choices = ordered.slice(0, 25).map((s) => {
    const days = orderedWeekdays(s.recurrence.weekdays)
      .map((d) => WEEKDAY_SHORT[d])
      .join('/');
    const tag = s.active ? '' : ' (paused)';
    return {
      name: `${s.name} · ${days} ${timeText(s.recurrence.time)}${tag}`.slice(0, 100),
      value: s.id,
    };
  });
  return autocompleteResult(choices);
}
