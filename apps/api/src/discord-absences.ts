// `/vintage absence …` and absence buttons/modals (absences.plan.md §5):
//   /vintage absence add [from] [to] [reason] [member]  → absence-add (or opens form when no from)
//   /vintage absence weekly                             → opens weekly nights form → absence-weekly-set
//   /vintage absence list                               → absence-list (own active absences)
//   /vintage absence remove <absence>                   → absence-remove (autocompleted from own)
//   button  absence-more-days                          → opens the Absence form
//   button  absence-mark:<mode>:<eventIds>             → marks stillSignedUp raids absent or late
// Pure over ports, so Convex (`convex/discord.ts`) and tests run the same flow.
import {
  actionRow,
  autocompleteResult,
  ButtonStyle,
  button,
  focusedOption,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  label,
  labelledTextInput,
  modal,
  modalSelections,
  modalValues,
  reply,
  type SelectOption,
  stringSelect,
  subcommandPath,
  updateMessage,
} from '@vintage/discord-kit';
import { type Caller, type CommandResult, tierAllows } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import {
  type Absence,
  type AbsenceCoverage,
  FALLBACK_TIME_ZONE,
  LATE_MINUTES,
  type LateMinutes,
  resolveGuildClock,
  type Schedule,
  WEEKDAYS,
  type Weekday,
  type WeeklyNight,
} from '@vintage/raids/contract';
import {
  commandOptions,
  ephemeral,
  failureText,
  type MemberPorts,
  SLASH_COMMAND,
} from './discord-common';
import { dateOptions } from './discord-event-form';

export const ABSENCE_GROUP = 'absence';

const NEEDS_RECRUIT =
  'Managing absences needs the Recruit rank or higher in this server. Ask an officer if that seems wrong.';
const NEEDS_LEADER_FOR_OTHER = 'Adding an absence for someone else needs the Raid Leader rank.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_FULL: Record<Weekday, string> = {
  sun: 'Sundays',
  mon: 'Mondays',
  tue: 'Tuesdays',
  wed: 'Wednesdays',
  thu: 'Thursdays',
  fri: 'Fridays',
  sat: 'Saturdays',
};

const DAY_ALIASES: Record<string, Weekday> = {
  sun: 'sun',
  sunday: 'sun',
  sundays: 'sun',
  mon: 'mon',
  monday: 'mon',
  mondays: 'mon',
  tue: 'tue',
  tues: 'tue',
  tuesday: 'tue',
  tuesdays: 'tue',
  wed: 'wed',
  wednesday: 'wed',
  wednesdays: 'wed',
  thu: 'thu',
  thur: 'thu',
  thurs: 'thu',
  thursday: 'thu',
  thursdays: 'thu',
  fri: 'fri',
  friday: 'fri',
  fridays: 'fri',
  sat: 'sat',
  saturday: 'sat',
  saturdays: 'sat',
};

export interface AbsencePorts extends MemberPorts {
  absences(memberId: string): Promise<Absence[]>;
  characters(memberId: string): Promise<Character[]>;
  signup(eventId: string, memberId: string): Promise<{ characterId: string } | null>;
  run(caller: Caller, name: string, input: unknown): Promise<CommandResult<unknown>>;
  afterChange(): Promise<void>;
  /** Clock for building date pickers in the guild's time zone; defaults to `Date.now`. */
  now?: () => number;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}`;
}

export function formatAbsenceLine(a: Absence, includeReason = true): string {
  if (a.kind === 'dates' && a.from && a.to) {
    const span = a.from === a.to ? shortDate(a.from) : `${shortDate(a.from)} to ${shortDate(a.to)}`;
    return includeReason && a.reason ? `${span} · ${a.reason}` : span;
  }
  const parts: string[] = [];
  const awayDays = (a.nights ?? []).filter((n) => n.type === 'away').map((n) => DAY_FULL[n.day]);
  const lateParts = (a.nights ?? [])
    .filter((n) => n.type === 'late' && n.lateMinutes)
    .map((n) => `${n.lateMinutes}m late ${DAY_FULL[n.day]}`);
  if (awayDays.length) parts.push(`Absent ${awayDays.join(', ')}`);
  if (lateParts.length) parts.push(lateParts.join(', '));
  const base = parts.join(' · ') || 'Weekly rule';
  return includeReason && a.reason ? `${base} · ${a.reason}` : base;
}

function absenceErrorText(result: CommandResult<unknown>): string {
  const code = result.error?.code;
  switch (code) {
    case 'ABSENCE_IN_PAST':
      return 'That date has passed.';
    case 'ABSENCE_TOO_LONG':
      return 'Keep it to 60 days. Add another for the rest.';
    case 'ABSENCE_TOO_FAR':
      return 'Pick a date in the next 6 months.';
    case 'TOO_MANY_ABSENCES':
      return 'You have 10 already. Remove one first.';
    default:
      return failureText(result, NEEDS_RECRUIT, 'Could not update your absence.');
  }
}

async function absenceZone(ports: AbsencePorts, caller: Caller): Promise<string> {
  const res = await ports.run(caller, 'schedule-list', { includeInactive: true });
  const list = res.success && Array.isArray(res.data) ? (res.data as Schedule[]) : [];
  return list.length ? resolveGuildClock(list).zone : FALLBACK_TIME_ZONE;
}

const WEEKDAY_SINGULAR: Record<Weekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

function weekdayOptions(selected: readonly Weekday[]): SelectOption[] {
  return WEEKDAYS.map((day) => ({
    label: WEEKDAY_SINGULAR[day],
    value: day,
    ...(selected.includes(day) ? { default: true } : {}),
  }));
}

function absenceAddModal(zone: string, now: number, targetMemberId?: string): InteractionResponse {
  const id = targetMemberId ? `absence-add-modal:${targetMemberId}` : 'absence-add-modal';
  const dates = dateOptions(zone, now);
  return modal(
    id,
    'Mark yourself absent',
    label(
      'First day out',
      stringSelect('from', dates, { placeholder: 'Pick the first day out', required: true }),
      'Further ahead? Type it: /vintage absence add from:',
    ),
    label(
      'Last day out',
      stringSelect('to', dates, { placeholder: 'Same as first day (optional)', required: false }),
      'Leave empty for a single day.',
    ),
    label(
      'Reason',
      labelledTextInput('reason', {
        required: false,
        max_length: 200,
        placeholder: 'Work trip',
      }),
      'Optional; only raid leaders and officers see it.',
    ),
  );
}

function weeklyModal(current: Absence | undefined): InteractionResponse {
  const awayDays = (current?.nights ?? []).filter((n) => n.type === 'away').map((n) => n.day);
  const lateNights = (current?.nights ?? []).filter((n) => n.type === 'late');
  const lateDays = lateNights.map((n) => n.day);
  const minsDefault = lateNights[0]?.lateMinutes ?? null;
  const lateMinuteOpts: SelectOption[] = LATE_MINUTES.map((m) => ({
    label: `${m} minutes`,
    value: String(m),
    ...(m === minsDefault ? { default: true } : {}),
  }));
  return modal(
    'absence-weekly-modal',
    'Weekly raid nights',
    label(
      'Absent nights',
      stringSelect('absent_days', weekdayOptions(awayDays), {
        placeholder: 'Pick absent nights (none to clear)',
        min_values: 0,
        max_values: WEEKDAYS.length,
        required: false,
      }),
      'Every raid on these nights shows you as Absent.',
    ),
    label(
      'Late nights',
      stringSelect('late_days', weekdayOptions(lateDays), {
        placeholder: 'Pick late nights (none to clear)',
        min_values: 0,
        max_values: WEEKDAYS.length,
        required: false,
      }),
      'Pressing Accept on these nights marks you Late.',
    ),
    label(
      'How late on late nights',
      stringSelect('late_minutes', lateMinuteOpts, {
        placeholder: '5, 15, or 30 minutes',
        min_values: 0,
        max_values: 1,
        required: false,
      }),
      'Needed for late nights. Later than 30 min? Pick Absent.',
    ),
    label(
      'Reason for absent nights',
      labelledTextInput('reason', {
        required: false,
        max_length: 200,
        value: current?.reason ?? '',
        placeholder: 'Work schedule',
      }),
      'Optional; only raid leaders and officers see it.',
    ),
  );
}

function parseDays(raw: string): { days: Weekday[] } | { invalid: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { days: [] };
  const out: Weekday[] = [];
  for (const token of trimmed.split(/[,\s]+/).filter(Boolean)) {
    const day = DAY_ALIASES[token.toLowerCase()];
    if (!day) return { invalid: token };
    if (!out.includes(day)) out.push(day);
  }
  return { days: out };
}

/** Shape returned by `absence-add` and `absence-weekly-set` in `stillSignedUp`. */
export interface StillSignedUpRaid {
  eventId: string;
  name: string;
  startsAt: number;
  status: string;
  coverage?: Exclude<AbsenceCoverage, null>;
}

const MAX_CUSTOM_ID = 100;

/** Pack as many event IDs as fit inside Discord's 100-char custom_id limit. */
function packEventIds(prefix: string, events: readonly StillSignedUpRaid[]): string[] {
  const ids: string[] = [];
  let len = prefix.length;
  for (const e of events) {
    if (!e.eventId) continue;
    const add = (ids.length ? 1 : 0) + e.eventId.length;
    if (len + add > MAX_CUSTOM_ID) break;
    ids.push(e.eventId);
    len += add;
  }
  return ids;
}

function formatStillSignedUp(
  events: readonly StillSignedUpRaid[],
  mode: 'absent' | { lateMinutes: LateMinutes },
): { line: string; button: ReturnType<typeof button> } | null {
  const prefix =
    mode === 'absent' ? 'absence-mark:absent:' : `absence-mark:late-${mode.lateMinutes}:`;
  const packed = packEventIds(prefix, events);
  if (packed.length === 0) return null;
  const names = events.map((e) => e.name).join(', ');
  const ids = packed.join(',');
  const truncated = packed.length < events.length;
  const countLabel = truncated
    ? `${packed.length} of ${events.length}`
    : events.length === 1
      ? ''
      : `all ${events.length}`;
  if (mode === 'absent') {
    const label = countLabel ? `Mark ${countLabel} absent` : 'Mark absent';
    const note = truncated ? ` (next ${packed.length} here; update the rest on their posts)` : '';
    return {
      line: `You're still signed up for ${names}.${note}`,
      button: button(`${prefix}${ids}`, label, ButtonStyle.DANGER),
    };
  }
  const label = countLabel ? `Mark ${countLabel} late` : 'Mark late';
  const note = truncated ? ` (next ${packed.length} here; update the rest on their posts)` : '';
  return {
    line: `You're on time for ${names}.${note}`,
    button: button(`${prefix}${ids}`, label, ButtonStyle.PRIMARY),
  };
}

async function runAbsenceAdd(
  ports: AbsencePorts,
  caller: Caller,
  input: { from: string; to?: string; reason?: string; memberId?: string },
): Promise<InteractionResponse> {
  const res = (await ports.run(caller, 'absence-add', input)) as CommandResult<{
    absence: Absence;
    stillSignedUp: StillSignedUpRaid[];
  }>;
  if (!res.success) return ephemeral(absenceErrorText(res));
  await ports.afterChange();
  const { absence, stillSignedUp } = res.data!;
  const span = formatAbsenceLine(absence, false);
  const head = input.memberId
    ? `Marked absent ${span}.`
    : `You're absent ${span}. Answer any of those raids to change it.`;
  if (!stillSignedUp.length || input.memberId) return ephemeral(head);
  const prompt = formatStillSignedUp(stillSignedUp, 'absent');
  if (!prompt) return ephemeral(head);
  return reply(
    { content: `${head}\n${prompt.line}`, components: [actionRow(prompt.button)] },
    { ephemeral: true },
  );
}

function parseDaysList(
  selected: string[] | undefined,
  rawText: string | undefined,
): { days: Weekday[] } | { invalid: string } {
  if (selected !== undefined) {
    const out: Weekday[] = [];
    for (const token of selected) {
      const day = DAY_ALIASES[token.toLowerCase()];
      if (!day) return { invalid: token };
      if (!out.includes(day)) out.push(day);
    }
    return { days: out };
  }
  return parseDays(rawText ?? '');
}

function parseWeeklyInput(
  vals: Record<string, string | undefined>,
  selections: Record<string, string[] | undefined>,
):
  | { nights: WeeklyNight[]; awayCount: number; lateMinutes: LateMinutes | null; reason?: string }
  | { error: string } {
  const parsedAway = parseDaysList(selections.absent_days, vals.absent_days);
  if ('invalid' in parsedAway) {
    return {
      error: `I didn't recognize "${parsedAway.invalid}". Use weekdays like mon, wed, thu.`,
    };
  }
  const parsedLate = parseDaysList(selections.late_days, vals.late_days);
  if ('invalid' in parsedLate) {
    return {
      error: `I didn't recognize "${parsedLate.invalid}". Use weekdays like mon, wed, thu.`,
    };
  }
  const overlap = parsedAway.days.find((d) => parsedLate.days.includes(d));
  if (overlap)
    return { error: `Pick ${DAY_FULL[overlap].slice(0, -1)} as absent or late, not both.` };
  let lateMinutes: LateMinutes | null = null;
  if (parsedLate.days.length) {
    const rawMins = selections.late_minutes?.[0] ?? vals.late_minutes ?? '';
    const m = Number(rawMins.trim());
    if (!(LATE_MINUTES as readonly number[]).includes(m)) {
      return { error: 'Pick how late: 5, 15, or 30 minutes (more than 30 is absent).' };
    }
    lateMinutes = m as LateMinutes;
  }
  const nights: WeeklyNight[] = [
    ...parsedAway.days.map((day): WeeklyNight => ({ day, type: 'away', lateMinutes: null })),
    ...parsedLate.days.map((day): WeeklyNight => ({ day, type: 'late', lateMinutes })),
  ];
  const reason = vals.reason?.trim() || undefined;
  return { nights, awayCount: parsedAway.days.length, lateMinutes, reason };
}

function weeklyStillSignedUpReply(
  head: string,
  stillSignedUp: readonly StillSignedUpRaid[],
  awayCount: number,
  defaultLateMinutes: LateMinutes | null,
): InteractionResponse {
  if (!stillSignedUp.length) return ephemeral(head);
  // Split away-covered raids from late-covered raids so mixed weekly rules never mark late raids absent.
  const awayRaids = stillSignedUp.filter(
    (e) => e.coverage === 'away' || (!e.coverage && awayCount > 0),
  );
  const lateRaids = stillSignedUp.filter((e) => e.coverage && e.coverage !== 'away');
  const fallbackLate = !awayRaids.length && !lateRaids.length ? stillSignedUp : lateRaids;
  const lines = [head];
  const buttons: ReturnType<typeof button>[] = [];
  if (awayRaids.length) {
    const prompt = formatStillSignedUp(awayRaids, 'absent');
    if (prompt) {
      lines.push(prompt.line);
      buttons.push(prompt.button);
    }
  }
  if (fallbackLate.length) {
    const first = fallbackLate[0]?.coverage;
    const mins = (first && first !== 'away' ? first.lateMinutes : defaultLateMinutes) ?? 15;
    const prompt = formatStillSignedUp(fallbackLate, { lateMinutes: mins });
    if (prompt) {
      lines.push(prompt.line);
      buttons.push(prompt.button);
    }
  }
  if (!buttons.length) return ephemeral(head);
  return reply(
    { content: lines.join('\n'), components: [actionRow(...buttons)] },
    { ephemeral: true },
  );
}

async function handleWeeklySubmit(
  ports: AbsencePorts,
  caller: Caller,
  interaction: Interaction,
): Promise<InteractionResponse> {
  const parsed = parseWeeklyInput(modalValues(interaction), modalSelections(interaction));
  if ('error' in parsed) return ephemeral(parsed.error);
  const res = (await ports.run(caller, 'absence-weekly-set', {
    nights: parsed.nights,
    ...(parsed.reason ? { reason: parsed.reason } : {}),
  })) as CommandResult<{ absence: Absence | null; stillSignedUp: StillSignedUpRaid[] }>;
  if (!res.success) return ephemeral(absenceErrorText(res));
  await ports.afterChange();
  const { absence, stillSignedUp } = res.data!;
  if (!absence) return ephemeral('No weekly nights set.');
  const head = `${formatAbsenceLine(absence, false)}. Answer any of those raids to change it.`;
  return weeklyStillSignedUpReply(head, stillSignedUp, parsed.awayCount, parsed.lateMinutes);
}

function markSignupInput(eventId: string, characterId: string, mode: string) {
  if (mode === 'absent') return { eventId, characterId, status: 'declined', note: null };
  return { eventId, characterId, status: 'late', lateMinutes: Number(mode.slice(5)) };
}

async function handleMarkButton(
  ports: AbsencePorts,
  caller: Caller,
  member: Member,
  mode: string,
  idsCsv: string,
): Promise<InteractionResponse> {
  const eventIds = idsCsv.split(',').filter(Boolean);
  const chars = await ports.characters(member.id);
  const fallbackChar = chars.find((c) => c.isMain) ?? chars[0];
  let updated = 0;
  for (const eventId of eventIds) {
    const characterId = (await ports.signup(eventId, member.id))?.characterId ?? fallbackChar?.id;
    if (!characterId) continue;
    const res = await ports.run(caller, 'signup-set', markSignupInput(eventId, characterId, mode));
    if (res.success) updated += 1;
  }
  if (updated > 0) await ports.afterChange();
  const word = mode === 'absent' ? 'absent' : 'late';
  const content = updated
    ? `Marked ${word} for ${updated} raid${updated === 1 ? '' : 's'}.`
    : 'No signups were updated.';
  return updateMessage({ content, components: [] });
}

async function resolveMember(
  interaction: Interaction,
  ports: AbsencePorts,
): Promise<{ member: Member; caller: Caller } | { refusal: InteractionResponse }> {
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return { refusal: ephemeral('Random only handles absences in the Vintage guild server.') };
  }
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member || !tierAllows(member.tier, 'recruit')) {
    return { refusal: ephemeral(NEEDS_RECRUIT) };
  }
  const caller: Caller = {
    surface: 'discord',
    guildId: ports.guildId,
    tier: member.tier,
    memberId: member.id,
    discordId: member.discordId,
  };
  return { member, caller };
}

async function handleSlashAdd(
  ports: AbsencePorts,
  member: Member,
  caller: Caller,
  opts: Record<string, unknown>,
): Promise<InteractionResponse> {
  const targetDiscordId = typeof opts.member === 'string' ? opts.member : undefined;
  let targetMemberId: string | undefined;
  if (targetDiscordId) {
    if (!tierAllows(member.tier, 'leader')) return ephemeral(NEEDS_LEADER_FOR_OTHER);
    const target = await ports.memberByDiscordId(targetDiscordId);
    if (!target) return ephemeral('Could not find that guild member.');
    targetMemberId = target.id;
  }
  const from = typeof opts.from === 'string' ? opts.from.trim() : '';
  if (!from) {
    const zone = await absenceZone(ports, caller);
    return absenceAddModal(zone, (ports.now ?? Date.now)(), targetMemberId);
  }
  const to = typeof opts.to === 'string' ? opts.to.trim() || undefined : undefined;
  const reason = typeof opts.reason === 'string' ? opts.reason.trim() || undefined : undefined;
  return runAbsenceAdd(ports, caller, { from, to, reason, memberId: targetMemberId });
}

async function handleSlashList(ports: AbsencePorts, caller: Caller): Promise<InteractionResponse> {
  const res = (await ports.run(caller, 'absence-list', {})) as CommandResult<{
    absences: Absence[];
  }>;
  if (!res.success) return ephemeral(absenceErrorText(res));
  const list = res.data?.absences ?? [];
  if (!list.length) return ephemeral('You have no active absences or weekly nights set.');
  return ephemeral(list.map((a) => `• ${formatAbsenceLine(a, true)}`).join('\n'));
}

async function handleSlashRemove(
  ports: AbsencePorts,
  caller: Caller,
  opts: Record<string, unknown>,
): Promise<InteractionResponse> {
  const absenceId = typeof opts.absence === 'string' ? opts.absence.trim() : '';
  const res = (await ports.run(caller, 'absence-remove', {
    absenceId,
  })) as CommandResult<{ removed: Absence }>;
  if (!res.success) return ephemeral(absenceErrorText(res));
  await ports.afterChange();
  const removed = res.data?.removed;
  return ephemeral(removed ? `Removed ${formatAbsenceLine(removed, false)}.` : 'Removed absence.');
}

async function handleSlash(
  interaction: Interaction,
  ports: AbsencePorts,
  member: Member,
  caller: Caller,
): Promise<InteractionResponse | null> {
  const path = subcommandPath(interaction);
  if (path[0] !== ABSENCE_GROUP) return null;
  const sub = path[1];
  const opts = commandOptions(interaction);
  if (sub === 'add') return handleSlashAdd(ports, member, caller, opts);
  if (sub === 'weekly') {
    const existing = (await ports.absences(member.id)).find((a) => a.kind === 'weekly');
    return weeklyModal(existing);
  }
  if (sub === 'list') return handleSlashList(ports, caller);
  if (sub === 'remove') return handleSlashRemove(ports, caller, opts);
  return null;
}

function classifyAbsenceInteraction(
  interaction: Interaction,
): 'slash' | 'component' | 'modal' | null {
  const customId = interaction.data?.custom_id ?? '';
  if (
    interaction.type === InteractionType.APPLICATION_COMMAND &&
    interaction.data?.name === SLASH_COMMAND &&
    subcommandPath(interaction)[0] === ABSENCE_GROUP
  ) {
    return 'slash';
  }
  if (
    interaction.type === InteractionType.MESSAGE_COMPONENT &&
    (customId === 'absence-more-days' || customId.startsWith('absence-mark:'))
  ) {
    return 'component';
  }
  if (
    interaction.type === InteractionType.MODAL_SUBMIT &&
    (customId === 'absence-add-modal' ||
      customId.startsWith('absence-add-modal:') ||
      customId === 'absence-weekly-modal')
  ) {
    return 'modal';
  }
  return null;
}

function handleAbsenceModal(
  interaction: Interaction,
  ports: AbsencePorts,
  caller: Caller,
  customId: string,
): Promise<InteractionResponse> {
  if (customId === 'absence-weekly-modal') return handleWeeklySubmit(ports, caller, interaction);
  const [, targetMemberId] = customId.split(':');
  const vals = modalValues(interaction);
  const picked = modalSelections(interaction);
  return runAbsenceAdd(ports, caller, {
    from: (picked.from?.[0] ?? vals.from ?? '').trim(),
    to: (picked.to?.[0] ?? vals.to ?? '').trim() || undefined,
    reason: (vals.reason ?? '').trim() || undefined,
    memberId: targetMemberId || undefined,
  });
}

export async function handleAbsenceInteraction(
  interaction: Interaction,
  ports: AbsencePorts,
): Promise<InteractionResponse | null> {
  const kind = classifyAbsenceInteraction(interaction);
  if (!kind) return null;
  const who = await resolveMember(interaction, ports);
  if ('refusal' in who) return who.refusal;
  if (kind === 'slash') return handleSlash(interaction, ports, who.member, who.caller);
  const customId = interaction.data?.custom_id ?? '';
  if (kind === 'modal') return handleAbsenceModal(interaction, ports, who.caller, customId);
  if (customId === 'absence-more-days') {
    const zone = await absenceZone(ports, who.caller);
    return absenceAddModal(zone, (ports.now ?? Date.now)());
  }
  const [, mode, ids] = customId.split(':');
  return handleMarkButton(ports, who.caller, who.member, mode ?? 'absent', ids ?? '');
}

export async function handleAbsenceAutocomplete(
  interaction: Interaction,
  ports: Pick<AbsencePorts, 'discordGuildId' | 'memberByDiscordId' | 'absences'>,
): Promise<InteractionResponse | null> {
  if (
    interaction.type !== InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE ||
    interaction.data?.name !== SLASH_COMMAND
  ) {
    return null;
  }
  const path = subcommandPath(interaction);
  if (path[0] !== ABSENCE_GROUP || path[1] !== 'remove') return null;
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return autocompleteResult([]);
  }
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member) return autocompleteResult([]);
  const query = (focusedOption(interaction)?.value ?? '').toString().toLowerCase();
  const list = await ports.absences(member.id);
  const choices = list
    .map((a) => ({ name: formatAbsenceLine(a, true).slice(0, 100), value: a.id }))
    .filter((c) => !query || c.name.toLowerCase().includes(query))
    .slice(0, 25);
  return autocompleteResult(choices);
}

/** Re-exported for tests. */
export { WEEKDAYS };
