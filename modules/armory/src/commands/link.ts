import { characterSlug } from '@vintage/forever-api';
import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { ARMORY_REFRESH_COOLDOWN_MS } from '../contract';
import { command } from '../store';
import { characterNotFound, editableCharacter, notLinked } from './shared';

/**
 * Forever surnames are one word of letters (with the odd apostrophe or hyphen); anything else
 * can't be part of a character slug.
 */
const surnameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{M}'’-]+$/u, 'A surname is one word of letters');

export const armoryLink = command({
  name: 'armory-link',
  description:
    'Link one of your registered characters to its WoW: Forever armory entry by giving its ' +
    'surname (Forever has no realms; the armory finds a character by name and surname). ' +
    'Vintage fetches the armory right away and keeps the level, item level, gear, and portrait ' +
    'fresh after that; armory-get shows them. Linking again with another surname replaces the ' +
    'link. Officers can link anyone’s character. A link is what the member says, not proof of ' +
    'ownership.',
  tier: 'member',
  mutation: true,
  input: z.object({ characterId: z.string().min(1), surname: surnameSchema }),
  handler: async ({ characterId, surname }, { caller, guildId, deps, now }) => {
    const character = await editableCharacter(deps, guildId, caller, characterId);
    if (!character) return characterNotFound();
    const slug = characterSlug(character.name, surname);
    const taken = await deps.armory.getLinkBySlug(guildId, slug);
    if (taken && taken.characterId !== characterId) {
      return error('ARMORY_ALREADY_LINKED', `${slug} is linked to another character`, {
        suggestion:
          'Check the surname. If that armory character is yours, ask an officer to unlink the other one',
        retryable: false,
      });
    }
    const existing = await deps.armory.getLinkByCharacter(guildId, characterId);
    if (existing && existing.slug === slug) {
      return success(existing, {
        reasoning: `${character.name} is already linked as ${slug}; armory-refresh fetches again`,
      });
    }
    const at = now();
    // Switching surnames is not a way around the refresh cooldown: inside it, the new surname is
    // saved and the sweep fetches it once the cooldown is over.
    const wait = existing ? existing.requestedAt + ARMORY_REFRESH_COOLDOWN_MS - at : 0;
    const fresh = {
      name: character.name,
      surname,
      slug,
      status: 'pending' as const,
      profile: null,
      equipment: [],
      avatarUrl: null,
      classMismatch: false,
      error: null,
      linkedBy: caller.memberId ?? caller.surface,
      linkedAt: at,
      requestedAt: wait > 0 ? existing!.requestedAt : at,
      checkedAt: null,
      fetchedAt: null,
    };
    const link = existing
      ? await deps.armory.updateLink(guildId, existing.id, fresh)
      : await deps.armory.insertLink({ guildId, characterId, ...fresh });
    if (wait > 0) {
      const minutes = Math.ceil(wait / 60_000);
      return success(link, {
        reasoning:
          `${character.name} linked as ${slug}; the armory was asked moments ago, so it's ` +
          `fetched within the hour (or armory-refresh in ${minutes} minute${minutes === 1 ? '' : 's'})`,
      });
    }
    await deps.armoryEffects.fetch(guildId, [link.id]);
    return success(link, {
      reasoning: `${character.name} linked as ${slug}; fetching the armory now`,
    });
  },
});

export const armoryUnlink = command({
  name: 'armory-unlink',
  description:
    'Remove a character’s armory link and what Vintage kept from the armory. Your own ' +
    'characters, or anyone’s for officers. Shows a preview first; confirm to remove.',
  tier: 'member',
  destructive: true,
  input: z.object({ characterId: z.string().min(1) }),
  handler: async ({ characterId }, { caller, guildId, deps, dryRun }) => {
    const character = await editableCharacter(deps, guildId, caller, characterId);
    if (!character) return characterNotFound();
    const link = await deps.armory.getLinkByCharacter(guildId, characterId);
    if (!link) return notLinked(character.name);
    if (dryRun) {
      return success({ willUnlink: link }, { reasoning: `Unlinks ${link.slug}` });
    }
    await deps.armory.deleteLink(guildId, link.id);
    return success({ unlinked: link });
  },
});

export const armoryRefresh = command({
  name: 'armory-refresh',
  description:
    'Fetch a linked character from the armory again now, instead of waiting for the twice-daily ' +
    'refresh. Once every 10 minutes per character. The answer arrives in armory-get a few ' +
    'seconds later.',
  tier: 'member',
  mutation: true,
  input: z.object({ characterId: z.string().min(1) }),
  handler: async ({ characterId }, { caller, guildId, deps, now }) => {
    const character = await editableCharacter(deps, guildId, caller, characterId);
    if (!character) return characterNotFound();
    const link = await deps.armory.getLinkByCharacter(guildId, characterId);
    if (!link) return notLinked(character.name);
    const at = now();
    const wait = link.requestedAt + ARMORY_REFRESH_COOLDOWN_MS - at;
    if (wait > 0) {
      const minutes = Math.ceil(wait / 60_000);
      return error('ARMORY_REFRESH_TOO_SOON', `${link.slug} was asked for moments ago`, {
        suggestion: `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}; armory-get shows the latest`,
        retryable: true,
      });
    }
    const updated = await deps.armory.updateLink(guildId, link.id, { requestedAt: at });
    await deps.armoryEffects.fetch(guildId, [link.id]);
    return success(updated, { reasoning: `Fetching ${link.slug} from the armory` });
  },
});
