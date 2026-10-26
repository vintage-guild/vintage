// Who a website request runs as (#7). Discord sign-in puts the member's Discord id in the Convex
// token as the `discordId` claim (convex/auth.ts); this maps it to their member record and tier.
// Pure over a lookup, so tests don't need Convex.
import { type Caller, publicCaller } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';

/** The custom claim convex/auth.ts adds to the Convex token. */
export const DISCORD_ID_CLAIM = 'discordId';

/** The Discord id in a Convex user identity, or undefined when signed out or not via Discord. */
export function discordIdOf(identity: Record<string, unknown> | null): string | undefined {
  const value = identity?.[DISCORD_ID_CLAIM];
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Signed out: public. Signed in but unknown to identity (not in the Discord server yet): public,
 * with the Discord id so commands can say who they are. A member: their tier and ids.
 */
export async function webCaller(
  guildId: string,
  discordId: string | undefined,
  memberByDiscordId: (discordId: string) => Promise<Member | null>,
): Promise<Caller> {
  if (!discordId) return publicCaller(guildId);
  const member = await memberByDiscordId(discordId);
  if (!member) return { ...publicCaller(guildId), discordId };
  return {
    surface: 'web',
    guildId,
    tier: member.tier,
    memberId: member.id,
    discordId: member.discordId,
  };
}
