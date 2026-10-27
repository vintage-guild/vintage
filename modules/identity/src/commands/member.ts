import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { GUILD_RANKS } from '../contract';
import { resolveRank, tierForRank } from '../domain/rank';
import { command } from '../store';

export const notSignedIn = () =>
  error('NOT_SIGNED_IN', 'Sign in with Discord to see your member profile', {
    suggestion: 'Sign in on the website, or connect your agent through /mcp with OAuth',
    retryable: false,
  });

export const memberMe = command({
  name: 'member-me',
  description: 'Your member profile: guild rank, tier, Discord roles, preferences, and characters.',
  tier: 'member',
  input: z.object({}),
  handler: async (_input, { caller, guildId, deps }) => {
    if (!caller.memberId) return notSignedIn();
    const member = await deps.identity.getMember(guildId, caller.memberId);
    if (!member) return notSignedIn();
    const characters = await deps.identity.listCharacters(guildId, { memberId: member.id });
    return success({ member, characters });
  },
});

export const memberList = command({
  name: 'member-list',
  description:
    'Guild members with their rank, tier, main character, when they got that rank (null when it ' +
    'changed before that was recorded), and when Discord last synced them. Discord-only ' +
    'friends are not listed.',
  tier: 'recruit',
  input: z.object({ rank: z.enum(GUILD_RANKS).exclude(['friend']).optional() }),
  handler: async ({ rank }, { guildId, deps }) => {
    const [members, characters] = await Promise.all([
      deps.identity.listMembers(guildId),
      deps.identity.listCharacters(guildId),
    ]);
    const mains = new Map(characters.filter((c) => c.isMain).map((c) => [c.memberId, c]));
    const rows = members
      .filter((m) => m.tier !== 'public' && (!rank || m.rank === rank))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map((m) => ({
        id: m.id,
        displayName: m.displayName,
        rank: m.rank,
        tier: m.tier,
        main: mains.get(m.id) ?? null,
        rankSince: m.rankSince,
        syncedAt: m.syncedAt,
      }));
    return success(rows, { reasoning: `${rows.length} member(s)` });
  },
});

/**
 * Upsert a member from Discord data. The host calls it at sign-in and from the role-sync cron,
 * with roles it read from Discord itself. System-only: the role ids are trusted input, so an
 * officer (or a stolen officer session) must not be able to hand in any Discord id with any roles.
 */
export const memberSync = command({
  name: 'member-sync',
  description:
    "Sync one member's guild rank and tier from their Discord server membership and roles. " +
    'System only: runs at sign-in and from the role-sync cron.',
  tier: 'officer',
  mutation: true,
  systemOnly: true,
  input: z.object({
    discordId: z.string().min(1),
    displayName: z.string().min(1),
    /** Whether they're in the guild's Discord server at all. */
    inServer: z.boolean(),
    roleIds: z.array(z.string()),
  }),
  handler: async (input, { guildId, deps, now }) => {
    const map = await deps.identity.getRoleRankMap(guildId);
    const rank = resolveRank(input.inServer, input.roleIds, map);
    const tier = tierForRank(rank);
    const before = await deps.identity.getMemberByDiscordId(guildId, input.discordId);
    const at = now();
    const previousRank = before ? before.rank : null;
    // A new member's rank counts from this sync; an unchanged one keeps its date (or its null).
    const rankSince = !before || previousRank !== rank ? at : before.rankSince;
    const member = await deps.identity.upsertMember({
      guildId,
      discordId: input.discordId,
      displayName: input.displayName,
      roleIds: input.roleIds,
      rank,
      tier,
      syncedAt: at,
      rankSince,
    });
    const changed = !before || previousRank !== rank || before.tier !== tier;
    const label = rank ? `${rank} (${tier})` : `no guild rank (${tier})`;
    return success(
      { member, previousRank },
      { reasoning: changed ? `Now ${label}` : `Unchanged: ${label}` },
    );
  },
});

export const memberPrefsSet = command({
  name: 'member-prefs-set',
  description:
    'Update your preferences: DM opt-out and timezone. Your main (character-update isMain) is your default character.',
  tier: 'member',
  mutation: true,
  input: z.object({
    dmOptOut: z.boolean().optional(),
    timezone: z.string().optional(),
  }),
  handler: async (patch, { caller, guildId, deps }) => {
    if (!caller.memberId) return notSignedIn();
    const member = await deps.identity.getMember(guildId, caller.memberId);
    if (!member) return notSignedIn();
    const definedPatch = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    const updated = await deps.identity.setPrefs(guildId, member.id, {
      ...member.prefs,
      ...definedPatch,
    });
    return success(updated.prefs);
  },
});
