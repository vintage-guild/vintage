// Characters from Discord (#149, character-choice §3). Pure over ports, so Convex
// (convex/discord.ts) and the JTBD host run the same flow:
//   /random character add name class spec [role] [main] → character-add as the member
//   /random character list                             → character-list, main marked
//   /random character main name                        → character-update { isMain }
//   /random character remove name                      → character-remove's preview, with a
//                                                        Confirm button
//   button  char-rm:<characterId>                      → character-remove for real (a fresh
//                                                        preview, confirmed at once)
//   autocomplete  spec (by the class chosen so far), name (the member's own characters)
// It also builds the New character form the signup picker opens (discord-signups.ts). Every reply
// is private. Commands decide everything (tiers, ownership, valid specs); this file translates,
// and what a member types past the suggestions is still checked by the command.
import {
  type AutocompleteChoice,
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
  TextInputStyle,
  updateMessage,
} from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import {
  CLASS_NAMES,
  CLASSES,
  normalizeCharacterName,
  ROLES,
  type Role,
  type WowClass,
} from '@vintage/wow-data';
import {
  commandOptions,
  discordCaller,
  ephemeral,
  failureText,
  type MemberPorts,
  playing,
  ROLE_WORDS,
  SLASH_COMMAND,
  specName,
  titleCase,
} from './discord-common';

export const CHARACTER_GROUP = 'character';
const REMOVE_PREFIX = 'char-rm';
/** The menu value that opens the New character form, in the signup picker and Switch character. */
export const NEW_CHARACTER = 'new';
/** The role select's "follow the spec" choice. */
export const GUESS_ROLE = 'guess';

const NEEDS_MEMBER =
  'Characters need the Member rank or higher in this server. Ask an officer if that seems wrong.';

export interface CharacterPorts extends MemberPorts {
  /** Runs a command through the registry as this caller, with a confirm token when given. */
  run(
    caller: Caller,
    name: string,
    input: unknown,
    confirmToken?: string,
  ): Promise<CommandResult<unknown>>;
}

export interface AutocompletePorts extends MemberPorts {
  /** The member's characters: one indexed read, so suggestions stay well inside 3 seconds. */
  characters(memberId: string): Promise<Character[]>;
}

const failure = (result: CommandResult<unknown>) => failureText(result, NEEDS_MEMBER);

/** "**Aeryn** · Holy Priest, healer · main" */
const line = (c: Character) =>
  `**${c.name}** · ${playing(c)}${c.rolePicked ? ' (picked)' : ''}${c.isMain ? ' · main' : ''}`;

const isRole = (s: string | undefined): s is Role =>
  !!s && (ROLES as readonly string[]).includes(s);
const isClass = (s: string | undefined): s is WowClass =>
  !!s && (CLASS_NAMES as readonly string[]).includes(s);

/** Is this one of ours? `/random character …`, its autocomplete, or the remove confirm. */
export function isCharacterInteraction(interaction: Interaction): boolean {
  if (
    interaction.type === InteractionType.APPLICATION_COMMAND ||
    interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE
  ) {
    return (
      interaction.data?.name === SLASH_COMMAND && subcommandPath(interaction)[0] === CHARACTER_GROUP
    );
  }
  return (
    interaction.type === InteractionType.MESSAGE_COMPONENT && removeTarget(interaction) !== null
  );
}

/** The character id on a `char-rm:<id>` button, or null. Ids are plain tokens (no `:`). */
function removeTarget(interaction: Interaction): string | null {
  const parts = (interaction.data?.custom_id ?? '').split(':');
  const [prefix, id] = parts;
  return parts.length === 2 && prefix === REMOVE_PREFIX && id && /^[A-Za-z0-9_-]{1,64}$/.test(id)
    ? id
    : null;
}

async function myCharacters(
  ports: CharacterPorts,
  caller: Caller,
): Promise<{ characters: Character[] } | { refusal: InteractionResponse }> {
  const result = await ports.run(caller, 'character-list', {});
  return result.success
    ? { characters: result.data as Character[] }
    : { refusal: ephemeral(failure(result)) };
}

/**
 * One of the member's characters by what they typed: the name (any capitalization, as
 * autocomplete sends it) or its id.
 */
export function findCharacter(characters: Character[], typed: string): Character | undefined {
  const name = normalizeCharacterName(typed);
  return characters.find((c) => c.id === typed || c.name === name);
}

const notYours = (typed: string) =>
  ephemeral(
    `You have no character called **${typed.slice(0, 40)}**. See yours with \`/random character list\`.`,
  );

async function add(ports: CharacterPorts, caller: Caller, interaction: Interaction) {
  const o = commandOptions(interaction);
  const result = await ports.run(caller, 'character-add', {
    name: o.name,
    class: o.class,
    spec: typeof o.spec === 'string' ? o.spec.trim().toLowerCase() : o.spec,
    ...(isRole(String(o.role)) ? { role: o.role } : {}),
    ...(o.main === true ? { isMain: true } : {}),
  });
  if (!result.success) return ephemeral(failure(result));
  const c = result.data as Character;
  return ephemeral(
    `Added **${c.name}** (${playing(c)})${c.isMain ? ' as your main' : ''}. It shows in the signup picker now.`,
  );
}

async function list(ports: CharacterPorts, caller: Caller) {
  const mine = await myCharacters(ports, caller);
  if ('refusal' in mine) return mine.refusal;
  if (mine.characters.length === 0) {
    return ephemeral('No characters yet. Add one with `/random character add`.');
  }
  return ephemeral(
    [
      'Your characters (your main is who signups use unless you pick another):',
      ...mine.characters.map((c) => `- ${line(c)}`),
    ].join('\n'),
  );
}

async function makeMain(ports: CharacterPorts, caller: Caller, typed: string) {
  const mine = await myCharacters(ports, caller);
  if ('refusal' in mine) return mine.refusal;
  const c = findCharacter(mine.characters, typed);
  if (!c) return notYours(typed);
  if (c.isMain) return ephemeral(`**${c.name}** is already your main.`);
  const result = await ports.run(caller, 'character-update', { characterId: c.id, isMain: true });
  if (!result.success) return ephemeral(failure(result));
  return ephemeral(`**${c.name}** is your main now. Signups use it unless you pick another.`);
}

/** Step one of removing: the registry's preview, shown with a Confirm button. */
async function removePreview(ports: CharacterPorts, caller: Caller, typed: string) {
  const mine = await myCharacters(ports, caller);
  if ('refusal' in mine) return mine.refusal;
  const c = findCharacter(mine.characters, typed);
  if (!c) return notYours(typed);
  const preview = await ports.run(caller, 'character-remove', { characterId: c.id });
  if (!preview.success) return ephemeral(failure(preview));
  return reply(
    {
      content: `Remove **${c.name}** (${playing(c)})? Its past signups stay; this can't be undone.`,
      components: [
        actionRow(button(`${REMOVE_PREFIX}:${c.id}`, `Remove ${c.name}`, ButtonStyle.DANGER)),
      ],
    },
    { ephemeral: true },
  );
}

/** Step two: the member clicked Confirm, so take a fresh preview and confirm it right away. */
async function removeConfirm(ports: CharacterPorts, caller: Caller, characterId: string) {
  const input = { characterId };
  const preview = await ports.run(caller, 'character-remove', input);
  if (!preview.success) return updateMessage({ content: failure(preview), components: [] });
  const token = (preview.data as { confirmToken?: string }).confirmToken;
  const result = await ports.run(caller, 'character-remove', input, token);
  if (!result.success) return updateMessage({ content: failure(result), components: [] });
  const { removed } = result.data as { removed: Character };
  return updateMessage({ content: `Removed **${removed.name}**.`, components: [] });
}

export async function handleCharacterInteraction(
  interaction: Interaction,
  ports: CharacterPorts,
): Promise<InteractionResponse | null> {
  if (
    !isCharacterInteraction(interaction) ||
    interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE
  ) {
    return null;
  }
  const who = await discordCaller(interaction, ports, 'characters');
  if ('refusal' in who) return who.refusal;
  const { caller } = who;

  const target = removeTarget(interaction);
  if (target) return removeConfirm(ports, caller, target);

  const [, sub] = subcommandPath(interaction);
  const typed = String(commandOptions(interaction).name ?? '').trim();
  switch (sub) {
    case 'add':
      return add(ports, caller, interaction);
    case 'list':
      return list(ports, caller);
    case 'main':
      return makeMain(ports, caller, typed);
    case 'remove':
      return removePreview(ports, caller, typed);
    default:
      return null;
  }
}

/** The specs to suggest: the chosen class's, or every class's when none is chosen yet. */
function specChoices(wowClass: string | undefined, typed: string): AutocompleteChoice[] {
  const q = typed.trim().toLowerCase();
  const classes = isClass(wowClass) ? [wowClass] : CLASS_NAMES;
  const seen = new Set<string>();
  const choices: AutocompleteChoice[] = [];
  for (const c of classes) {
    const specs: Record<string, Role> = CLASSES[c];
    for (const [spec, role] of Object.entries(specs)) {
      if (seen.has(spec) || (q && !spec.includes(q) && !specName(spec).toLowerCase().includes(q))) {
        continue;
      }
      seen.add(spec);
      const of = isClass(wowClass) ? '' : ` ${titleCase(c)}`;
      choices.push({ name: `${specName(spec)}${of} (${ROLE_WORDS[role]})`, value: spec });
    }
  }
  return choices;
}

/**
 * Suggestions for `/random character` as the member types: specs filtered by the class chosen so
 * far, and the member's own characters for `name`. Anything unexpected (another server, someone
 * Random doesn't know, another option) gets no suggestions; the command checks the value anyway.
 */
export async function handleCharacterAutocomplete(
  interaction: Interaction,
  ports: AutocompletePorts,
): Promise<InteractionResponse | null> {
  if (
    interaction.type !== InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE ||
    !isCharacterInteraction(interaction)
  ) {
    return null;
  }
  const none = autocompleteResult([]);
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) return none;
  const focused = focusedOption(interaction);
  if (!focused) return none;
  if (focused.name === 'spec') {
    const chosen = commandOptions(interaction).class;
    return autocompleteResult(
      specChoices(typeof chosen === 'string' ? chosen : undefined, focused.value),
    );
  }
  if (focused.name !== 'name') return none;
  const user = interactionUser(interaction);
  const member: Member | null = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member) return none;
  const q = focused.value.trim().toLowerCase();
  const mine = (await ports.characters(member.id)).filter(
    (c) => !q || c.name.toLowerCase().includes(q),
  );
  return autocompleteResult(
    mine.map((c) => ({
      name: `${c.name} · ${playing(c)}${c.isMain ? ' · main' : ''}`,
      value: c.name,
    })),
  );
}

// The New character form (opened from the signup picker and Switch character). Discord modals
// hold select menus inside labels, so it asks for the name, then class, spec and role from lists.
// A modal can't change one list when another is picked, so the spec list has every spec once
// (25: Discord's most), each saying which classes have it, and character-add refuses a spec of
// the wrong class.

/** One option per spec name across the classes, with the classes that have it. */
function allSpecOptions(): SelectOption[] {
  const byName = new Map<string, WowClass[]>();
  for (const c of CLASS_NAMES) {
    for (const spec of Object.keys(CLASSES[c])) byName.set(spec, [...(byName.get(spec) ?? []), c]);
  }
  return [...byName].map(([spec, classes]) => ({
    label: spec.endsWith('-tank') ? `${specName(spec)} (tank)` : specName(spec),
    value: spec,
    description: classes.map(titleCase).join(', ').slice(0, 100),
  }));
}

const SPEC_OPTIONS = allSpecOptions();
/** The spec list fits one select menu; if the class data ever outgrows it, ask for class only. */
const SPEC_SELECT_FITS = SPEC_OPTIONS.length <= 25;

const CLASS_OPTIONS: SelectOption[] = CLASS_NAMES.map((c) => ({ label: titleCase(c), value: c }));

const ROLE_OPTIONS: SelectOption[] = [
  { label: 'Guess from the spec', value: GUESS_ROLE, default: true },
  ...ROLES.map((r) => ({ label: titleCase(ROLE_WORDS[r]), value: r })),
];

/** What the note field says for a late or tentative answer. */
export interface NoteField {
  label: string;
  placeholder: string;
}

/** The New character form. `note` adds the late/tentative reason field (one form, one step). */
export function newCharacterForm(customId: string, title: string, note?: NoteField) {
  return modal(
    customId,
    title.slice(0, 45),
    label(
      'Character name',
      labelledTextInput('name', { required: true, max_length: 25, placeholder: 'Aeryn' }),
    ),
    label('Class', stringSelect('class', CLASS_OPTIONS, { placeholder: 'Pick a class' })),
    ...(SPEC_SELECT_FITS
      ? [
          label(
            'Spec',
            stringSelect('spec', SPEC_OPTIONS, { placeholder: 'Pick a spec of that class' }),
            'Pick one of your class’s specs',
          ),
        ]
      : []),
    label(
      'Role',
      stringSelect('role', ROLE_OPTIONS, { required: false }),
      'For a Fury warrior who tanks, say',
    ),
    ...(note
      ? [
          label(
            note.label,
            labelledTextInput('note', {
              style: TextInputStyle.SHORT,
              required: false,
              max_length: 200,
              placeholder: note.placeholder,
            }),
          ),
        ]
      : []),
  );
}

/**
 * What the New character form carried, as character-add's input, and the note: undefined when
 * the form had no note field, null when it was left empty.
 */
export function readNewCharacter(interaction: Interaction): {
  input: { name: string; class: string; spec: string; role?: Role };
  note: string | null | undefined;
} {
  const text = modalValues(interaction);
  const picked = modalSelections(interaction);
  const wowClass = picked.class?.[0] ?? '';
  // Without a spec list the class's first spec stands in, and Change spec fixes it after.
  const firstSpec = isClass(wowClass) ? Object.keys(CLASSES[wowClass])[0]! : '';
  const role = picked.role?.[0];
  const note = text.note?.trim();
  return {
    input: {
      name: (text.name ?? '').trim(),
      class: wowClass,
      spec: picked.spec?.[0] ?? firstSpec,
      ...(isRole(role) ? { role } : {}),
    },
    note: note === undefined ? undefined : note || null,
  };
}
