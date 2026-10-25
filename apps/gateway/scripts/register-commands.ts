// Register the gateway's slash commands with Discord.
//
//   DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… [DISCORD_GUILD_ID=…] pnpm --filter @vintage/gateway register-commands
//
// With DISCORD_GUILD_ID the commands are guild-scoped and appear instantly (use this while
// developing). Without it they are global and can take up to an hour to show up. Each command is
// upserted by name, so re-running is safe and leaves other commands alone.
import { createDiscordRest, DiscordRestError } from '@vintage/discord-kit';
import { COMMANDS } from '../src/commands';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set (see apps/gateway/.env.example)`);
    process.exit(1);
  }
  return value;
}

const appId = requireEnv('DISCORD_APP_ID');
const token = requireEnv('DISCORD_BOT_TOKEN');
const guildId = process.env.DISCORD_GUILD_ID || undefined;

const rest = createDiscordRest({ token });
const scope = guildId ? `guild ${guildId}` : 'global';

try {
  for (const command of COMMANDS) {
    await rest.upsertCommand(appId, command, guildId);
    console.log(`registered /${command.name} (${scope})`);
  }
} catch (err) {
  console.error(err instanceof DiscordRestError ? err.message : err);
  process.exit(1);
}
