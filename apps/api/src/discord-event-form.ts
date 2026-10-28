// The New event form (`/random event create` with no name or start). Pure over the same ports as
// discord-events.ts, so Convex (convex/discord.ts) and the JTBD host run the same flow:
//   /random event create (bare)   → stage 1 modal `evform:new`: name, kind, where, date and time,
//                                   length. Options typed so far prefill it; size and counts ride
//                                   in its custom id (`evform:new:<size>:<tanks>:<healers>:<dps>`).
//   modal  evform:new             → a private preview of the draft, with Set up event, Edit
//                                   details, and Cancel
//   button evform:next            → stage 2 modal `evform:kind:<kind>`, built for the kind: a size
//                                   (a select of the kind's sizes; a box for Event, empty is open)
//                                   and the tank, healer and DPS counts (no tanks for battlegrounds)
//   modal  evform:kind:<kind>     → the preview again, with Post event, Edit details, Edit size
//                                   and comp, and Cancel
//   button evform:edit            → stage 1 again, prefilled
//   button evform:edit-kind       → stage 2 again, prefilled
//   button evform:post            → raid-create as the member, then a tick (afterChange); the
//                                   preview becomes the "Made **X** …" line
//   button evform:cancel          → "Cancelled, nothing was made."
//
// No draft is stored. It rides in the preview's embed footer as base64url JSON (`v1.…`), and
// Discord sends that message back with every click and with a modal opened from it. The draft is
// read as untrusted: a strict schema caps each field at what the form lets a member type, the
// member who opened the form must be the one clicking, and every step re-reads the guild clock,
// re-checks the tier, and re-validates the whole draft against raid-create's own input schema.
// Post event runs raid-create through the registry, which checks the Raid Leader tier and every
// rule again; the preview's checks only say early what the command would refuse.
import {
  actionRow,
  ButtonStyle,
  button,
  type Embed,
  embed,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  label,
  labelledTextInput,
  type MessageData,
  modal,
  modalSelections,
  modalValues,
  reply,
  type SelectOption,
  stringSelect,
  subcommandPath,
  updateMessage,
} from '@vintage/discord-kit';
import { type Caller, tierAllows } from '@vintage/guild-kit';
import { raidsCommands } from '@vintage/raids/commands';
import {
  AKind,
  defaultRoleTargets,
  EVENT_KINDS,
  type EventKind,
  instanceOptional,
  KIND_LABELS,
  KIND_SIZES,
  kindNoun,
  MAX_EVENT_SIZE,
  type RaidEvent,
  type RoleTargets,
  sizeFits,
  sizeLabel,
  sizesText,
} from '@vintage/raids/contract';
import { z } from 'zod';
import {
  commandOptions,
  discordCaller,
  ephemeral,
  failureText,
  type OptionValues,
  SLASH_COMMAND,
} from './discord-common';
import {
  DEFAULT_RAID_HOURS,
  EVENT_GROUP,
  type EventPorts,
  guildTimeZone,
  madeText,
  NEEDS_LEADER,
  parseLocalTime,
  rolesText,
  roleTargetsFrom,
  when,
} from './discord-events';

/** Every custom id the form uses starts with this. */
export const FORM_PREFIX = 'evform';
export const FORM_IDS = {
  details: `${FORM_PREFIX}:new`,
  kind: `${FORM_PREFIX}:kind`,
  next: `${FORM_PREFIX}:next`,
  edit: `${FORM_PREFIX}:edit`,
  editKind: `${FORM_PREFIX}:edit-kind`,
  post: `${FORM_PREFIX}:post`,
  cancel: `${FORM_PREFIX}:cancel`,
} as const;

export const POST_LABEL = 'Post event';
export const SET_UP_LABEL = 'Set up event';
export const CANCELLED = 'Cancelled, nothing was made.';
/** Before the draft in the footer, so a reader finds it and nothing else. */
const DRAFT_TAG = 'v1.';

/** The most each box takes; the draft schema caps each field at the same, so it holds no more. */
const MAX = { name: 60, where: 60, start: 40, hours: 4, count: 2 } as const;

const COUNTS = ['tanks', 'healers', 'dps'] as const;
type Count = (typeof COUNTS)[number];
const COUNT_LABELS: Record<Count, string> = { tanks: 'Tanks', healers: 'Healers', dps: 'DPS' };

/**
 * What the member typed so far, exactly as typed: every step reads it again, so a field the
 * member gets wrong stays visible (and fixable) instead of being dropped.
 */
const draftSchema = z
  .object({
    /** The Discord user who opened the form; only they may go on with it. */
    user: z.string().min(1).max(32),
    name: z.string().max(MAX.name),
    kind: z.enum(EVENT_KINDS),
    where: z.string().max(MAX.where),
    start: z.string().max(MAX.start),
    hours: z.string().max(MAX.hours),
    /** Empty: the kind's usual size, or open for Event. */
    size: z.string().max(MAX.count),
    /** Empty: the kind's usual count for the size. */
    tanks: z.string().max(MAX.count),
    healers: z.string().max(MAX.count),
    dps: z.string().max(MAX.count),
    /** 1 until the size and comp step has been submitted. */
    step: z.union([z.literal(1), z.literal(2)]),
  })
  .strict();
export type Draft = z.infer<typeof draftSchema>;

// ── The draft in the message ─────────────────────────────────────────────────────────────────

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

export const encodeDraft = (draft: Draft) => `${DRAFT_TAG}${toBase64Url(JSON.stringify(draft))}`;

/** The draft a footer carries, or null when it carries none or anything that isn't one. */
export function decodeDraft(footer: string | undefined): Draft | null {
  const match = /(?:^|\s)v1\.([A-Za-z0-9_-]{1,1500})$/.exec(footer ?? '');
  if (!match) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(fromBase64Url(match[1]!)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The draft on the message a click or modal came from. */
const draftOf = (interaction: Interaction) =>
  decodeDraft(interaction.message?.embeds?.[0]?.footer?.text);

// ── Reading the draft ────────────────────────────────────────────────────────────────────────

/** The size picked when none was: the site's one-off form starts at 40 and keeps what fits. */
export function usualSize(kind: EventKind): number | null {
  if (kind === 'other') return null;
  return sizeFits(kind, 40) ? 40 : KIND_SIZES[kind][0]!;
}

const isWhole = (s: string) => /^\d{1,2}$/.test(s);

/** The size the draft says: null is open (Event only), NaN is something unreadable. */
function sizeOf(draft: Draft): number | null {
  const typed = draft.size.trim();
  if (!typed) return usualSize(draft.kind);
  return isWhole(typed) ? Number(typed) : Number.NaN;
}

/** The counts typed, as the slash command's options (numbers, or left out). */
function countValues(draft: Draft, size: number | null): OptionValues {
  const values: OptionValues = {};
  if (size !== null) values.size = size;
  for (const c of COUNTS) {
    const typed = draft[c].trim();
    if (isWhole(typed)) values[c] = Number(typed);
  }
  return values;
}

/** The targets the event would play to: the counts typed, filled in from the kind's usual comp. */
function targetsOfDraft(draft: Draft, size: number | null): RoleTargets {
  const usual = defaultRoleTargets(draft.kind, size);
  return roleTargetsFrom(countValues(draft, size), draft.kind) ?? usual;
}

const sameTargets = (a: RoleTargets, b: RoleTargets) =>
  a.tank === b.tank && a.healer === b.healer && a.dps === b.dps;

/** Length in hours: "3", "2.5", "3h". Empty is the usual 3. */
function minutesOf(draft: Draft): number | null {
  const typed = draft.hours.trim().toLowerCase().replace(/\s*h$/, '');
  if (!typed) return DEFAULT_RAID_HOURS * 60;
  if (!/^\d+(\.\d+)?$/.test(typed)) return null;
  const minutes = Math.round(Number(typed) * 60);
  return minutes >= 30 && minutes <= 8 * 60 ? minutes : null;
}

const RAID_CREATE = raidsCommands.find((c) => c.name === 'raid-create')!;

export interface DraftCheck {
  /** What to fix before posting, in the site form's words; empty when it's ready. */
  problems: string[];
  /** raid-create's input, when nothing is wrong. */
  input: Record<string, unknown> | null;
  startsAt: number | null;
  size: number | null;
  targets: RoleTargets;
  countsTyped: boolean;
  minutes: number | null;
}

/** Stage 1's problems: name, where, when, and how long. */
function detailsProblems(
  draft: Draft,
  startsAt: number | null,
  minutes: number | null,
  zone: string,
  now: number,
) {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push(`Give the ${kindNoun(draft.kind)} a name.`);
  if (!draft.where.trim() && !instanceOptional(draft.kind)) {
    problems.push('Say where it runs, like Onyxia’s Lair.');
  }
  if (startsAt === null) {
    problems.push(
      `I couldn't read “${draft.start}” as a time. Use the guild's clock (${zone}), like ` +
        '`2026-11-10 8pm` or `2026-11-10 20:00`.',
    );
  } else if (startsAt <= now) {
    problems.push('That time has already passed. Pick a future one.');
  }
  if (minutes === null) problems.push('Length is half an hour to 8 hours, like 3 or 2.5.');
  return problems;
}

/** Stage 2's problems: a size the kind takes, whole counts, and counts that fit the size. */
function compProblems(draft: Draft, size: number | null, targets: RoleTargets) {
  const problems: string[] = [];
  if (Number.isNaN(size) || !sizeFits(draft.kind, size)) {
    problems.push(
      draft.kind === 'other'
        ? `An event is 1 to ${MAX_EVENT_SIZE} players, or leave the size empty for an open one.`
        : `${AKind(draft.kind)} is ${sizesText(draft.kind)} players.`,
    );
  }
  if (COUNTS.some((c) => draft[c].trim() && !isWhole(draft[c].trim()))) {
    problems.push('Tank, healer, and DPS counts are whole numbers, 0 or more.');
  }
  if (size !== null && !Number.isNaN(size) && targets.tank + targets.healer + targets.dps > size) {
    problems.push(`The counts add up to more than ${size} players.`);
  }
  return problems;
}

/** raid-create's own schema on the input, as one problem line; null when it parses. */
function schemaProblem(input: Record<string, unknown>, kind: EventKind): string | null {
  const parsed = RAID_CREATE.input.safeParse(input);
  if (parsed.success) return null;
  const first = parsed.error.issues[0];
  const where = first?.path?.length ? `${first.path.join('.')}: ` : '';
  return `That ${kindNoun(kind)} isn’t valid. ${where}${first?.message ?? ''}`.trim();
}

/**
 * Everything raid-create would refuse, said early. The kind rules, sizes, and counts come from
 * the same contract helpers the command uses, and a draft that passes them is parsed with
 * raid-create's own input schema, so the preview can't approve what the schema won't.
 */
export function checkDraft(draft: Draft, zone: string, now: number): DraftCheck {
  const startsAt = parseLocalTime(draft.start, zone);
  const minutes = minutesOf(draft);
  const typedSize = sizeOf(draft);
  const size = Number.isNaN(typedSize) ? null : typedSize;
  const targets = targetsOfDraft(draft, size);
  const countsTyped = !sameTargets(targets, defaultRoleTargets(draft.kind, size));
  const base = { startsAt, size, targets, minutes, countsTyped };
  const problems = [
    ...detailsProblems(draft, startsAt, minutes, zone, now),
    ...compProblems(draft, typedSize, targets),
  ];
  if (problems.length > 0) return { ...base, problems, input: null };
  const input = {
    name: draft.name.trim(),
    instance: draft.where.trim(),
    kind: draft.kind,
    size,
    startsAt,
    durationMinutes: minutes,
    ...(countsTyped ? { roleTargets: targets } : {}),
  };
  const refused = schemaProblem(input, draft.kind);
  return refused ? { ...base, problems: [refused], input: null } : { ...base, problems, input };
}

// ── The two forms ────────────────────────────────────────────────────────────────────────────

const KIND_DESCRIPTIONS: Record<EventKind, string> = {
  raid: '10, 20 or 40 players',
  dungeon: '5 players',
  battleground: '10, 15 or 40 players, no tanks',
  other: 'Any size or open; where is optional',
};

const value = (text: string | undefined) => (text ? { value: text } : {});

/** Stage 1: the name, kind, where, when, and how long. Submit shows the draft. */
export function detailsForm(
  draft: Partial<Draft>,
  zone: string,
  customId: string = FORM_IDS.details,
): InteractionResponse {
  const kind = draft.kind ?? 'raid';
  const kinds: SelectOption[] = EVENT_KINDS.map((k) => ({
    label: KIND_LABELS[k],
    value: k,
    description: KIND_DESCRIPTIONS[k],
    ...(k === kind ? { default: true } : {}),
  }));
  return modal(
    customId,
    'New event',
    label(
      'Name',
      labelledTextInput('name', {
        required: true,
        max_length: MAX.name,
        placeholder: 'Raid night',
        ...value(draft.name),
      }),
      'Submit to set up the event.',
    ),
    label('Kind', stringSelect('kind', kinds)),
    label(
      'Where',
      labelledTextInput('where', {
        required: false,
        max_length: MAX.where,
        placeholder: 'Onyxia’s Lair',
        ...value(draft.where),
      }),
      'Needed except for Event (Westfall, levels 10–20)',
    ),
    label(
      'Date and time',
      labelledTextInput('start', {
        required: true,
        max_length: MAX.start,
        placeholder: '2026-11-10 8pm',
        ...value(draft.start),
      }),
      `In the guild’s clock (${zone}), like 2026-11-10 8pm or 20:00`.slice(0, 100),
    ),
    label(
      'Length in hours',
      labelledTextInput('hours', {
        required: false,
        max_length: MAX.hours,
        placeholder: String(DEFAULT_RAID_HOURS),
        value: draft.hours || String(DEFAULT_RAID_HOURS),
      }),
      'Half an hour to 8 hours',
    ),
  );
}

const HINT_STAGE_2 = 'Submit to preview, then Post event.';

/** The counts the stage 2 form shows: what was typed, else the usual comp for the size. */
function shownCounts(draft: Draft): Record<Count, string> {
  const size = sizeOf(draft);
  const targets = targetsOfDraft(draft, Number.isInteger(size) ? size : null);
  const shown = { tanks: targets.tank, healers: targets.healer, dps: targets.dps };
  return Object.fromEntries(COUNTS.map((c) => [c, draft[c].trim() || String(shown[c])])) as Record<
    Count,
    string
  >;
}

/** The note on the first count: what leaving the counts alone does. */
function countsHint(draft: Draft): string {
  if (draft.kind === 'other') {
    return 'Optional: leave them empty and the card lists everyone in one column.';
  }
  // Usual counts follow the size; counts the member set stay as set, whatever size is picked.
  return COUNTS.some((c) => draft[c].trim())
    ? 'Set by you: they stay as they are, so change them to fit a new size.'
    : 'Left as they are, they follow the size you pick.';
}

/** Which counts the kind asks for: battlegrounds have no tanks. */
const countsFor = (kind: EventKind): readonly Count[] =>
  kind === 'battleground' ? ['healers', 'dps'] : COUNTS;

/**
 * Stage 2, built for the kind: its sizes (a box for Event, where empty is open) and the counts,
 * prefilled. Counts left as they were follow the size picked here (see `readKindForm`).
 */
export function kindForm(draft: Draft): InteractionResponse {
  const { kind } = draft;
  const size = sizeOf(draft);
  const sizeField =
    kind === 'other'
      ? label(
          'Size',
          labelledTextInput('size', {
            required: false,
            max_length: MAX.count,
            placeholder: 'Empty for open: no cap, no queue',
            ...value(draft.size.trim()),
          }),
          HINT_STAGE_2,
        )
      : label(
          'Size',
          stringSelect(
            'size',
            KIND_SIZES[kind].map((n) => ({
              label: `${n} players`,
              value: String(n),
              ...(n === size ? { default: true } : {}),
            })),
          ),
          HINT_STAGE_2,
        );
  const shown = shownCounts(draft);
  const counts = countsFor(kind).map((c, i) =>
    label(
      COUNT_LABELS[c],
      labelledTextInput(c, {
        required: false,
        max_length: MAX.count,
        placeholder: kind === 'other' ? '0' : shown[c],
        ...value(kind === 'other' && !draft[c].trim() ? '' : shown[c]),
      }),
      i > 0 ? undefined : countsHint(draft),
    ),
  );
  return modal(`${FORM_IDS.kind}:${kind}`, `${KIND_LABELS[kind]} details`, sizeField, ...counts);
}

/**
 * The stage 2 answers on top of the draft. Counts all left as the form showed them keep what the
 * draft had, so usual counts follow the size picked here (20 instead of 40 brings the 20-player
 * comp, not 40's numbers). Change any one and all of them are taken as shown, so nothing the
 * member saw is quietly refilled.
 */
export function readKindForm(draft: Draft, interaction: Interaction): Draft {
  const text = modalValues(interaction);
  const picked = modalSelections(interaction);
  const shown = shownCounts(draft);
  const size = draft.kind === 'other' ? (text.size ?? '') : (picked.size?.[0] ?? '');
  const next: Draft = { ...draft, size: size.trim().slice(0, MAX.count), step: 2 };
  const asked = countsFor(draft.kind);
  const typed = (c: Count) => (text[c] ?? '').trim().slice(0, MAX.count);
  // Event shows empty boxes for counts it has none of, so empty is "as shown" there too.
  const asShown = (c: Count) => typed(c) === shown[c] || (!typed(c) && !draft[c].trim());
  const touched = asked.some((c) => !asShown(c));
  for (const c of COUNTS) {
    if (!asked.includes(c)) next[c] = '';
    else next[c] = touched ? typed(c) : draft[c];
  }
  return next;
}

/** The stage 1 answers, on top of the earlier draft when there is one. */
function readDetailsForm(
  interaction: Interaction,
  user: string,
  earlier: Draft | null,
  extras: Pick<Draft, 'size' | Count>,
): Draft | null {
  const text = modalValues(interaction);
  const kind = modalSelections(interaction).kind?.[0];
  const parsed = draftSchema.safeParse({
    user,
    name: (text.name ?? '').trim(),
    kind,
    where: (text.where ?? '').trim(),
    start: (text.start ?? '').trim(),
    hours: (text.hours ?? '').trim(),
    // A new kind starts its size and comp over; the same kind keeps them.
    ...(earlier && earlier.kind === kind
      ? { size: earlier.size, tanks: earlier.tanks, healers: earlier.healers, dps: earlier.dps }
      : extras),
    step: earlier && earlier.kind === kind ? earlier.step : 1,
  });
  return parsed.success ? parsed.data : null;
}

// ── The preview ──────────────────────────────────────────────────────────────────────────────

const hoursText = (minutes: number) => {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace(/\.0$/, '')} ${hours === 1 ? 'hour' : 'hours'}`;
};

/** The draft as a private message: what it would make, what's wrong, and the next buttons. */
export function previewMessage(
  draft: Draft,
  zone: string,
  now: number,
  refusal?: string,
): MessageData {
  const check = checkDraft(draft, zone, now);
  const problems = refusal ? [...check.problems, refusal] : check.problems;
  const sizeText =
    check.size === null
      ? draft.kind === 'other'
        ? 'Open: no cap, no queue'
        : 'Not set'
      : sizeLabel(draft.kind, check.size);
  const roles = `${rolesText(check.targets)}${check.countsTyped ? '' : ' (the usual comp)'}`;
  const fields = [
    { name: 'Kind', value: KIND_LABELS[draft.kind], inline: true },
    { name: 'Where', value: draft.where.trim() || 'Anywhere', inline: true },
    {
      name: 'Starts',
      value: check.startsAt === null ? 'Not readable yet' : when(check.startsAt),
      inline: false,
    },
    { name: 'Size', value: sizeText, inline: true },
    {
      name: 'Length',
      value: check.minutes === null ? 'Not readable yet' : hoursText(check.minutes),
      inline: true,
    },
    { name: 'Roles', value: roles, inline: false },
    ...(problems.length
      ? [{ name: 'Fix before posting', value: problems.map((p) => `• ${p}`).join('\n') }]
      : []),
  ];
  const stage2 = draft.step === 2;
  const description = stage2
    ? problems.length
      ? 'Fix what’s below, then **Post event**.'
      : 'Check it, then **Post event**. Its signup card goes up in the signup channel.'
    : '**Set up event** next for its size and comp.';
  const card: Embed = embed({
    title: draft.name.trim() || `New ${kindNoun(draft.kind)}`,
    description,
    fields,
    footer: { text: `Only you can see this draft. ${encodeDraft(draft)}` },
  });
  const buttons = stage2
    ? [
        button(FORM_IDS.post, POST_LABEL, ButtonStyle.SUCCESS, { disabled: problems.length > 0 }),
        button(FORM_IDS.edit, 'Edit details'),
        button(FORM_IDS.editKind, 'Edit size and comp'),
        button(FORM_IDS.cancel, 'Cancel'),
      ]
    : [
        button(FORM_IDS.next, SET_UP_LABEL, ButtonStyle.PRIMARY),
        button(FORM_IDS.edit, 'Edit details'),
        button(FORM_IDS.cancel, 'Cancel'),
      ];
  return { embeds: [card], components: [actionRow(...buttons)], allowed_mentions: { parse: [] } };
}

// ── Routing ──────────────────────────────────────────────────────────────────────────────────

const isCreate = (interaction: Interaction) => {
  const [group, sub] = subcommandPath(interaction);
  return interaction.data?.name === SLASH_COMMAND && group === EVENT_GROUP && sub === 'create';
};

/** A bare (or partly typed) `/random event create`: no name or no start, so the form opens. */
function opensForm(interaction: Interaction): boolean {
  if (interaction.type !== InteractionType.APPLICATION_COMMAND || !isCreate(interaction)) {
    return false;
  }
  const values = commandOptions(interaction);
  return !String(values.name ?? '').trim() || !String(values.start ?? '').trim();
}

const formId = (interaction: Interaction) => {
  const id = interaction.data?.custom_id ?? '';
  return id.startsWith(`${FORM_PREFIX}:`) && id.length <= 100 ? id : null;
};

/** Is this one of the form's steps? */
export function isEventFormInteraction(interaction: Interaction): boolean {
  if (opensForm(interaction)) return true;
  return (
    (interaction.type === InteractionType.MESSAGE_COMPONENT ||
      interaction.type === InteractionType.MODAL_SUBMIT) &&
    formId(interaction) !== null
  );
}

/** Size and counts typed as slash options, carried in the stage 1 custom id until it comes back. */
const EXTRAS_SHAPE = /^evform:new(?::(\d{0,2}):(\d{0,2}):(\d{0,2}):(\d{0,2}))?$/;

function extrasId(values: OptionValues): string {
  const part = (v: unknown) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100 ? String(v) : '';
  const parts = [values.size, values.tanks, values.healers, values.dps].map(part);
  return parts.some(Boolean) ? `${FORM_IDS.details}:${parts.join(':')}` : FORM_IDS.details;
}

function draftFromOptions(values: OptionValues): Partial<Draft> {
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const kind = (EVENT_KINDS as readonly unknown[]).includes(values.kind)
    ? (values.kind as EventKind)
    : 'raid';
  return {
    name: text(values.name, MAX.name),
    kind,
    where: text(values.instance, MAX.where),
    start: text(values.start, MAX.start),
    hours: typeof values.hours === 'number' ? String(values.hours).slice(0, MAX.hours) : '',
  };
}

const NOT_YOURS = 'That form belongs to someone else. Start your own with `/random event create`.';
const EXPIRED =
  'I can’t read that form any more. Start again with `/random event create`; nothing was made.';

const done = (content: string) =>
  updateMessage({ content, embeds: [], components: [], allowed_mentions: { parse: [] } });

/**
 * A step of the New event form, or null when the interaction isn't one. Every step checks the
 * server and the member (discordCaller) and the Raid Leader tier before anything else.
 */
export async function handleEventFormInteraction(
  interaction: Interaction,
  ports: EventPorts,
): Promise<InteractionResponse | null> {
  if (!isEventFormInteraction(interaction)) return null;
  const who = await discordCaller(interaction, ports, 'raids');
  if ('refusal' in who) return who.refusal;
  const { caller } = who;
  const user = interactionUser(interaction)?.id ?? '';
  const component = interaction.type === InteractionType.MESSAGE_COMPONENT;
  if (!tierAllows(caller.tier, 'leader')) {
    return component ? done(NEEDS_LEADER) : ephemeral(NEEDS_LEADER);
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const values = commandOptions(interaction);
    const zone = await guildTimeZone(ports, caller);
    return detailsForm(draftFromOptions(values), zone, extrasId(values));
  }

  const id = formId(interaction)!;
  const earlier = draftOf(interaction);
  if (earlier && earlier.user !== user) return ephemeral(NOT_YOURS);

  const step = { interaction, ports, caller, user, id, earlier };
  return interaction.type === InteractionType.MODAL_SUBMIT ? submitted(step) : clicked(step);
}

interface Step {
  interaction: Interaction;
  ports: EventPorts;
  caller: Caller;
  /** The Discord user acting. */
  user: string;
  id: string;
  /** The draft on the message the step came from, already checked to be this user's. */
  earlier: Draft | null;
}

/** A form came back: stage 1 (new or edited) or stage 2. Either way, the preview. */
async function submitted({ interaction, ports, caller, user, id, earlier }: Step) {
  const zone = await guildTimeZone(ports, caller);
  const extras = EXTRAS_SHAPE.exec(id);
  if (extras) {
    const [, size = '', tanks = '', healers = '', dps = ''] = extras;
    const draft = readDetailsForm(interaction, user, earlier, { size, tanks, healers, dps });
    if (!draft) return ephemeral(EXPIRED);
    const preview = previewMessage(draft, zone, ports.now());
    // From Edit details the preview is there to update; from the slash command it's new.
    return earlier ? updateMessage(preview) : reply(preview, { ephemeral: true });
  }
  if (!id.startsWith(`${FORM_IDS.kind}:`) || !earlier) return ephemeral(EXPIRED);
  // The form was built for the draft's kind; one for another kind doesn't fit it.
  const kind = id.slice(`${FORM_IDS.kind}:`.length);
  const draft = kind === earlier.kind ? readKindForm(earlier, interaction) : earlier;
  return updateMessage(previewMessage(draft, zone, ports.now()));
}

/** A button on the preview. */
async function clicked({ ports, caller, id, earlier }: Step) {
  if (id === FORM_IDS.cancel) return done(CANCELLED);
  if (!earlier) return done(EXPIRED);
  if (id === FORM_IDS.next || id === FORM_IDS.editKind) return kindForm(earlier);
  if (id === FORM_IDS.edit) return detailsForm(earlier, await guildTimeZone(ports, caller));
  if (id === FORM_IDS.post) return post(ports, caller, earlier);
  return null;
}

/** Post event: raid-create as the member, exactly as the slash command runs it. */
async function post(ports: EventPorts, caller: Caller, draft: Draft) {
  const zone = await guildTimeZone(ports, caller);
  const now = ports.now();
  const check = checkDraft(draft, zone, now);
  if (draft.step !== 2 || !check.input || check.startsAt === null) {
    return updateMessage(previewMessage(draft, zone, now));
  }
  // The same draft clicked twice (or a click Discord sent again) makes one event, not two.
  const twin = await ports.run(caller, 'raid-list', {
    from: check.startsAt,
    to: check.startsAt + 1,
  });
  const existing = twin.success
    ? ((twin.data as { event: RaidEvent }[] | undefined) ?? [])
        .map((row) => row.event)
        .find(
          (e) =>
            e.startsAt === check.startsAt && e.name === check.input?.name && e.kind === draft.kind,
        )
    : undefined;
  if (existing) return done(`**${existing.name}** is already made for ${when(existing.startsAt)}.`);
  const result = await ports.run(caller, 'raid-create', check.input);
  if (!result.success) {
    const why = failureText(result, NEEDS_LEADER, `That ${kindNoun(draft.kind)} isn't valid.`);
    return updateMessage(previewMessage(draft, zone, now, why));
  }
  await ports.afterChange();
  return done(madeText(result.data as RaidEvent));
}
