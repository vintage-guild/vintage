// `/random absence …` and absence buttons/modals (absences.plan.md §5):
//   /random absence add [from] [to] [reason] [member]  → absence-add (or opens form when no from)
//   /random absence weekly                             → opens weekly nights form → absence-weekly-set
//   /random absence list                               → absence-list (own active absences)
//   /random absence remove <absence>                   → absence-remove (autocompleted from own)
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
  modal,
  modalValues,
  reply,
  subcommandPath,
  TextInputStyle,
  textInput,
  updateMessage,
} from '@vintage/discord-kit';
import { type Caller, type CommandResult, tierAllows } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import {
  type Absence,
  LATE_MINUTES,
  type LateMinutes,
  type RaidEvent,
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

function absenceAddModal(targetMemberId?: string): InteractionResponse {
  const id = targetMemberId ? `absence-add-modal:${targetMemberId}` : 'absence-add-modal';
  return modal(
    id,
    'Mark yourself absent',
    textInput('from', 'First day out (YYYY-MM-DD)', {
      style: TextInputStyle.SHORT,
      required: true,
      max_length: 10,
      placeholder: '2026-12-03',
    }),
    textInput('to', 'Last day out (YYYY-MM-DD, optional)', {
      style: TextInputStyle.SHORT,
      required: false,
      max_length: 10,
      placeholder: '2026-12-07',
    }),
    textInput('reason', 'Reason (optional, leaders only)', {
      style: TextInputStyle.SHORT,
      required: false,
      max_length: 200,
      placeholder: 'Work trip',
    }),
  );
}

function weeklyModal(current: Absence | undefined): InteractionResponse {
  const awayDefault = (current?.nights ?? [])
    .filter((n) => n.type === 'away')
    .map((n) => n.day)
    .join(', ');
  const lateNights = (current?.nights ?? []).filter((n) => n.type === 'late');
  const lateDefault = lateNights.map((n) => n.day).join(', ');
  const minsDefault = lateNights[0]?.lateMinutes ? String(lateNights[0].lateMinutes) : '';
  return modal(
    'absence-weekly-modal',
    'Weekly raid nights',
    textInput('absent_days', 'Absent nights (e.g. wed, fri; blank for none)', {
      style: TextInputStyle.SHORT,
      required: false,
      max_length: 60,
      value: awayDefault,
      placeholder: 'wed',
    }),
    textInput('late_days', 'Late nights (e.g. thu; blank for none)', {
      style: TextInputStyle.SHORT,
      required: false,
      max_length: 60,
      value: lateDefault,
      placeholder: 'thu',
    }),
    textInput('late_minutes', 'How late on late nights (5, 15, or 30)', {
      style: TextInputStyle.SHORT,
      required: false,
      max_length: 2,
      value: minsDefault,
      placeholder: '15',
    }),
    textInput('reason', 'Reason for absent nights (optional)', {
      style: TextInputStyle.SHORT,
      required: false,
      max_length: 200,
      value: current?.reason ?? '',
      placeholder: 'Work schedule',
    }),
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

function formatStillSignedUp(
  events: RaidEvent[],
  mode: 'absent' | { lateMinutes: LateMinutes },
): { line: string; row: ReturnType<typeof actionRow> } {
  const names = events.map((e) => e.name).join(', ');
  const ids = events
    .slice(0, 3)
    .map((e) => e.id)
    .join(',');
  if (mode === 'absent') {
    const label = events.length === 1 ? 'Mark absent' : `Mark all ${events.length} absent`;
    return {
      line: `You're still signed up for ${names}.`,
      row: actionRow(button(`absence-mark:absent:${ids}`, label, ButtonStyle.DANGER)),
    };
  }
  const label = events.length === 1 ? 'Mark late' : `Mark all ${events.length} late`;
  return {
    line: `You're on time for ${names}.`,
    row: actionRow(
      button(`absence-mark:late-${mode.lateMinutes}:${ids}`, label, ButtonStyle.PRIMARY),
    ),
  };
}

async function runAbsenceAdd(
  ports: AbsencePorts,
  caller: Caller,
  input: { from: string; to?: string; reason?: string; memberId?: string },
): Promise<InteractionResponse> {
  const res = (await ports.run(caller, 'absence-add', input)) as CommandResult<{
    absence: Absence;
    stillSignedUp: RaidEvent[];
  }>;
  if (!res.success) return ephemeral(absenceErrorText(res));
  await ports.afterChange();
  const { absence, stillSignedUp } = res.data!;
  const span = formatAbsenceLine(absence, false);
  const head = input.memberId
    ? `Marked absent ${span}.`
    : `You're absent ${span}. Answer any of those raids to change it.`;
  if (!stillSignedUp.length || input.memberId) return ephemeral(head);
  const { line, row } = formatStillSignedUp(stillSignedUp, 'absent');
  return reply({ content: `${head}\n${line}`, components: [row] }, { ephemeral: true });
}

function parseWeeklyInput(
  vals: Record<string, string | undefined>,
):
  | { nights: WeeklyNight[]; awayCount: number; lateMinutes: LateMinutes | null; reason?: string }
  | { error: string } {
  const parsedAway = parseDays(vals.absent_days ?? '');
  if ('invalid' in parsedAway) {
    return {
      error: `I didn't recognize "${parsedAway.invalid}". Use weekdays like mon, wed, thu.`,
    };
  }
  const parsedLate = parseDays(vals.late_days ?? '');
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
    const m = Number((vals.late_minutes ?? '').trim());
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

async function handleWeeklySubmit(
  ports: AbsencePorts,
  caller: Caller,
  interaction: Interaction,
): Promise<InteractionResponse> {
  const parsed = parseWeeklyInput(modalValues(interaction));
  if ('error' in parsed) return ephemeral(parsed.error);
  const res = (await ports.run(caller, 'absence-weekly-set', {
    nights: parsed.nights,
    ...(parsed.reason ? { reason: parsed.reason } : {}),
  })) as CommandResult<{ absence: Absence | null; stillSignedUp: RaidEvent[] }>;
  if (!res.success) return ephemeral(absenceErrorText(res));
  await ports.afterChange();
  const { absence, stillSignedUp } = res.data!;
  if (!absence) return ephemeral('No weekly nights set.');
  const head = `${formatAbsenceLine(absence, false)}. Answer any of those raids to change it.`;
  if (!stillSignedUp.length) return ephemeral(head);
  const mode =
    parsed.awayCount > 0 ? 'absent' : { lateMinutes: parsed.lateMinutes ?? (15 as LateMinutes) };
  const { line, row } = formatStillSignedUp(stillSignedUp, mode);
  return reply({ content: `${head}\n${line}`, components: [row] }, { ephemeral: true });
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
  if (!from) return absenceAddModal(targetMemberId);
  const to = typeof opts.to === 'string' ? opts.to.trim() || undefined : undefined;
  const reason = typeof opts.reason === 'string' ? opts.reason.trim() || undefined : undefined;
  return runAbsenceAdd(ports, caller, { from, to, reason, memberId: targetMemberId });
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
  if (sub === 'list') {
    const res = (await ports.run(caller, 'absence-list', {})) as CommandResult<Absence[]>;
    if (!res.success) return ephemeral(absenceErrorText(res));
    const list = res.data ?? [];
    if (!list.length) return ephemeral('You have no active absences or weekly nights set.');
    return ephemeral(list.map((a) => `• ${formatAbsenceLine(a, true)}`).join('\n'));
  }
  if (sub === 'remove') {
    const absenceId = typeof opts.absence === 'string' ? opts.absence.trim() : '';
    const res = (await ports.run(caller, 'absence-remove', {
      absenceId,
    })) as CommandResult<Absence>;
    if (!res.success) return ephemeral(absenceErrorText(res));
    await ports.afterChange();
    return ephemeral(`Removed ${formatAbsenceLine(res.data!, false)}.`);
  }
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
  return runAbsenceAdd(ports, caller, {
    from: (vals.from ?? '').trim(),
    to: (vals.to ?? '').trim() || undefined,
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
  if (customId === 'absence-more-days') return absenceAddModal();
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
