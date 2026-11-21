/** Parse a comma-separated list of Discord snowflake ids from an env var. */
function parseIdSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

/**
 * Whether a syncing Discord member gets deployment-configured `adminAccess` (`officer` tier while
 * preserving their real Discord guild rank). Matches either a configured Discord user id
 * (`VINTAGE_ADMIN_DISCORD_IDS`) or any configured Discord role id (`VINTAGE_ADMIN_ROLE_IDS`, e.g.
 * a guild "Tech Wizard" role).
 */
export function hasAdminAccess(
  member: { discordId: string; roleIds: readonly string[] },
  env: { VINTAGE_ADMIN_DISCORD_IDS?: string; VINTAGE_ADMIN_ROLE_IDS?: string },
): boolean {
  if (parseIdSet(env.VINTAGE_ADMIN_DISCORD_IDS).has(member.discordId)) return true;
  const adminRoles = parseIdSet(env.VINTAGE_ADMIN_ROLE_IDS);
  return member.roleIds.some((id) => adminRoles.has(id));
}
