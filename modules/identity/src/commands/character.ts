import { type Caller, error, success, tierAllows } from '@vintage/guild-kit';
import {
  characterNameSchema,
  classSchema,
  normalizeCharacterName,
  roleFor,
} from '@vintage/wow-data';
import { z } from 'zod';
import type { Character } from '../contract';
import { command } from '../store';
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

/** Officers may edit anyone's characters; everyone else only their own. */
function canEdit(caller: Caller, character: Character): boolean {
  return character.memberId === caller.memberId || tierAllows(caller.tier, 'officer');
}

export const characterAdd = command({
  name: 'character-add',
  description: 'Register one of your characters (main or alt).',
  tier: 'member',
  mutation: true,
  input: z.object({
    name: characterNameSchema,
    class: classSchema,
    spec: z.string().min(1),
    isMain: z.boolean().default(false),
  }),
  handler: async (input, { caller, guildId, deps }) => {
    if (!caller.memberId) return notSignedIn();
    const role = roleFor(input.class, input.spec);
    if (!role) return badSpec(input.class, input.spec);

    const name = normalizeCharacterName(input.name);
    const all = await deps.identity.listCharacters(guildId);
    if (all.some((c) => c.name === name)) {
      return error('CHARACTER_EXISTS', `${name} is already registered`, {
        suggestion: 'Ask an officer if someone else registered your character',
        retryable: false,
      });
    }
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
      role,
      isMain,
    });
    return success(character, {
      reasoning: isMain ? `${name} is your main` : `${name} added as an alt`,
    });
  },
});

export const characterUpdate = command({
  name: 'character-update',
  description: 'Change a character’s spec or make it your main.',
  tier: 'member',
  mutation: true,
  input: z.object({
    characterId: z.string().min(1),
    spec: z.string().min(1).optional(),
    isMain: z.literal(true).optional(),
  }),
  handler: async ({ characterId, spec, isMain }, { caller, guildId, deps }) => {
    const character = await deps.identity.getCharacter(guildId, characterId);
    if (!character || !canEdit(caller, character)) return notFound();

    const patch: Partial<Character> = {};
    if (spec) {
      const role = roleFor(character.class, spec);
      if (!role) return badSpec(character.class, spec);
      Object.assign(patch, { spec, role });
    }
    if (isMain) {
      const siblings = await deps.identity.listCharacters(guildId, {
        memberId: character.memberId,
      });
      for (const c of siblings.filter((c) => c.isMain && c.id !== characterId)) {
        await deps.identity.updateCharacter(guildId, c.id, { isMain: false });
      }
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
