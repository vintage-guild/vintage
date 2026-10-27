import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { APPLICATION_LIMITS, APPLICATION_STATUSES, OPEN_STATUSES } from '../contract';
import { command } from '../store';

const notFound = (id: string) =>
  error('APPLICATION_NOT_FOUND', `No application ${id}`, {
    suggestion: 'List them with application-list',
    retryable: false,
  });

const closed = (status: string) =>
  error('APPLICATION_CLOSED', `This application is already ${status}`, {
    suggestion: 'Only new and in-review applications can be answered',
    retryable: false,
  });

export const applicationList = command({
  name: 'application-list',
  description:
    'Applications, newest first, with their labels (what the text reads as, whether it is complete, fit to the open roles). Filter by status.',
  tier: 'officer',
  input: z.object({
    statuses: z.array(z.enum(APPLICATION_STATUSES)).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  handler: async ({ statuses, limit }, { guildId, deps }) =>
    success(await deps.applications.list(guildId, { ...(statuses ? { statuses } : {}), limit })),
});

export const applicationReview = command({
  name: 'application-review',
  description:
    'Answer an application: move it to in-review or accept it, optionally with a reply the applicant gets in a DM. Accepting sends them the onboarding note and asks an officer, in the recruitment channel, to give them the recruit role in Discord.',
  tier: 'officer',
  mutation: true,
  input: z.object({
    applicationId: z.string().min(1),
    status: z.enum(['in-review', 'accepted']),
    reply: z.string().trim().min(1).max(APPLICATION_LIMITS.reply).optional(),
  }),
  handler: async ({ applicationId, status, reply }, { caller, guildId, deps, now }) => {
    const found = await deps.applications.get(guildId, applicationId);
    if (!found) return notFound(applicationId);
    if (!OPEN_STATUSES.includes(found.status)) return closed(found.status);
    const at = now();
    const saved = await deps.applications.update(guildId, applicationId, {
      status,
      ...(reply ? { reply } : {}),
      reviewedBy: caller.memberId ?? caller.surface,
      reviewedAt: at,
      updatedAt: at,
    });
    if (reply) await deps.applicationEffects.replied(guildId, applicationId);
    if (status === 'accepted') await deps.applicationEffects.accepted(guildId, applicationId);
    await deps.applicationEffects.changed(guildId, applicationId);
    return success(saved, {
      reasoning:
        status === 'accepted'
          ? 'Accepted; the onboarding DM follows, and an officer gives them the recruit role'
          : 'In review',
    });
  },
});

export const applicationDecline = command({
  name: 'application-decline',
  description:
    'Decline an application, optionally with a reply the applicant gets in a DM. Shows the application first; confirm to decline.',
  tier: 'officer',
  destructive: true,
  input: z.object({
    applicationId: z.string().min(1),
    reply: z.string().trim().min(1).max(APPLICATION_LIMITS.reply).optional(),
  }),
  handler: async ({ applicationId, reply }, { caller, guildId, deps, dryRun, now }) => {
    const found = await deps.applications.get(guildId, applicationId);
    if (!found) return notFound(applicationId);
    if (!OPEN_STATUSES.includes(found.status)) return closed(found.status);
    if (dryRun) {
      return success({
        wouldDecline: {
          id: found.id,
          applicant: found.applicantName,
          character: `${found.characterName} (${found.spec} ${found.wowClass})`,
          reply: reply ?? null,
        },
      });
    }
    const at = now();
    const saved = await deps.applications.update(guildId, applicationId, {
      status: 'declined',
      ...(reply ? { reply } : {}),
      reviewedBy: caller.memberId ?? caller.surface,
      reviewedAt: at,
      updatedAt: at,
    });
    if (reply) await deps.applicationEffects.replied(guildId, applicationId);
    await deps.applicationEffects.changed(guildId, applicationId);
    return success(saved);
  },
});

export const applicationConfigGet = command({
  name: 'application-config-get',
  description:
    'Where new applications are posted, and the onboarding note accepted applicants get.',
  tier: 'officer',
  input: z.object({}),
  handler: async (_input, { guildId, deps }) => success(await deps.applications.getConfig(guildId)),
});

export const applicationConfigSet = command({
  name: 'application-config-set',
  description:
    'Set the recruitment channel new applications are posted to (a Discord channel id, or null to stop posting) and the onboarding note (`{site}` becomes the website address).',
  tier: 'officer',
  mutation: true,
  input: z.object({
    channelId: z
      .string()
      .regex(/^\d{17,20}$/)
      .nullable()
      .optional(),
    onboarding: z.string().trim().min(1).max(APPLICATION_LIMITS.onboarding).optional(),
  }),
  handler: async (input, { guildId, deps, now }) => {
    if (input.channelId === undefined && input.onboarding === undefined) {
      return error('NOTHING_TO_CHANGE', 'Give a channelId or an onboarding note', {
        suggestion: 'Read the settings with application-config-get',
        retryable: false,
      });
    }
    const patch = {
      ...(input.channelId !== undefined ? { channelId: input.channelId } : {}),
      ...(input.onboarding !== undefined ? { onboarding: input.onboarding } : {}),
    };
    return success(await deps.applications.setConfig(guildId, patch, now()));
  },
});
