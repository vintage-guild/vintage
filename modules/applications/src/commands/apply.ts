import { error, success, tierAllows } from '@vintage/guild-kit';
import { characterNameSchema, classSchema, normalizeCharacterName } from '@vintage/wow-data';
import { z } from 'zod';
import {
  APPLICATION_LIMITS,
  APPLY_ROLES,
  type Application,
  OPEN_STATUSES,
  toOwnView,
} from '../contract';
import { command } from '../store';

/** At most this many applications per person per window, so a form can't be used to spam. */
export const SUBMIT_LIMIT = { count: 3, windowMs: 30 * 24 * 60 * 60 * 1000 };

const text = (max: number) => z.string().trim().min(1).max(max);

export const applicationSubmit = command({
  name: 'application-submit',
  description:
    'Apply to raid with Vintage as a raider or flex raider: your character, what you play, a few ' +
    'words about you, your raiding experience, and when you can raid. Needs a Discord account ' +
    '(apply from Discord, or sign in with Discord on the site). Officers answer in Discord.',
  tier: 'public',
  mutation: true,
  input: z.object({
    characterName: characterNameSchema,
    wowClass: classSchema,
    spec: text(APPLICATION_LIMITS.spec),
    role: z.enum(APPLY_ROLES),
    about: text(APPLICATION_LIMITS.about),
    experience: text(APPLICATION_LIMITS.experience),
    availability: text(APPLICATION_LIMITS.availability),
    /** How officers see you; the Discord display name when you apply from Discord. */
    applicantName: z.string().trim().min(1).max(64).optional(),
  }),
  handler: async (input, { caller, guildId, deps, now }) => {
    if (!caller.discordId) {
      return error('DISCORD_REQUIRED', 'Applications need a Discord account', {
        suggestion:
          'Apply with /random apply in the Vintage Discord, or sign in with Discord on the site',
        retryable: false,
      });
    }
    if (tierAllows(caller.tier, 'raider')) {
      return error('ALREADY_RAIDING', 'You already raid with Vintage', {
        suggestion: 'Ask an officer if you want to change your rank',
        retryable: false,
      });
    }
    const at = now();
    const mine = await deps.applications.list(guildId, {
      discordId: caller.discordId,
      since: at - SUBMIT_LIMIT.windowMs,
    });
    if (mine.some((a) => OPEN_STATUSES.includes(a.status))) {
      return error('APPLICATION_OPEN', 'Your application is still with the officers', {
        suggestion: 'Check it with application-get; officers reply in Discord',
        retryable: false,
      });
    }
    if (mine.length >= SUBMIT_LIMIT.count) {
      return error('TOO_MANY_APPLICATIONS', 'You have applied too often this month', {
        suggestion: 'Talk to an officer in Discord',
        retryable: false,
      });
    }
    const saved = await deps.applications.insert({
      guildId,
      discordId: caller.discordId,
      applicantName: input.applicantName ?? caller.discordId,
      characterName: normalizeCharacterName(input.characterName),
      wowClass: input.wowClass,
      spec: input.spec,
      role: input.role,
      about: input.about,
      experience: input.experience,
      availability: input.availability,
      status: 'new',
      labels: null,
      reply: null,
      reviewedBy: null,
      reviewedAt: null,
      postChannelId: null,
      postMessageId: null,
      createdAt: at,
      updatedAt: at,
    });
    await deps.applicationEffects.submitted(guildId, saved.id);
    return success(toOwnView(saved), { reasoning: 'Sent to the officers' });
  },
});

const notFound = (id: string) =>
  error('APPLICATION_NOT_FOUND', `No application ${id}`, {
    suggestion: 'Use application-list (officers) or application-get without an id for your own',
    retryable: false,
  });

export const applicationGet = command({
  name: 'application-get',
  description:
    'Your latest application and where it stands (no id), or one application by id. Officers see ' +
    'the whole application with its labels; applicants see their own status and the reply.',
  tier: 'public',
  input: z.object({ applicationId: z.string().min(1).optional() }),
  handler: async ({ applicationId }, { caller, guildId, deps }) => {
    const officer = tierAllows(caller.tier, 'officer');
    if (applicationId) {
      const found = await deps.applications.get(guildId, applicationId);
      if (!found) return notFound(applicationId);
      if (officer) return success(found);
      if (caller.discordId && found.discordId === caller.discordId)
        return success(toOwnView(found));
      return notFound(applicationId);
    }
    if (!caller.discordId) return success(null);
    const [latest] = await deps.applications.list(guildId, {
      discordId: caller.discordId,
      limit: 1,
    });
    return success(latest ? toOwnView(latest) : null);
  },
});

export const applicationWithdraw = command({
  name: 'application-withdraw',
  description: 'Take back your open application.',
  tier: 'public',
  mutation: true,
  input: z.object({ applicationId: z.string().min(1) }),
  handler: async ({ applicationId }, { caller, guildId, deps, now }) => {
    const found = await deps.applications.get(guildId, applicationId);
    if (!found || !caller.discordId || found.discordId !== caller.discordId) {
      return notFound(applicationId);
    }
    if (!OPEN_STATUSES.includes(found.status)) {
      return error('APPLICATION_CLOSED', `This application is already ${found.status}`, {
        suggestion: 'Nothing to withdraw',
        retryable: false,
      });
    }
    const saved = await deps.applications.update(guildId, applicationId, {
      status: 'withdrawn',
      updatedAt: now(),
    });
    await deps.applicationEffects.changed(guildId, applicationId);
    return success(toOwnView(saved));
  },
});

export type { Application };
