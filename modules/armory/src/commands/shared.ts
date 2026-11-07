import { type Caller, error, tierAllows } from '@vintage/guild-kit';
import type { ArmoryEntry, ArmoryLink } from '../contract';
import type { ArmoryCharacter, ArmoryDeps } from '../store';

/** Your own characters, or anyone's for officers. */
export const canEdit = (caller: Caller, character: ArmoryCharacter) =>
  character.memberId === caller.memberId || tierAllows(caller.tier, 'officer');

export const characterNotFound = () =>
  error('CHARACTER_NOT_FOUND', 'No such character of yours', {
    suggestion: 'Use character-list for your character ids; officers can link anyone’s',
    retryable: false,
  });

export const notLinked = (name: string) =>
  error('ARMORY_NOT_LINKED', `${name} isn’t linked to the armory`, {
    suggestion: 'Link it with armory-link, giving the character’s surname',
    retryable: false,
  });

/** The character the caller may change, or null (answered as not found). */
export async function editableCharacter(
  deps: ArmoryDeps,
  guildId: string,
  caller: Caller,
  characterId: string,
): Promise<ArmoryCharacter | null> {
  const character = await deps.armoryCharacters.getCharacter(guildId, characterId);
  return character && canEdit(caller, character) ? character : null;
}

export const toEntry = (link: ArmoryLink, character: ArmoryCharacter): ArmoryEntry => ({
  ...link,
  memberId: character.memberId,
});
