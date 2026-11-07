// System-only commands: the cron's sweep, and recording what a fetch found. Both take trusted
// data the host read itself, so no member may run them (guild-kit's systemOnly).
import { success } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  ARMORY_REFRESH_COOLDOWN_MS,
  ARMORY_STALE_MS,
  ARMORY_SWEEP_BATCH,
  type ArmoryLink,
} from '../contract';
import { classDiffers, MAX_EQUIPPED, MAX_ERROR } from '../domain/fetch';
import { command } from '../store';

export const armorySweep = command({
  name: 'armory-sweep',
  description:
    'Ask the armory again about the links checked longest ago (none in the last 12 hours, ' +
    'oldest first, 25 per run), and drop links whose character was removed. Run by the cron.',
  tier: 'officer',
  systemOnly: true,
  mutation: true,
  input: z.object({}),
  handler: async (_input, { guildId, deps, now }) => {
    const at = now();
    const characters = new Set(
      (await deps.armoryCharacters.listCharacters(guildId)).map((c) => c.id),
    );
    const due: ArmoryLink[] = [];
    let removed = 0;
    for (const link of await deps.armory.listLinks(guildId)) {
      if (!characters.has(link.characterId)) {
        await deps.armory.deleteLink(guildId, link.id);
        removed++;
        continue;
      }
      const inFlight = link.requestedAt > at - ARMORY_REFRESH_COOLDOWN_MS;
      const stale = link.checkedAt === null || link.checkedAt <= at - ARMORY_STALE_MS;
      if (stale && !inFlight) due.push(link);
    }
    // Never-checked links first, then the oldest checks; ties go to the one asked for longest
    // ago, so a batch whose fetches keep failing can't starve the rest.
    due.sort((a, b) => (a.checkedAt ?? -1) - (b.checkedAt ?? -1) || a.requestedAt - b.requestedAt);
    const batch = due.slice(0, ARMORY_SWEEP_BATCH);
    for (const link of batch) {
      await deps.armory.updateLink(guildId, link.id, { requestedAt: at });
    }
    if (batch.length > 0) {
      await deps.armoryEffects.fetch(
        guildId,
        batch.map((l) => l.id),
      );
    }
    return success(
      { requested: batch.length, waiting: due.length - batch.length, removed },
      { reasoning: `${batch.length} asked for, ${removed} orphaned links removed` },
    );
  },
});

const text = (max: number) => z.string().max(max);
const nullableText = (max: number) => text(max).nullable();
const nullableNumber = z.number().finite().nullable();

const profileSchema = z.object({
  blizzardId: z.number().int(),
  name: text(48),
  surname: text(48),
  level: z.number().int().min(0).max(200),
  className: nullableText(48),
  raceName: nullableText(48),
  faction: nullableText(24),
  guildName: nullableText(64),
  guildSlug: nullableText(96),
  activeSpec: nullableText(48),
  equippedItemLevel: nullableNumber,
  averageItemLevel: nullableNumber,
  lastLoginAt: nullableNumber,
});

const itemSchema = z.object({
  slot: text(32),
  itemId: z.number().int(),
  name: nullableText(120),
  quality: nullableText(24),
  itemLevel: nullableNumber,
});

const resultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('found'),
    profile: profileSchema,
    equipment: z.array(itemSchema).max(MAX_EQUIPPED),
    avatarUrl: z
      .url({ protocol: /^https$/ })
      .max(500)
      .nullable(),
  }),
  z.object({ status: z.literal('not-found') }),
  z.object({ status: z.literal('error'), error: text(MAX_ERROR) }),
]);

export const armoryRecord = command({
  name: 'armory-record',
  description:
    'Record what one armory fetch found for a link. Run by the fetch job; a fetch for a ' +
    'surname that has since changed (another slug) is ignored. Found replaces the profile, ' +
    'gear, and portrait; not-found and error keep the last ones.',
  tier: 'officer',
  systemOnly: true,
  mutation: true,
  input: z.object({ linkId: z.string().min(1), slug: z.string().min(1), result: resultSchema }),
  handler: async ({ linkId, slug, result }, { guildId, deps, now }) => {
    const link = await deps.armory.getLink(guildId, linkId);
    if (!link || link.slug !== slug) {
      return success(
        { recorded: false, link },
        { reasoning: link ? 'The link changed since the fetch began' : 'The link was removed' },
      );
    }
    const at = now();
    let patch: Partial<ArmoryLink>;
    if (result.status === 'found') {
      const character = await deps.armoryCharacters.getCharacter(guildId, link.characterId);
      patch = {
        status: 'found',
        profile: result.profile,
        equipment: result.equipment,
        avatarUrl: result.avatarUrl,
        classMismatch: character ? classDiffers(character.class, result.profile.className) : false,
        error: null,
        checkedAt: at,
        fetchedAt: at,
      };
    } else if (result.status === 'not-found') {
      patch = { status: 'not-found', error: null, checkedAt: at };
    } else {
      patch = { status: 'error', error: result.error, checkedAt: at };
    }
    const updated = await deps.armory.updateLink(guildId, linkId, patch);
    return success({ recorded: true, link: updated }, { reasoning: `${slug}: ${result.status}` });
  },
});
