import { type Caller, error, success, tierAllows } from '@vintage/guild-kit';
import {
  characterNameSchema,
  classSchema,
  normalizeCharacterName,
  type Role,
  roleFor,
  roleSchema,
  type WowClass,
} from '@vintage/wow-data';
import { z } from 'zod';
import type { Character } from '../contract';
import { command, type IdentityDeps } from '../store';
import { notSignedIn } from './member';

const notFound = () =>
  error('CHARACTER_NOT_FOUND', 'No such character, or it is not yours', {
    suggestion: 'Use character-list to see your characters',
    retryable: false,
  });

const badSpec = (wowClass: string, spec: string) =>
  error('INVALID_SPEC', `"${spec}" is not a ${wowClass} spec`, {
    suggestion: 'Pick one of the specs for that class',
    retryable: false,
  });

const nameTaken = (name: string) =>
  error('CHARACTER_EXISTS', `${name} is already registered`, {
    suggestion: 'Ask an officer if someone else registered your character',
    retryable: false,
  });

/**
 * The role to save: a picked role wins and is remembered as picked; otherwise a role picked
 * earlier is kept (unless `role` is null: back to guessing), and a guessed one follows the spec.
 */
function roleOf(
  wowClass: WowClass,
  spec: string,
  role: Role | null | undefined,
  before?: Pick<Character, 'role' | 'rolePicked'>,
): { role: Role; rolePicked: boolean } | null {
  const guessed = roleFor(wowClass, spec);
  if (!guessed) return null;
  if (role) return { role, rolePicked: true };
  if (role === undefined && before?.rolePicked) return { role: before.role, rolePicked: true };
  return { role: guessed, rolePicked: false };
}

interface PlayEdit {
  class?: WowClass;
  spec?: string;
  role?: Role | null;
}

/**
 * Class, spec and role after an edit: {} when none of them changes, null when the spec isn't one
 * of the class's.
 */
function playPatch(character: Character, input: PlayEdit): Partial<Character> | null {
  if (input.class === undefined && input.spec === undefined && input.role === undefined) return {};
  const wowClass = input.class ?? character.class;
  const spec = input.spec ?? character.spec;
  // A new class starts the role over: a picked role belonged to the old class.
  const before = wowClass === character.class ? character : undefined;
  const role = roleOf(wowClass, spec, input.role, before);
  return role ? { class: wowClass, spec, ...role } : null;
}

/** Make `character` the member's only main. */
async function makeOnlyMain(deps: IdentityDeps, guildId: string, character: Character) {
  const siblings = await deps.identity.listCharacters(guildId, { memberId: character.memberId });
  for (const c of siblings.filter((c) => c.isMain && c.id !== character.id)) {
    await deps.identity.updateCharacter(guildId, c.id, { isMain: false });
  }
}

/** Officers may edit anyone's characters; everyone else only their own. */
function canEdit(caller: Caller, character: Character): boolean {
  return character.memberId === caller.memberId || tierAllows(caller.tier, 'officer');
}

export const characterAdd = command({
  name: 'character-add',
  description:
    'Register one of your characters (main or alt). role is optional: leave it out to guess ' +
    'it from the spec, or pick one (a Fury warrior who tanks).',
  tier: 'member',
  mutation: true,
  input: z.object({
    name: characterNameSchema,
    class: classSchema,
    spec: z.string().min(1),
    role: roleSchema.optional(),
    isMain: z.boolean().default(false),
  }),
  handler: async (input, { caller, guildId, deps }) => {
    if (!caller.memberId) return notSignedIn();
    const role = roleOf(input.class, input.spec, input.role);
    if (!role) return badSpec(input.class, input.spec);

    const name = normalizeCharacterName(input.name);
    const all = await deps.identity.listCharacters(guildId);
    if (all.some((c) => c.name === name)) return nameTaken(name);
    const mine = all.filter((c) => c.memberId === caller.memberId);
    const isMain = input.isMain || mine.length === 0;
    if (isMain) {
      for (const c of mine.filter((c) => c.isMain)) {
        await deps.identity.updateCharacter(guildId, c.id, { isMain: false });
      }
    }
    const character = await deps.identity.insertCharacter({
      guildId,
      memberId: caller.memberId,
      name,
      class: input.class,
      spec: input.spec,
      ...role,
      isMain,
    });
    return success(character, {
      reasoning: isMain ? `${name} is your main` : `${name} added as an alt`,
    });
  },
});

export const characterUpdate = command({
  name: 'character-update',
  description:
    'Edit a character: name, class, spec, role, or make it your main. role null goes back to ' +
    'guessing it from the spec; a guessed role follows a spec change, a picked one stays. A new ' +
    'class needs a spec of that class.',
  tier: 'member',
  mutation: true,
  input: z.object({
    characterId: z.string().min(1),
    name: characterNameSchema.optional(),
    class: classSchema.optional(),
    spec: z.string().min(1).optional(),
    role: roleSchema.nullable().optional(),
    isMain: z.literal(true).optional(),
  }),
  handler: async (input, { caller, guildId, deps }) => {
    const { characterId, isMain } = input;
    const character = await deps.identity.getCharacter(guildId, characterId);
    if (!character || !canEdit(caller, character)) return notFound();

    const play = playPatch(character, input);
    if (!play) return badSpec(input.class ?? character.class, input.spec ?? character.spec);
    const patch: Partial<Character> = { ...play };
    const name = input.name === undefined ? character.name : normalizeCharacterName(input.name);
    if (name !== character.name) {
      const all = await deps.identity.listCharacters(guildId);
      if (all.some((c) => c.name === name)) return nameTaken(name);
      patch.name = name;
    }
    if (isMain) {
      await makeOnlyMain(deps, guildId, character);
      patch.isMain = true;
    }
    return success(await deps.identity.updateCharacter(guildId, characterId, patch));
  },
});

export const characterRemove = command({
  name: 'character-remove',
  description: 'Remove a character. Shows a preview first; confirm to delete.',
  tier: 'member',
  destructive: true,
  input: z.object({ characterId: z.string().min(1) }),
  handler: async ({ characterId }, { caller, guildId, deps, dryRun }) => {
    const character = await deps.identity.getCharacter(guildId, characterId);
    if (!character || !canEdit(caller, character)) return notFound();
    if (dryRun) {
      return success({ willRemove: character }, { reasoning: `Removes ${character.name}` });
    }
    await deps.identity.deleteCharacter(guildId, characterId);
    return success({ removed: character });
  },
});

export const characterList = command({
  name: 'character-list',
  description:
    'Characters for a member (yours by default), or the whole guild for recruits and up.',
  tier: 'member',
  input: z.object({
    memberId: z.string().optional(),
    allGuild: z.boolean().default(false),
  }),
  handler: async ({ memberId, allGuild }, { caller, guildId, deps }) => {
    if (allGuild || (memberId && memberId !== caller.memberId)) {
      if (!tierAllows(caller.tier, 'recruit')) {
        return error('FORBIDDEN', 'Only recruits and up can see other members’ characters', {
          retryable: false,
        });
      }
      return success(await deps.identity.listCharacters(guildId, allGuild ? {} : { memberId }));
    }
    if (!caller.memberId) return notSignedIn();
    return success(await deps.identity.listCharacters(guildId, { memberId: caller.memberId }));
  },
});
