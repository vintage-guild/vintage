import { error, success, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import type { ArmoryEntry } from '../contract';
import { command } from '../store';
import { characterNotFound, toEntry } from './shared';

export const armoryGet = command({
  name: 'armory-get',
  description:
    'What the WoW: Forever armory says about a registered character: level, class, guild, item ' +
    'level, equipped gear, portrait, and when it was last checked; `link` is null when the ' +
    'character isn’t linked (armory-link links it). `status` is pending until the first fetch, ' +
    'then found, not-found (wrong surname, under level 10, or not logged out since), or error. ' +
    '`classMismatch` means the armory character’s class differs from the registered one.',
  tier: 'member',
  input: z.object({ characterId: z.string().min(1) }),
  handler: async ({ characterId }, { caller, guildId, deps }) => {
    const character = await deps.armoryCharacters.getCharacter(guildId, characterId);
    // Another member's character needs recruit, as character-list; answered like a missing one.
    const theirs = character && character.memberId !== caller.memberId;
    if (!character || (theirs && !tierAllows(caller.tier, 'recruit'))) {
      return characterNotFound();
    }
    const link = await deps.armory.getLinkByCharacter(guildId, characterId);
    return success({ link: link && toEntry(link, character) });
  },
});

export const armoryList = command({
  name: 'armory-list',
  description:
    'Armory links with what the armory last said, sorted by name: yours by default, one ' +
    'member’s with memberId, or the whole guild with allGuild (recruits and up for anyone ' +
    'else’s). Links whose character was removed are left out.',
  tier: 'member',
  input: z.object({
    memberId: z.string().optional(),
    allGuild: z.boolean().default(false),
  }),
  handler: async ({ memberId, allGuild }, { caller, guildId, deps }) => {
    const someoneElse = allGuild || (memberId !== undefined && memberId !== caller.memberId);
    if (someoneElse && !tierAllows(caller.tier, 'recruit')) {
      return error('FORBIDDEN', 'Only recruits and up can see other members’ armory links', {
        suggestion: 'Leave out memberId and allGuild to see your own',
        retryable: false,
      });
    }
    const wanted = allGuild ? null : (memberId ?? caller.memberId ?? null);
    if (!allGuild && wanted === null) return success([] as ArmoryEntry[]);
    const characters = new Map(
      (await deps.armoryCharacters.listCharacters(guildId)).map((c) => [c.id, c]),
    );
    const entries: ArmoryEntry[] = [];
    for (const link of await deps.armory.listLinks(guildId)) {
      const character = characters.get(link.characterId);
      if (!character || (wanted !== null && character.memberId !== wanted)) continue;
      entries.push(toEntry(link, character));
    }
    return success(entries);
  },
});
