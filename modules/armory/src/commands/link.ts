import { characterSlug } from '@vintage/forever-api';
import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { ARMORY_REFRESH_COOLDOWN_MS } from '../contract';
import { command } from '../store';
import { characterNotFound, editableCharacter, notLinked } from './shared';

/** A Forever last name: one word of 1–12 letters, as identity's character names allow. */
const surnameSchema = z
  .string()
  .trim()
  .regex(/^\p{L}{1,12}$/u, 'A surname is one word of up to 12 letters');

const lower = (s: string) => s.toLocaleLowerCase('en-US');
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * The armory's first name and surname for a registered character: identity keeps "Bloodfen Il"
 * or just "Bloodfen". A registered last name is the surname; a given one must agree with it.
 */
export function armoryName(
  registered: string,
  surname: string | undefined,
): { first: string; surname: string } | 'needed' | 'mismatch' {
  const [first = registered, last] = registered.trim().split(/\s+/);
  if (last && surname && lower(last) !== lower(surname)) return 'mismatch';
  const chosen = last ?? surname;
  return chosen ? { first, surname: chosen } : 'needed';
}

export const armoryLink = command({
  name: 'armory-link',
  description:
    'Link one of your registered characters to its WoW: Forever armory entry (Forever has no ' +
    'realms; the armory finds a character by first name and surname). A character registered ' +
    'with its last name ("Bloodfen Il") needs nothing more; otherwise give the surname. ' +
    'Vintage fetches the armory right away and keeps the level, item level, gear, and portrait ' +
    'fresh after that; armory-get shows them. Linking again with another surname replaces the ' +
    'link. Officers can link anyone’s character. A link is what the member says, not proof of ' +
    'ownership.',
  tier: 'member',
  mutation: true,
  input: z.object({ characterId: z.string().min(1), surname: surnameSchema.optional() }),
  handler: async ({ characterId, surname: given }, { caller, guildId, deps, now }) => {
    const character = await editableCharacter(deps, guildId, caller, characterId);
    if (!character) return characterNotFound();
    const names = armoryName(character.name, given);
    if (names === 'needed') {
      return error('ARMORY_SURNAME_NEEDED', `${character.name} has no last name to look up`, {
        suggestion: 'Give the surname, or add it to the character’s name with character-update',
        retryable: false,
      });
    }
    if (names === 'mismatch') {
      return error('ARMORY_SURNAME_MISMATCH', `${character.name} has another last name`, {
        suggestion: 'Leave out the surname, or fix the character’s name with character-update',
        retryable: false,
      });
    }
    const { first, surname } = names;
    const slug = characterSlug(first, surname);
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
      name: first,
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
      // Members read this on the website as is: the character's name and plain minutes.
      const since = Math.floor((at - link.requestedAt) / 60_000);
      const ago = since < 1 ? 'under a minute ago' : `${plural(since, 'minute')} ago`;
      return error(
        'ARMORY_REFRESH_TOO_SOON',
        `${character.name} was looked up on the armory ${ago}`,
        {
          suggestion: `Try again in ${plural(Math.ceil(wait / 60_000), 'minute')}`,
          retryable: true,
        },
      );
    }
    const updated = await deps.armory.updateLink(guildId, link.id, { requestedAt: at });
    await deps.armoryEffects.fetch(guildId, [link.id]);
    return success(updated, { reasoning: `Fetching ${link.slug} from the armory` });
  },
});
