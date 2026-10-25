// Role sync (PLAN §3.4, #8): list the guild's Discord members through the bot and run
// `member-sync` for each, so ranks and tiers follow Discord roles. Runs from crons.ts every
// 15 minutes; officers and developers can also run it by hand:
//   npx convex run roleSync:syncAllMembers

import { discordGuildDirectory } from '../src/discord-directory';
import { type RoleSyncSummary, runRoleSync } from '../src/role-sync';
import { internal } from './_generated/api';
import { internalAction, internalQuery } from './_generated/server';
import { GUILD_ID } from './commands';
import { identityStore } from './stores';

/** Members identity already knows, for finding the ones who left the server. */
export const knownMembers = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ discordId: string; displayName: string }[]> =>
    (await identityStore(ctx).listMembers(GUILD_ID)).map(({ discordId, displayName }) => ({
      discordId,
      displayName,
    })),
});

let warnedUnconfigured = false;

/** Sync every member's rank and tier from Discord. A no-op until the bot is configured. */
export const syncAllMembers = internalAction({
  args: {},
  handler: async (ctx): Promise<RoleSyncSummary | { skipped: string }> => {
    const token = process.env.DISCORD_BOT_TOKEN;
    const discordGuildId = process.env.DISCORD_GUILD_ID;
    if (!token || !discordGuildId) {
      if (!warnedUnconfigured) {
        console.log('Role sync skipped: set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in Convex env');
        warnedUnconfigured = true;
      }
      return { skipped: 'DISCORD_BOT_TOKEN or DISCORD_GUILD_ID is not set' };
    }
    const summary = await runRoleSync({
      directory: discordGuildDirectory({ token, guildId: discordGuildId }),
      knownMembers: () => ctx.runQuery(internal.roleSync.knownMembers, {}),
      apply: (members) => ctx.runMutation(internal.commands.syncMembers, { members }),
    });
    console.log(
      `Role sync: ${summary.inServer} in server, ${summary.departed} departed, ` +
        `${summary.synced} synced, ${summary.failed.length} failed`,
    );
    return summary;
  },
});
