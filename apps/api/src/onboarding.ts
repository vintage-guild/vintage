// Onboarding an accepted applicant (#135). The bot never sets roles: an officer gives the recruit
// role in Discord, role sync promotes the member, and then `application-onboard` sends the
// onboarding DM once (under the DM opt-out). Two moments can finish that chain, so both call here:
//   - member-sync lifts someone from below recruit to recruit or above (convex/commands.ts);
//   - an officer accepts someone who already holds the role (convex/applications.ts).
// Pure over a `run` port, so Convex and the JTBD host run the same rule.
import type { CommandResult } from '@vintage/guild-kit';
import { tierAllows } from '@vintage/guild-kit';
import { type GuildRank, type Member, RANK_TIER } from '@vintage/identity/contract';

type RunSystem = (name: string, input: unknown) => Promise<CommandResult<unknown>>;

/** Whether a member-sync result lifted the member from below recruit to recruit or above. */
export function promotedToRecruit(synced: {
  member: Pick<Member, 'tier'>;
  previousRank: GuildRank | null;
}): boolean {
  const before = synced.previousRank ? RANK_TIER[synced.previousRank] : 'public';
  return !tierAllows(before, 'recruit') && tierAllows(synced.member.tier, 'recruit');
}

/** Run `application-onboard` for a member who holds recruit or above; nothing otherwise. */
export async function onboardIfPromoted(
  member: Pick<Member, 'discordId' | 'tier' | 'prefs'> | null,
  run: RunSystem,
): Promise<CommandResult<unknown> | null> {
  if (!member || !tierAllows(member.tier, 'recruit')) return null;
  return run('application-onboard', {
    discordId: member.discordId,
    dmOptOut: member.prefs.dmOptOut,
  });
}

/** After a member-sync: onboard them if this sync promoted them. */
export async function onboardAfterSync(
  result: CommandResult<unknown>,
  run: RunSystem,
): Promise<CommandResult<unknown> | null> {
  if (!result.success) return null;
  const synced = result.data as { member: Member; previousRank: GuildRank | null };
  return promotedToRecruit(synced) ? onboardIfPromoted(synced.member, run) : null;
}
