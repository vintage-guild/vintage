import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  DISCORD_INVITE_PATTERN,
  type GuildProfile,
  PROFILE_LIMITS,
  STARTER_PROFILE,
} from '../contract';
import { command, type StoredProfile } from '../store';

/** The public view: the profile without who saved it. */
const toProfile = (stored: StoredProfile | null): GuildProfile =>
  stored
    ? {
        pills: stored.pills,
        intro: stored.intro,
        aboutLead: stored.aboutLead,
        aboutSections: stored.aboutSections,
        discordInvite: stored.discordInvite,
        contactEmail: stored.contactEmail,
        updatedAt: stored.updatedAt,
      }
    : STARTER_PROFILE;

export const guildProfileGet = command({
  name: 'guild-profile-get',
  description:
    'The guild’s own words on the public pages: the hero’s pills (ruleset, raid nights, sizes, ' +
    'style) and intro, the About page’s lead and sections, the public Discord invite, and the ' +
    'contact email for privacy and terms questions. `updatedAt` is null while it shows the ' +
    'starter text no officer has saved.',
  tier: 'public',
  input: z.object({}),
  handler: async (_input, { guildId, deps }) =>
    success(toProfile(await deps.site.getProfile(guildId))),
});

const text = (max: number) => z.string().trim().min(1).max(max);

export const guildProfileSet = command({
  name: 'guild-profile-set',
  description:
    'Change the guild profile the public pages show. Give any of: `pills` (short hero facts, ' +
    'in order), `intro` (the hero paragraph), `aboutLead`, `aboutSections` (the whole list of ' +
    '{heading, body}; separate paragraphs in a body with a blank line), `discordInvite` (a ' +
    'discord.gg or discord.com/invite link, or null to remove it), `contactEmail` (or null). ' +
    'What you leave out stays as it is. Answers the profile as it now reads.',
  tier: 'officer',
  mutation: true,
  input: z.object({
    pills: z.array(text(PROFILE_LIMITS.pill)).min(1).max(PROFILE_LIMITS.pills).optional(),
    intro: text(PROFILE_LIMITS.intro).optional(),
    aboutLead: text(PROFILE_LIMITS.aboutLead).optional(),
    aboutSections: z
      .array(z.object({ heading: text(PROFILE_LIMITS.heading), body: text(PROFILE_LIMITS.body) }))
      .min(1)
      .max(PROFILE_LIMITS.aboutSections)
      .optional(),
    discordInvite: z
      .string()
      .trim()
      .regex(DISCORD_INVITE_PATTERN, 'Use a discord.gg or discord.com/invite link')
      .nullable()
      .optional(),
    contactEmail: z.email().nullable().optional(),
  }),
  handler: async (input, { caller, guildId, deps, now }) => {
    const changed = (Object.keys(input) as (keyof typeof input)[]).filter(
      (k) => input[k] !== undefined,
    );
    if (changed.length === 0) {
      return error('NOTHING_TO_CHANGE', 'Give at least one field of the profile', {
        suggestion: 'Read it with guild-profile-get, then send the fields to change',
        retryable: false,
      });
    }
    const current = toProfile(await deps.site.getProfile(guildId));
    const saved = await deps.site.putProfile({
      guildId,
      pills: input.pills ?? current.pills,
      intro: input.intro ?? current.intro,
      aboutLead: input.aboutLead ?? current.aboutLead,
      aboutSections: input.aboutSections ?? current.aboutSections,
      discordInvite:
        input.discordInvite === undefined ? current.discordInvite : input.discordInvite,
      contactEmail: input.contactEmail === undefined ? current.contactEmail : input.contactEmail,
      updatedAt: now(),
      updatedBy: caller.memberId ?? caller.surface,
    });
    return success(toProfile(saved), {
      reasoning: `Updated the guild profile: ${changed.join(', ')}`,
    });
  },
});
