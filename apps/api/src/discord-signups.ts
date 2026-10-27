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
import type { Character, Member } from '@vintage/identity/contract';
import {
  type CompRole,
  compRole,
  type RaidEvent,
  rolesNeeded,
  type Signup,
  type SignupGuess,
  type SignupStatus,
} from '@vintage/raids/contract';
import { CLASSES, ROLES, type Role, roleFor } from '@vintage/wow-data';
import {
  GUESS_ROLE,
  NEW_CHARACTER,
  type NoteField,
  newCharacterForm,
  readNewCharacter,
} from './discord-characters';
import { failureText, playing, ROLE_WORDS, specName, titleCase } from './discord-common';

const STATUSES: readonly SignupStatus[] = ['accepted', 'late', 'tentative', 'bench', 'declined'];
/** Answers that open the reason form. */
const ASKS_REASON: ReadonlySet<SignupStatus> = new Set(['late', 'tentative']);

export interface SignupInput {
  eventId: string;
  characterId: string;
  status: SignupStatus;
  note?: string | null;
  spec?: string;
  /** A role for this raid; null follows the spec again. */
  role?: Role | null;
}

/** What character-add takes, from the New character form. */
export interface NewCharacterInput {
  name: string;
  class: string;
  spec: string;
  role?: Role;
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
  /** A signup changed: refresh the post soon (starts a coordinator tick). */
  afterChange(): Promise<void>;
}

type Parsed =
  | { kind: 'button'; eventId: string; status: SignupStatus }
  | { kind: 'pick'; eventId: string; status: SignupStatus; characterId: string }
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
  | { kind: 'new'; eventId: string; status: SignupStatus };

const MENUS = new Set(['signup-char', 'signup-spec', 'signup-role']);

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
  const picked = interaction.data?.values?.[0];
  if (parts.length !== 2 || !isToken(eventId) || !isToken(picked)) return null;
  if (interaction.type !== InteractionType.MESSAGE_COMPONENT) return null;
  if (prefix === 'signup-char') return { kind: 'switch', eventId, characterId: picked };
  if (prefix === 'signup-spec') return { kind: 'spec', eventId, spec: picked };
  if (prefix === 'signup-role') {
    if (picked === GUESS_ROLE) return { kind: 'role', eventId, role: null };
    return isRole(picked) ? { kind: 'role', eventId, role: picked } : null;
  }
  return null;
}

const isRole = (s: string): s is Role => (ROLES as readonly string[]).includes(s);

/** The signup interaction this is, or null when it isn't one of ours. */
export function parseSignupInteraction(interaction: Interaction): Parsed | null {
  const parts = (interaction.data?.custom_id ?? '').split(':');
  const [prefix, eventId, status, characterId] = parts;
  if (prefix && MENUS.has(prefix)) return parseMenu(interaction, parts);
  const component = interaction.type === InteractionType.MESSAGE_COMPONENT;
  const picked = interaction.data?.values?.[0];
  if (!isToken(eventId) || !isStatus(status)) return null;
  if (
    prefix === 'signup-new' &&
    parts.length === 3 &&
    interaction.type === InteractionType.MODAL_SUBMIT
  ) {
    return { kind: 'new', eventId, status };
  }
  if (prefix === 'signup' && parts.length === 3 && component)
    return { kind: 'button', eventId, status };
  if (prefix === 'signup-pick' && parts.length === 3 && component && isToken(picked)) {
    return { kind: 'pick', eventId, status, characterId: picked };
  }
  if (
    prefix === 'signup-note' &&
    interaction.type === InteractionType.MODAL_SUBMIT &&
    isToken(characterId) &&
    parts.length === 4
  ) {
    const note = modalValues(interaction).note?.trim();
    return { kind: 'note', eventId, status, characterId, note: note ? note : null };
  }
  return null;
}

const ephemeral = (content: string) => reply(content, { ephemeral: true });

const NEEDS_MEMBER_FOR_CHARACTERS =
  'Adding a character needs the Member rank or higher in this server. Ask an officer if that seems wrong.';

const NEEDS_RECRUIT =
  'Signing up needs the Recruit rank or higher in this server. Ask an officer if that seems wrong.';

const LABEL: Record<SignupStatus, string> = {
  accepted: 'Accepted',
  late: 'Late',
  tentative: 'Tentative',
  bench: 'Bench',
  declined: 'Declined',
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
    options.push({
      label: titleCase(ROLE_WORDS[role]),
      value: role,
      ...(neededHint(role, needed) ? { description: neededHint(role, needed).slice(3) } : {}),
      ...(signup.rolePicked && signup.role === role ? { default: true } : {}),
    });
  }
  return options;
}

const noteField = (status: SignupStatus): NoteField =>
  status === 'late'
    ? { label: 'How late, and why? (optional)', placeholder: 'About 20 min, after work' }
    : { label: 'What might stop you? (optional)', placeholder: 'Might have to work' };

function reasonForm(eventId: string, status: SignupStatus, characterId: string, raid: string) {
  const late = status === 'late';
  const field = noteField(status);
  return modal(
    `signup-note:${eventId}:${status}:${characterId}`,
    (late ? `Late for ${raid}` : `Tentative for ${raid}`).slice(0, 45),
    textInput('note', field.label, {
      style: TextInputStyle.SHORT,
      required: false,
      max_length: 200,
      placeholder: field.placeholder,
    }),
  );
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
 * The private reply after signup-set: what was used and why, with Switch character (which also
 * offers New character…), Change spec and Role menus. A decline gets none.
 */
async function outcome(
  ports: SignupPorts,
  member: Member,
  event: RaidEvent,
  result: CommandResult<Signup>,
  reason: string | null,
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
  const why = reason ? `: ${reason}` : '';
  const head = `**${LABEL[s.status]}** for ${event.name} as **${s.characterName}** (${playing(s)})${why}.`;
  const tail = s.queued
    ? "The raid is full, so you're in the queue; you'll be told if a spot opens."
    : 'The signup post updates in a few seconds.';
  const content = `${head}\n${tail}`;
  if (s.status === 'declined') return { content, components: [] };

  const [characters, signups] = await Promise.all([
    ports.characters(member.id),
    ports.signups(event.id),
  ]);
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
) {
  const result = await ports.signupSet(caller, { eventId: event.id, ...input });
  if (result.success) await ports.afterChange();
  return respond(await outcome(ports, member, event, result, reason));
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
): Promise<{ member: Member } | { refusal: InteractionResponse }> {
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return { refusal: ephemeral('Random only takes signups in the Vintage guild server.') };
  }
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member) {
    return {
      refusal: ephemeral(
        "I don't know you yet. Discord roles sync every 15 minutes; if you just joined, try again shortly.",
      ),
    };
  }
  if (!tierAllows(member.tier, 'recruit')) return { refusal: ephemeral(NEEDS_RECRUIT) };
  return { member };
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
  if (ASKS_REASON.has(status)) {
    return reasonForm(event.id, status, guessed.characterId, event.name);
  }
  return flow.run({ status, characterId: guessed.characterId, spec: guessed.spec }, guessed.reason);
}

/**
 * Switch character, Change spec or Role on the reply: the same answer, changed for this raid.
 * New character… in Switch character opens the form, keeping the answer (and the note) as is.
 */
async function onMenu(
  flow: Flow,
  parsed: Extract<Parsed, { kind: 'switch' | 'spec' | 'role' }>,
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
        : { ...same, role: parsed.role };
  return flow.run(input, null, replaceReply);
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
    const why = failureText(added, NEEDS_MEMBER_FOR_CHARACTERS, 'That character isn’t valid.');
    return ephemeral(`${why}\nPick **New character…** again to fix it.`);
  }
  const character = added.data!;
  // Only a form that asked for a note sets one; the Switch character form keeps the old note.
  return flow.run(
    { status, characterId: character.id, ...(note === undefined ? {} : { note }) },
    character.isMain ? 'your new character, now your main' : 'your new character',
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
    run: (input, reason, respond = replyPrivately) =>
      answer(ports, caller, member, event, input, reason, respond),
  };

  switch (parsed.kind) {
    case 'note': {
      const { status, characterId, note } = parsed;
      // The form came from the guess when it carries the guessed character: play the guessed
      // spec and say why again. (The id has no room for the spec within Discord's 100.)
      const guessed = await guess(ports, caller, event.id);
      const fromGuess = guessed?.characterId === characterId ? guessed : null;
      return flow.run(
        { status, characterId, note, ...(fromGuess ? { spec: fromGuess.spec } : {}) },
        fromGuess?.reason ?? null,
      );
    }
    case 'pick':
      if (parsed.characterId === NEW_CHARACTER) {
        return newCharacterFormFor(event.id, parsed.status, event.name, true);
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
      return onMenu(flow, parsed);
    case 'new':
      return onNewCharacter(flow, interaction, parsed.status);
    case 'button':
      return onButton(flow, parsed.status);
  }
}

export async function handleSignupInteraction(
  interaction: Interaction,
  ports: SignupPorts,
): Promise<InteractionResponse | null> {
  const roster = parseRosterInteraction(interaction);
  const parsed = roster ? null : parseSignupInteraction(interaction);
  const eventId = roster ?? parsed?.eventId;
  if (!eventId) return null;
  const who = await whoIsClicking(interaction, ports);
  if ('refusal' in who) return who.refusal;
  const event = await ports.event(eventId);
  if (!event) return ephemeral('That raid no longer exists.');
  if (roster) {
    return reply(renderRosterReply(event, await ports.signups(event.id)), { ephemeral: true });
  }
  return handleSignup(interaction, parsed!, who.member, event, ports);
}
