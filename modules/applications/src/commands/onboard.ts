import { success } from '@vintage/guild-kit';
import { z } from 'zod';
import { command } from '../store';

interface Onboarded {
  /** Whether the onboarding DM was scheduled by this call. */
  onboarded: boolean;
  /** The accepted application it looked at, if any. */
  applicationId: string | null;
}

const done = (data: Onboarded, reasoning: string) => success(data, { reasoning });

/**
 * Onboard an accepted applicant once role sync has promoted them (#135). apps/api runs it as the
 * system caller when member-sync lifts someone to recruit or above, and when an officer accepts
 * someone who already holds the role. The onboarding DM goes out once: the application is marked
 * either way, so an opted-out member never gets a late welcome.
 */
export const applicationOnboard = command({
  name: 'application-onboard',
  description:
    "Onboard a promoted member: if their latest accepted application hasn't been onboarded, mark it and send the onboarding DM (unless they turned DMs off). System only: runs after role sync promotes someone.",
  tier: 'officer',
  mutation: true,
  systemOnly: true,
  input: z.object({
    discordId: z.string().min(1),
    /** The member's DM opt-out, read from identity by the host. */
    dmOptOut: z.boolean(),
  }),
  handler: async ({ discordId, dmOptOut }, { guildId, deps, now }) => {
    // Every accepted application, newest first: someone onboarded once (a recruit who applied
    // again, say as a flex raider) is never welcomed a second time.
    const accepted = await deps.applications.list(guildId, { discordId, statuses: ['accepted'] });
    const latest = accepted[0];
    if (!latest) return done({ onboarded: false, applicationId: null }, 'No accepted application');
    const applicationId = latest.id;
    if (accepted.some((a) => a.onboardedAt !== null)) {
      return done({ onboarded: false, applicationId }, 'Already onboarded');
    }
    await deps.applications.update(guildId, applicationId, { onboardedAt: now() });
    if (dmOptOut) {
      return done(
        { onboarded: false, applicationId },
        'They turned DMs off; marked onboarded without a DM',
      );
    }
    await deps.applicationEffects.onboard(guildId, applicationId);
    return done({ onboarded: true, applicationId }, 'Onboarding DM scheduled');
  },
});
