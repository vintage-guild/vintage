import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { GUILD_RANKS, type GuildRank, type RoleRankMap } from '../contract';
import { command } from '../store';

/** Discord ids are snowflakes: 17–20 digit strings. Catches role names pasted by mistake. */
const discordRoleId = z
  .string()
  .regex(/^\d{17,20}$/, 'Discord role ids are 17–20 digit snowflakes (Copy Role ID in Discord)');

export interface RoleRankDiff {
  added: { discordRoleId: string; rank: GuildRank }[];
  removed: { discordRoleId: string; rank: GuildRank }[];
  changed: { discordRoleId: string; from: GuildRank; to: GuildRank }[];
  unchanged: number;
}

/** What replacing `before` with `after` changes, each list ordered by role id. */
export function diffRoleRankMap(before: RoleRankMap, after: RoleRankMap): RoleRankDiff {
  const diff: RoleRankDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const id of ids) {
    const from = Object.hasOwn(before, id) ? before[id] : undefined;
    const to = Object.hasOwn(after, id) ? after[id] : undefined;
    if (from && to) {
      if (from === to) diff.unchanged++;
      else diff.changed.push({ discordRoleId: id, from, to });
    } else if (to) diff.added.push({ discordRoleId: id, rank: to });
    else if (from) diff.removed.push({ discordRoleId: id, rank: from });
  }
  return diff;
}

const describe = (diff: RoleRankDiff) =>
  diff.added.length + diff.removed.length + diff.changed.length === 0
    ? 'No changes'
    : `${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed`;

export const guildRolesGet = command({
  name: 'guild-roles-get',
  description: 'The Discord role id → guild rank map that member-sync uses to set rank and tier.',
  tier: 'leader',
  input: z.object({}),
  handler: async (_input, { guildId, deps }) => {
    const roles = await deps.identity.getRoleRankMap(guildId);
    const count = Object.keys(roles).length;
    return success(roles, {
      reasoning: count
        ? `${count} Discord role(s) mapped to a guild rank`
        : 'No roles mapped yet: everyone syncs as public until an officer runs guild-roles-set',
    });
  },
});

export const guildRolesSet = command({
  name: 'guild-roles-set',
  description:
    'Replace the Discord role id → guild rank map. Shows the diff first; confirm to save. ' +
    'Tiers follow at the next role sync.',
  tier: 'officer',
  destructive: true,
  input: z.object({
    /** Every mapped role, as Discord role id → guild rank. Roles left out lose their rank. */
    roles: z.record(discordRoleId, z.enum(GUILD_RANKS)),
  }),
  handler: async ({ roles }, { guildId, deps, dryRun }) => {
    if (!Object.values(roles).includes('officer')) {
      return error('OFFICER_ROLE_REQUIRED', 'The map must keep at least one officer role', {
        suggestion:
          'Include the @Officer role id mapped to "officer"; otherwise every officer drops to ' +
          'public at the next role sync and nobody can fix the map',
        retryable: false,
      });
    }
    const before = await deps.identity.getRoleRankMap(guildId);
    const diff = diffRoleRankMap(before, roles);
    if (dryRun) return success({ diff, roles }, { reasoning: describe(diff) });
    const saved = await deps.identity.setRoleRankMap(guildId, roles);
    return success(
      { diff, roles: saved },
      { reasoning: `${describe(diff)}. Ranks and tiers update at the next role sync.` },
    );
  },
});
