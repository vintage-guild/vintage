import { error, success } from '@vintage/guild-kit';
import { classSchema } from '@vintage/wow-data';
import { z } from 'zod';
import { NEED_LEVELS, RECRUITING_LIMITS, type Recruiting, STARTER_RECRUITING } from '../contract';
import { command, type StoredRecruiting } from '../store';

const toRecruiting = (stored: StoredRecruiting | null): Recruiting =>
  stored
    ? {
        headline: stored.headline,
        pitch: stored.pitch,
        needs: stored.needs,
        updatedAt: stored.updatedAt,
      }
    : STARTER_RECRUITING;

export const recruitingGet = command({
  name: 'recruiting-get',
  description:
    'What the website’s recruiting band says: the headline, the pitch, and each class the ' +
    'guild is recruiting with the specs wanted and how much (high, medium, closed). ' +
    '`updatedAt` is null while it still shows the starter text no officer has saved.',
  tier: 'public',
  input: z.object({}),
  handler: async (_input, { guildId, deps }) =>
    success(toRecruiting(await deps.site.getRecruiting(guildId))),
});

const needSchema = z.object({
  wowClass: classSchema,
  specs: z.string().trim().min(1).max(RECRUITING_LIMITS.specs).default('any'),
  need: z.enum(NEED_LEVELS),
});

export const recruitingSet = command({
  name: 'recruiting-set',
  description:
    'Change the website’s recruiting band. Give any of: `headline`, `pitch`, and `needs` (the ' +
    'whole list, in the order to show, one row per class: wowClass, specs as free text like ' +
    '"holy · discipline" or "any", need high | medium | closed). What you leave out stays as ' +
    'it is. Answers the band as it now reads.',
  tier: 'officer',
  mutation: true,
  input: z.object({
    headline: z.string().trim().min(1).max(RECRUITING_LIMITS.headline).optional(),
    pitch: z.string().trim().min(1).max(RECRUITING_LIMITS.pitch).optional(),
    needs: z.array(needSchema).max(RECRUITING_LIMITS.needs).optional(),
  }),
  handler: async (input, { caller, guildId, deps, now }) => {
    if (input.headline === undefined && input.pitch === undefined && input.needs === undefined) {
      return error('NOTHING_TO_CHANGE', 'Give a headline, a pitch, or the needs', {
        suggestion: 'Read the band with recruiting-get, then send the fields to change',
        retryable: false,
      });
    }
    const repeated = (input.needs ?? []).find(
      (n, i, all) => all.findIndex((m) => m.wowClass === n.wowClass) !== i,
    );
    if (repeated) {
      return error('DUPLICATE_CLASS', `${repeated.wowClass} is listed twice`, {
        suggestion: 'Give each class one row; put every spec wanted in its specs text',
        retryable: false,
      });
    }
    const current = toRecruiting(await deps.site.getRecruiting(guildId));
    const saved = await deps.site.putRecruiting({
      guildId,
      headline: input.headline ?? current.headline,
      pitch: input.pitch ?? current.pitch,
      needs: input.needs ?? current.needs,
      updatedAt: now(),
      updatedBy: caller.memberId ?? caller.surface,
    });
    const changed = (['headline', 'pitch', 'needs'] as const).filter((k) => input[k] !== undefined);
    return success(toRecruiting(saved), {
      reasoning: `Updated the recruiting ${changed.join(', ')}`,
    });
  },
});
