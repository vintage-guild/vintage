// Signup buttons on the coordinator's raid posts (PLAN §6.1) and the private reply's menus
// (#148). Pure over ports, so Convex (convex/discord.ts) and the JTBD host run the same flow:
//   button  signup:<eventId>:<status>                 → sign up with signup-suggest's guess (a
//                                                       reason form first for late/tentative),
//                                                       or the picker when there's no guess
//   select  signup-pick:<eventId>:<status>             → the chosen character, then as above
//   modal   signup-note:<eventId>:<status>:<ch>        → answer with the typed reason as the note
//                                                       (and the guessed spec, when <ch> is the
//                                                       guess; no spec in the id keeps it ≤ 100)
//   select  signup-char:<eventId>                      → Switch character: same answer, another
//                                                       character (any spec for the raid clears)
//   select  signup-spec:<eventId>                      → Change spec: same character, another
//                                                       spec of its class, for this raid only
//   select  signup-role:<eventId>                      → Role: same character and spec, another
//                                                       role for this raid (or back to the
//                                                       spec's), e.g. a Fury warrior tanking
//   modal   signup-new:<eventId>:<status>              → New character (#149): ➕ in the picker
//                                                       or Switch character (or a button click
//                                                       with no characters yet) opens it; the
//                                                       submit runs character-add, then
//                                                       signup-set with the new character
// Every reply is ephemeral: only the person who clicked sees it. The post itself is refreshed by
// the coordinator tick that `afterChange` starts.

import { renderRosterReply } from '@vintage/coordinator/commands';
import {
  actionRow,
  ButtonStyle,
  button,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  type MessageData,
  modal,
  modalValues,
  reply,
  type SelectOption,
  stringSelect,
  TextInputStyle,
  textInput,
  updateMessage,
} from '@vintage/discord-kit';
import { type Caller, type CommandResult, tierAllows } from '@vintage/guild-kit';
import type { Character, GuildRank, Member } from '@vintage/identity/contract';
import {
  type Absence,
  accessOf,
  type CompRole,
  compRole,
  kindOf,
  LATE_MINUTES,
  type LateMinutes,
  type RaidEvent,
  resolveAbsenceCoverage,
  rolesNeeded,
  type Signup,
  type SignupGuess,
  type SignupStatus,
  solveEventComp,
} from '@vintage/raids/contract';
import { CLASSES, classRoles, ROLES, type Role, roleFor } from '@vintage/wow-data';
import {
  GUESS_ROLE,
  NEW_CHARACTER,
  type NoteField,
  newCharacterForm,
  readNewCharacter,
} from './discord-characters';
import { failureText, playing, ROLE_WORDS, specName, titleCase } from './discord-common';

const STATUSES: readonly SignupStatus[] = ['accepted', 'late', 'tentative', 'bench', 'declined'];
/** Answers that open the reason form (Late asks 5/15/30 min buttons instead). */
const ASKS_REASON: ReadonlySet<SignupStatus> = new Set(['tentative']);

export interface SignupInput {
  eventId: string;
  characterId: string;
  status: SignupStatus;
  lateMinutes?: LateMinutes | null;
  note?: string | null;
  spec?: string;
  /** A role for this raid; null follows the spec again. */
  role?: Role | null;
  alsoRoles?: Role[];
}

/** What character-add takes, from the New character form. */
export interface NewCharacterInput {
  name: string;
  class: string;
  spec: string;
  role?: Role;
  alsoRoles?: Role[];
}

export interface SignupPorts {
  /** The guild's Discord server id; clicks from any other server are refused. */
  discordGuildId: string | undefined;
  /** The Vintage guild id the caller acts in. */
  guildId: string;
  memberByDiscordId(discordId: string): Promise<Member | null>;
  characters(memberId: string): Promise<Character[]>;
  event(eventId: string): Promise<RaidEvent | null>;
  signup(eventId: string, memberId: string): Promise<Signup | null>;
  /** Everyone signed up for the raid (the Roster button, and the "needed" hints). */
  signups(eventId: string): Promise<Signup[]>;
  /** Runs `signup-suggest` through the registry as this caller. */
  signupSuggest(
    caller: Caller,
    input: { eventId: string },
  ): Promise<CommandResult<SignupGuess | null>>;
  /** Runs `signup-set` through the registry as this caller. */
  signupSet(caller: Caller, input: SignupInput): Promise<CommandResult<Signup>>;
  /** Runs `character-add` through the registry as this caller (the New character form). */
  characterAdd(caller: Caller, input: NewCharacterInput): Promise<CommandResult<Character>>;
  /** Active absences for one member (for weekly late nights on Accept/Late). */
  absences?(memberId: string): Promise<Absence[]>;
  /** All guild members + active absences (for Roster reply rank marks & Absent section). */
  rosterContext?(): Promise<{ members: Member[]; absences: Absence[] }>;
  /** On-the-spot member sync when a new Friend clicks a signup button (J70). */
  syncMember?(input: {
    discordId: string;
    displayName: string;
    inServer: boolean;
    roleIds: string[];
  }): Promise<Member | null>;
  /** A signup changed: refresh the post soon (starts a coordinator tick). */
  afterChange(): Promise<void>;
}

type Parsed =
  | { kind: 'button'; eventId: string; status: SignupStatus }
  | { kind: 'pick'; eventId: string; status: SignupStatus; characterId: string }
  | { kind: 'late'; eventId: string; characterId: string; lateMinutes: LateMinutes }
  | {
      kind: 'note';
      eventId: string;
      status: SignupStatus;
      characterId: string;
      note: string | null;
    }
  | { kind: 'switch'; eventId: string; characterId: string }
  | { kind: 'spec'; eventId: string; spec: string }
  | { kind: 'role'; eventId: string; role: Role | null }
  | { kind: 'also'; eventId: string; alsoRoles: Role[] }
  | { kind: 'ontime'; eventId: string }
  | { kind: 'new'; eventId: string; status: SignupStatus };

const MENUS = new Set(['signup-char', 'signup-spec', 'signup-role', 'signup-also']);

const isStatus = (s: string | undefined): s is SignupStatus =>
  !!s && (STATUSES as readonly string[]).includes(s);
/** Ids and specs we put in custom ids and menu values: no `:` and nothing odd. */
const isToken = (s: string | undefined): s is string => !!s && /^[A-Za-z0-9_-]{1,64}$/.test(s);

/** The raid id when this is a Roster button click (`roster:<eventId>`). */
export function parseRosterInteraction(interaction: Interaction): string | null {
  const [prefix, eventId] = (interaction.data?.custom_id ?? '').split(':');
  return prefix === 'roster' && eventId && interaction.type === InteractionType.MESSAGE_COMPONENT
    ? eventId
    : null;
}

/**
 * The reply's menus (`signup-char:<event>`, `signup-spec:<event>`, `signup-role:<event>`): the
 * choice is the value.
 */
function parseMenu(interaction: Interaction, parts: string[]): Parsed | null {
  const [prefix, eventId] = parts;
  if (parts.length !== 2 || !isToken(eventId)) return null;
  if (interaction.type !== InteractionType.MESSAGE_COMPONENT) return null;
  if (prefix === 'signup-also') {
    const values = (interaction.data?.values ?? []).filter(isRole);
    return { kind: 'also', eventId, alsoRoles: values };
  }
  const picked = interaction.data?.values?.[0];
  if (!isToken(picked)) return null;
  if (prefix === 'signup-char') return { kind: 'switch', eventId, characterId: picked };
  if (prefix === 'signup-spec') return { kind: 'spec', eventId, spec: picked };
  if (prefix === 'signup-role') {
    if (picked === GUESS_ROLE) return { kind: 'role', eventId, role: null };
    return isRole(picked) ? { kind: 'role', eventId, role: picked } : null;
  }
  return null;
}

const isRole = (s: string): s is Role => (ROLES as readonly string[]).includes(s);

const isLateMinutes = (n: number): n is LateMinutes =>
  (LATE_MINUTES as readonly number[]).includes(n);

function parseLateButton(interaction: Interaction, parts: string[]): Parsed | null {
  if (interaction.type !== InteractionType.MESSAGE_COMPONENT || parts.length !== 4) return null;
  const [, eventId, characterId, rawMinutes] = parts;
  const minutes = Number(rawMinutes);
  if (!isToken(eventId) || !isToken(characterId) || !isLateMinutes(minutes)) return null;
  return { kind: 'late', eventId, characterId, lateMinutes: minutes };
}

function parseModalSubmit(
  interaction: Interaction,
  parts: string[],
  eventId: string,
  status: SignupStatus,
): Parsed | null {
  if (interaction.type !== InteractionType.MODAL_SUBMIT) return null;
  const [prefix, , , characterId] = parts;
  if (prefix === 'signup-new' && parts.length === 3) return { kind: 'new', eventId, status };
  if (prefix === 'signup-note' && parts.length === 4 && isToken(characterId)) {
    const note = modalValues(interaction).note?.trim();
    return { kind: 'note', eventId, status, characterId, note: note ? note : null };
  }
  return null;
}

function parseOnTimeButton(interaction: Interaction, parts: string[]): Parsed | null {
  const [, eventId] = parts;
  return interaction.type === InteractionType.MESSAGE_COMPONENT &&
    parts.length === 2 &&
    isToken(eventId)
    ? { kind: 'ontime', eventId }
    : null;
}

/** The signup interaction this is, or null when it isn't one of ours. */
export function parseSignupInteraction(interaction: Interaction): Parsed | null {
  const parts = (interaction.data?.custom_id ?? '').split(':');
  const [prefix, eventId, status] = parts;
  if (prefix && MENUS.has(prefix)) return parseMenu(interaction, parts);
  if (prefix === 'signup-ontime') return parseOnTimeButton(interaction, parts);
  if (prefix === 'signup-late') return parseLateButton(interaction, parts);
  if (!isToken(eventId) || !isStatus(status)) return null;
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    return parseModalSubmit(interaction, parts, eventId, status);
  }
  if (interaction.type !== InteractionType.MESSAGE_COMPONENT || parts.length !== 3) return null;
  if (prefix === 'signup') return { kind: 'button', eventId, status };
  const picked = interaction.data?.values?.[0];
  if (prefix === 'signup-pick' && isToken(picked)) {
    return { kind: 'pick', eventId, status, characterId: picked };
  }
  return null;
}

const ephemeral = (content: string) => reply(content, { ephemeral: true });

const NEEDS_FRIEND_FOR_CHARACTERS =
  'Adding a character needs the Friend rank or higher in this server. Ask an officer if that seems wrong.';

const NEEDS_RECRUIT =
  'Signing up needs the Recruit rank or higher in this server. Ask an officer if that seems wrong.';

const LABEL: Record<SignupStatus, string> = {
  accepted: 'Accepted',
  late: 'Late',
  tentative: 'Tentative',
  bench: 'Standby',
  declined: 'Absent',
};

const NEEDED_WORDS: Record<CompRole, string> = {
  tank: 'tanks needed',
  healer: 'healers needed',
  dps: 'DPS needed',
};

/** " · healers needed" when the raid is short of this role, else nothing. */
const neededHint = (role: Role, needed: CompRole[]) =>
  needed.includes(compRole(role)) ? ` · ${NEEDED_WORDS[compRole(role)]}` : '';

/**
 * The roles the raid is short of, not counting the member: what they'd fill by switching, so a
 * healer already going still sees "healers needed" while the raid is short.
 */
const rolesShort = (event: RaidEvent, signups: Signup[], member: Member) =>
  rolesNeeded(
    event,
    signups.filter((s) => s.memberId !== member.id),
  );

/** The last entry in the picker and Switch character: opens the New character form (#149). */
const NEW_OPTION: SelectOption = {
  label: 'New character…',
  value: NEW_CHARACTER,
  description: 'Add it and sign up with it in one go',
  emoji: { name: '➕' },
};

function characterOptions(characters: Character[], needed: CompRole[], current?: string) {
  // Main first (identity already sorts so; keep it true whatever the port returns).
  const sorted = [...characters].sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const own = sorted.slice(0, 24).map(
    (c): SelectOption => ({
      label: c.name,
      value: c.id,
      description: `${playing(c)}${c.isMain ? ' · main' : ''}${neededHint(c.role, needed)}`.slice(
        0,
        100,
      ),
      ...(c.id === current ? { default: true } : {}),
    }),
  );
  return [...own, NEW_OPTION];
}

function specOptions(signup: Signup, needed: CompRole[]): SelectOption[] {
  const specs: Record<string, Role> = CLASSES[signup.class];
  return Object.entries(specs).map(([spec, role]) => ({
    label: specName(spec),
    value: spec,
    description: `${titleCase(ROLE_WORDS[role])}${neededHint(role, needed)}`,
    ...(spec === signup.spec ? { default: true } : {}),
  }));
}

/**
 * The Role menu's choices: "Guess from the spec (Tank)" first, then each role. The guess is the
 * character's saved role for its saved spec (which may itself be picked), else the spec's.
 */
function roleOptions(signup: Signup, character: Character | undefined, needed: CompRole[]) {
  const guess =
    character && character.spec === signup.spec
      ? character.role
      : roleFor(signup.class, signup.spec);
  const options: SelectOption[] = [
    {
      label: `Guess from the spec${guess ? ` (${titleCase(ROLE_WORDS[guess])})` : ''}`,
      value: GUESS_ROLE,
      ...(signup.rolePicked ? {} : { default: true }),
    },
  ];
  for (const role of ROLES) {
    const hints = [
      character?.alsoRoles.includes(role) ? 'also plays' : '',
      neededHint(role, needed).slice(3),
    ].filter(Boolean);
    options.push({
      label: titleCase(ROLE_WORDS[role]),
      value: role,
      ...(hints.length > 0 ? { description: hints.join(' · ') } : {}),
      ...(signup.rolePicked && signup.role === role ? { default: true } : {}),
    });
  }
  return options;
}

const noteField = (_status: SignupStatus): NoteField => ({
  label: 'What might stop you? (optional, leaders only)',
  placeholder: 'Might have to work',
});

function reasonForm(eventId: string, status: SignupStatus, characterId: string, raid: string) {
  const field = noteField(status);
  return modal(
    `signup-note:${eventId}:${status}:${characterId}`,
    `Tentative for ${raid}`.slice(0, 45),
    textInput('note', field.label, {
      style: TextInputStyle.SHORT,
      required: false,
      max_length: 200,
      placeholder: field.placeholder,
    }),
  );
}

/** Private 5 / 15 / 30 min buttons for Late (more than 30 min is absent). */
function latePickerMessage(
  eventId: string,
  characterId: string,
  raid: string,
  usualMinutes: LateMinutes | null = null,
): MessageData {
  return {
    content: `How late will you be for ${raid}?\nLater than 30 minutes? Press Absent instead.`,
    components: [
      actionRow(
        ...LATE_MINUTES.map((m) =>
          button(
            `signup-late:${eventId}:${characterId}:${m}`,
            m === usualMinutes ? `${m} min (usual)` : `${m} min`,
            m === usualMinutes ? ButtonStyle.PRIMARY : ButtonStyle.SECONDARY,
          ),
        ),
      ),
    ],
  };
}

function latePicker(
  eventId: string,
  characterId: string,
  raid: string,
  usualMinutes: LateMinutes | null = null,
): InteractionResponse {
  return reply(latePickerMessage(eventId, characterId, raid, usualMinutes), { ephemeral: true });
}

/**
 * The New character form for this raid. `signup-new:<event>:<status>` stays well inside Discord's
 * 100 characters with 32-character Convex ids (at most 10 + 32 + 9 + 2). A late or tentative
 * answer asks for its note in the same form, since a modal can't open another.
 */
function newCharacterFormFor(
  eventId: string,
  status: SignupStatus,
  raid: string,
  withNote: boolean,
) {
  return newCharacterForm(
    `signup-new:${eventId}:${status}`,
    `New character for ${raid}`,
    withNote && ASKS_REASON.has(status) ? noteField(status) : undefined,
  );
}

function characterPicker(
  eventId: string,
  status: SignupStatus,
  characters: Character[],
  needed: CompRole[],
) {
  return reply(
    {
      content: 'Which character are you bringing?',
      components: [
        actionRow(
          stringSelect(`signup-pick:${eventId}:${status}`, characterOptions(characters, needed), {
            placeholder: 'Pick a character',
          }),
        ),
      ],
    },
    { ephemeral: true },
  );
}

/**
 * When a going signup overflows the comp solver onto Standby pre-approval, return comp-solver's
 * bench reason (e.g. "melee slots full (10/10)" or "raid full (20/20)"); otherwise null.
 */
function compBenchReason(
  event: RaidEvent,
  signup: Signup,
  signups: readonly Signup[],
  members: readonly Member[],
): string | null {
  if (
    (signup.status !== 'accepted' && signup.status !== 'late') ||
    signup.roster === 'benched' ||
    event.size === null ||
    !signup.id ||
    !signup.class ||
    !signup.spec
  ) {
    return null;
  }
  const combined = signups.some((r) => r.id === signup.id) ? signups : [...signups, signup];
  const valid = combined
    .filter((r) => Boolean(r.id && r.class && r.spec))
    .map((r) => ({ ...r, signedUpAt: r.signedUpAt ?? 0 }));
  const ranks = new Map<string, GuildRank | null>(members.map((m) => [m.id, m.rank]));
  const comp = solveEventComp(event, valid, ranks, { goingOnly: true });
  const decision = comp.bench.find((d) => d.signup.id === signup.id);
  return decision && decision.code !== 'standby' ? decision.reason : null;
}

/** Standby explanation for the private reply (signup-improvements row 38). */
function standbyTail(
  s: Signup,
  member: Member,
  event: RaidEvent,
  benchReason: string | null = null,
): string | null {
  if (s.status !== 'bench' && s.roster !== 'benched' && !benchReason) return null;
  if (kindOf(event) === 'raid' && accessOf(event) === 'guild' && member.rank === 'flex-raider') {
    return "You're on Standby because Flex Raiders start on Standby for guild raids; leaders seat you where the comp needs you.";
  }
  if (event.rosterApprovedAt !== null) {
    return "You're on Standby because parties are already approved; leaders will seat you if a spot opens.";
  }
  if (benchReason) {
    return `You're on Standby (${benchReason}); leaders will seat you if a spot opens.`;
  }
  return "You're on Standby; leaders will seat you if a spot opens.";
}

function alsoRoleOptions(signup: Signup): SelectOption[] {
  const otherRoles = classRoles(signup.class).filter((r) => r !== signup.role);
  const current = signup.alsoRoles ?? [];
  return otherRoles.map((role) => ({
    label: titleCase(ROLE_WORDS[role]),
    value: role,
    ...(current.includes(role) ? { default: true } : {}),
  }));
}

function outcomeHead(
  event: RaidEvent,
  s: Signup,
  reason: string | null,
  fromWeeklyLate?: boolean,
): string {
  if (fromWeeklyLate) {
    return `**Late** for ${event.name} as **${s.characterName}**, ${s.lateMinutes} minutes, like most weeks.`;
  }
  const why = reason ? `: ${reason}` : '';
  const statusLabel =
    s.status === 'late' && s.lateMinutes
      ? `${LABEL[s.status]} (${s.lateMinutes}m)`
      : LABEL[s.status];
  return `**${statusLabel}** for ${event.name} as **${s.characterName}** (${playing(s)})${why}.`;
}

/**
 * The private reply after signup-set: what was used and why, with Switch character (which also
 * offers New character…), Change spec, Role, and Can also play menus (<= 5 rows). An Absent
 * reply gets an "Absent more days" button instead.
 */
async function outcome(
  ports: SignupPorts,
  member: Member,
  event: RaidEvent,
  result: CommandResult<Signup>,
  reason: string | null,
  options: { fromWeeklyLate?: boolean } = {},
): Promise<MessageData> {
  if (!result.success) {
    const error = result.error!;
    const content =
      error.code === 'COMMAND_NOT_FOUND'
        ? NEEDS_RECRUIT
        : [error.message, error.suggestion].filter(Boolean).join('. ');
    return { content, components: [] };
  }
  const s = result.data!;
  const head = outcomeHead(event, s, reason, options.fromWeeklyLate);
  if (s.status === 'declined') {
    return {
      content: `${head}\nThe signup post updates in a few seconds.`,
      components: [
        actionRow(button('absence-more-days', 'Absent more days', ButtonStyle.SECONDARY)),
      ],
    };
  }

  const [characters, signups, rosterCtx] = await Promise.all([
    ports.characters(member.id),
    ports.signups(event.id),
    ports.rosterContext?.() ?? Promise.resolve(null),
  ]);
  const membersForComp = rosterCtx?.members ?? [member];
  const benchReason = compBenchReason(event, s, signups, membersForComp);
  const tail =
    standbyTail(s, member, event, benchReason) ?? 'The signup post updates in a few seconds.';
  const content = `${head}\n${tail}`;
  const needed = rolesShort(event, signups, member);
  const components = [];
  // Switch character always shows now: with one character it still offers New character….
  if (characters.length > 0) {
    components.push(
      actionRow(
        stringSelect(
          `signup-char:${event.id}`,
          characterOptions(characters, needed, s.characterId),
          {
            placeholder: 'Switch character',
          },
        ),
      ),
    );
  }
  components.push(
    actionRow(
      stringSelect(`signup-spec:${event.id}`, specOptions(s, needed), {
        placeholder: 'Change spec',
      }),
    ),
    actionRow(
      stringSelect(
        `signup-role:${event.id}`,
        roleOptions(
          s,
          characters.find((c) => c.id === s.characterId),
          needed,
        ),
        { placeholder: 'Role' },
      ),
    ),
  );
  const alsoOpts = alsoRoleOptions(s);
  if (alsoOpts.length > 0 && components.length < 4) {
    components.push(
      actionRow(
        stringSelect(`signup-also:${event.id}`, alsoOpts, {
          placeholder: 'Can also play',
          min_values: 0,
          max_values: alsoOpts.length,
        }),
      ),
    );
  }
  if (options.fromWeeklyLate && components.length < 5) {
    components.push(
      actionRow(button(`signup-ontime:${event.id}`, 'On time this week', ButtonStyle.SUCCESS)),
    );
  }
  return { content, components };
}

async function answer(
  ports: SignupPorts,
  caller: Caller,
  member: Member,
  event: RaidEvent,
  input: Omit<SignupInput, 'eventId'>,
  reason: string | null,
  respond: (message: MessageData) => InteractionResponse,
  options: { fromWeeklyLate?: boolean } = {},
) {
  const result = await ports.signupSet(caller, { eventId: event.id, ...input });
  if (result.success) await ports.afterChange();
  return respond(await outcome(ports, member, event, result, reason, options));
}

const replyPrivately = (message: MessageData) => reply(message, { ephemeral: true });
// Replace the ephemeral picker or reply the menu was on.
const replaceReply = (message: MessageData) => updateMessage(message);

/** signup-suggest's guess, or null (also when the command fails: then the picker asks). */
async function guess(ports: SignupPorts, caller: Caller, eventId: string) {
  const result = await ports.signupSuggest(caller, { eventId });
  return result.success ? (result.data ?? null) : null;
}

/** The clicking member, or the refusal to send when they can't use signups here. */
async function whoIsClicking(
  interaction: Interaction,
  ports: SignupPorts,
  event: RaidEvent,
): Promise<{ member: Member } | { refusal: InteractionResponse }> {
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return { refusal: ephemeral('Random only takes signups in the Vintage guild server.') };
  }
  const user = interactionUser(interaction);
  let member = user ? await ports.memberByDiscordId(user.id) : null;
  // On-the-spot sync when a newly granted Friend/member clicks a signup button (J70).
  if (!member && user && ports.syncMember && interaction.member) {
    member = await ports.syncMember({
      discordId: user.id,
      displayName: interaction.member.nick ?? user.global_name ?? user.username,
      inServer: true,
      roleIds: interaction.member.roles ?? [],
    });
  }
  if (!member) {
    return {
      refusal: ephemeral(
        "I don't know you yet. Discord roles sync every 15 minutes; if you just joined, try again shortly.",
      ),
    };
  }
  const required = accessOf(event) === 'open' ? 'friend' : 'recruit';
  if (!tierAllows(member.tier, required)) return { refusal: ephemeral(NEEDS_RECRUIT) };
  return { member };
}

/** Weekly late minutes covering this guild raid for this member, or null. */
async function weeklyLateFor(
  ports: SignupPorts,
  member: Member,
  event: RaidEvent,
): Promise<LateMinutes | null> {
  if (accessOf(event) !== 'guild' || !ports.absences) return null;
  const list = await ports.absences(member.id);
  const { coverage } = resolveAbsenceCoverage(list, event.startsAt);
  return coverage && coverage !== 'away' ? coverage.lateMinutes : null;
}

/** One click's context: who, which raid, and how to answer through signup-set. */
interface Flow {
  ports: SignupPorts;
  caller: Caller;
  member: Member;
  event: RaidEvent;
  run(
    input: Omit<SignupInput, 'eventId'>,
    reason: string | null,
    respond?: (message: MessageData) => InteractionResponse,
    options?: { fromWeeklyLate?: boolean },
  ): Promise<InteractionResponse>;
}

/**
 * A signup button: answer with the guess, or ask which character when there's none (straight to
 * the New character form when they have no characters yet).
 */
async function onButton(flow: Flow, status: SignupStatus): Promise<InteractionResponse> {
  const { ports, caller, member, event } = flow;
  const guessed = await guess(ports, caller, event.id);
  if (!guessed) {
    const characters = await ports.characters(member.id);
    if (characters.length === 0) return newCharacterFormFor(event.id, status, event.name, true);
    const needed = rolesShort(event, await ports.signups(event.id), member);
    return characterPicker(event.id, status, characters, needed);
  }
  if (status === 'late') {
    const usual = await weeklyLateFor(ports, member, event);
    return latePicker(event.id, guessed.characterId, event.name, usual);
  }
  if (ASKS_REASON.has(status)) {
    return reasonForm(event.id, status, guessed.characterId, event.name);
  }
  if (status === 'accepted') {
    const usual = await weeklyLateFor(ports, member, event);
    if (usual !== null) {
      return flow.run(
        {
          status: 'late',
          lateMinutes: usual,
          characterId: guessed.characterId,
          spec: guessed.spec,
        },
        guessed.reason,
        replyPrivately,
        { fromWeeklyLate: true },
      );
    }
  }
  return flow.run({ status, characterId: guessed.characterId, spec: guessed.spec }, guessed.reason);
}

/**
 * Switch character, Change spec, Role, or Can also play on the reply: the same answer, changed
 * for this raid. New character… in Switch character opens the form, keeping the answer as is.
 */
async function onMenu(
  flow: Flow,
  parsed: Extract<Parsed, { kind: 'switch' | 'spec' | 'role' | 'also' }>,
): Promise<InteractionResponse> {
  const existing = await flow.ports.signup(flow.event.id, flow.member.id);
  if (!existing) {
    return replaceReply({ content: 'Answer the raid first, then switch.', components: [] });
  }
  if (parsed.kind === 'switch' && parsed.characterId === NEW_CHARACTER) {
    return newCharacterFormFor(flow.event.id, existing.status, flow.event.name, false);
  }
  const same = { status: existing.status, characterId: existing.characterId };
  const input =
    parsed.kind === 'switch'
      ? { status: existing.status, characterId: parsed.characterId }
      : parsed.kind === 'spec'
        ? { ...same, spec: parsed.spec }
        : parsed.kind === 'also'
          ? { ...same, alsoRoles: parsed.alsoRoles }
          : { ...same, role: parsed.role };
  return flow.run(input, null, replaceReply);
}

async function onTimeThisWeek(flow: Flow): Promise<InteractionResponse> {
  const existing = await flow.ports.signup(flow.event.id, flow.member.id);
  if (!existing) {
    return replaceReply({ content: 'Answer the raid first.', components: [] });
  }
  return flow.run(
    { status: 'accepted', lateMinutes: null, characterId: existing.characterId },
    null,
    replaceReply,
  );
}

/**
 * The New character form was sent: save the character, then sign up with it in the same step.
 * An existing signup is updated in place by signup-set, so they keep their place in line.
 */
async function onNewCharacter(
  flow: Flow,
  interaction: Interaction,
  status: SignupStatus,
): Promise<InteractionResponse> {
  const { input, note } = readNewCharacter(interaction);
  const added = await flow.ports.characterAdd(flow.caller, input);
  if (!added.success) {
    const why = failureText(added, NEEDS_FRIEND_FOR_CHARACTERS, 'That character isn’t valid.');
    return ephemeral(`${why}\nPick **New character…** again to fix it.`);
  }
  const character = added.data!;
  if (status === 'late') {
    const existing = await flow.ports.signup(flow.event.id, flow.member.id);
    if (existing?.status !== 'late' || existing.lateMinutes === null) {
      return latePicker(flow.event.id, character.id, flow.event.name);
    }
  }
  // Only a form that asked for a note sets one; the Switch character form keeps the old note.
  return flow.run(
    { status, characterId: character.id, ...(note === undefined ? {} : { note }) },
    character.isMain ? 'your new character, now your main' : 'your new character',
  );
}

async function onLate(
  flow: Flow,
  characterId: string,
  lateMinutes: LateMinutes,
): Promise<InteractionResponse> {
  const guessed = await guess(flow.ports, flow.caller, flow.event.id);
  const fromGuess = guessed?.characterId === characterId ? guessed : null;
  return flow.run(
    {
      status: 'late',
      characterId,
      lateMinutes,
      ...(fromGuess ? { spec: fromGuess.spec } : {}),
    },
    fromGuess?.reason ?? null,
    replaceReply,
  );
}

async function onNote(
  flow: Flow,
  status: SignupStatus,
  characterId: string,
  note: string | null,
): Promise<InteractionResponse> {
  // The form came from the guess when it carries the guessed character: play the guessed
  // spec and say why again. (The id has no room for the spec within Discord's 100.)
  const guessed = await guess(flow.ports, flow.caller, flow.event.id);
  const fromGuess = guessed?.characterId === characterId ? guessed : null;
  return flow.run(
    { status, characterId, note, ...(fromGuess ? { spec: fromGuess.spec } : {}) },
    fromGuess?.reason ?? null,
  );
}

/** A signup button, picker, reason form, or reply menu, once the member and raid are known. */
async function handleSignup(
  interaction: Interaction,
  parsed: Parsed,
  member: Member,
  event: RaidEvent,
  ports: SignupPorts,
): Promise<InteractionResponse> {
  const caller: Caller = {
    surface: 'discord',
    guildId: ports.guildId,
    tier: member.tier,
    memberId: member.id,
    discordId: member.discordId,
  };
  const flow: Flow = {
    ports,
    caller,
    member,
    event,
    run: (input, reason, respond = replyPrivately, options) =>
      answer(ports, caller, member, event, input, reason, respond, options),
  };

  switch (parsed.kind) {
    case 'late':
      return onLate(flow, parsed.characterId, parsed.lateMinutes);
    case 'ontime':
      return onTimeThisWeek(flow);
    case 'note':
      return onNote(flow, parsed.status, parsed.characterId, parsed.note);
    case 'pick':
      if (parsed.characterId === NEW_CHARACTER) {
        return newCharacterFormFor(event.id, parsed.status, event.name, true);
      }
      if (parsed.status === 'late') {
        const usual = await weeklyLateFor(ports, member, event);
        return replaceReply(latePickerMessage(event.id, parsed.characterId, event.name, usual));
      }
      if (ASKS_REASON.has(parsed.status)) {
        return reasonForm(event.id, parsed.status, parsed.characterId, event.name);
      }
      return flow.run(
        { status: parsed.status, characterId: parsed.characterId },
        null,
        replaceReply,
      );
    case 'switch':
    case 'spec':
    case 'role':
    case 'also':
      return onMenu(flow, parsed);
    case 'new':
      return onNewCharacter(flow, interaction, parsed.status);
    case 'button':
      return onButton(flow, parsed.status);
  }
}

async function rosterReplyFor(ports: SignupPorts, event: RaidEvent): Promise<InteractionResponse> {
  const signups = await ports.signups(event.id);
  if (!ports.rosterContext) return reply(renderRosterReply(event, signups), { ephemeral: true });
  const { members, absences } = await ports.rosterContext();
  const tickMembers = members.map((m) => ({
    memberId: m.id,
    discordId: m.discordId,
    displayName: m.displayName,
    rank: m.rank,
    dmOptOut: m.prefs.dmOptOut,
  }));
  const answered = new Set(signups.map((s) => s.memberId));
  const away: { displayName: string }[] = [];
  if (accessOf(event) === 'guild') {
    for (const m of members) {
      if (answered.has(m.id)) continue;
      const mine = absences.filter((a) => a.memberId === m.id);
      if (resolveAbsenceCoverage(mine, event.startsAt).coverage === 'away') {
        away.push({ displayName: m.displayName });
      }
    }
  }
  return reply(renderRosterReply(event, signups, tickMembers, away), { ephemeral: true });
}

export async function handleSignupInteraction(
  interaction: Interaction,
  ports: SignupPorts,
): Promise<InteractionResponse | null> {
  const roster = parseRosterInteraction(interaction);
  const parsed = roster ? null : parseSignupInteraction(interaction);
  const eventId = roster ?? parsed?.eventId;
  if (!eventId) return null;
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return ephemeral('Random only takes signups in the Vintage guild server.');
  }
  const event = await ports.event(eventId);
  if (!event) return ephemeral('That raid no longer exists.');
  const who = await whoIsClicking(interaction, ports, event);
  if ('refusal' in who) return who.refusal;
  if (roster) return rosterReplyFor(ports, event);
  return handleSignup(interaction, parsed!, who.member, event, ports);
}
