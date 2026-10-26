// Register the gateway's slash commands with Discord.
//
//   DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… [DISCORD_GUILD_ID=…] pnpm --filter @vintage/gateway register-commands [--prune]
//
// With DISCORD_GUILD_ID the commands are guild-scoped and appear instantly (use this while
// developing). Without it they are global and can take up to an hour to show up. Each command is
// upserted by name, so re-running is safe and leaves other commands alone. With --prune it also
// deletes commands registered in the same scope that the code no longer defines (a renamed
// command, like /vintage → /random).
import { parseArgs } from 'node:util';
import { createDiscordRest, DiscordRestError } from '@vintage/discord-kit';
import { COMMANDS } from '../src/commands';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set (see apps/gateway/README.md → Environment)`);
    process.exit(1);
  }
  return value;
}

const { values } = parseArgs({ options: { prune: { type: 'boolean', default: false } } });
const appId = requireEnv('DISCORD_APP_ID');
const token = requireEnv('DISCORD_BOT_TOKEN');
const guildId = process.env.DISCORD_GUILD_ID || undefined;

const rest = createDiscordRest({ token });
const scope = guildId ? `guild ${guildId}` : 'global';
const path = guildId
  ? `/applications/${appId}/guilds/${guildId}/commands`
  : `/applications/${appId}/commands`;

try {
  for (const command of COMMANDS) {
    await rest.upsertCommand(appId, command, guildId);
    console.log(`registered /${command.name} (${scope})`);
  }
  if (values.prune) {
    const defined = new Set(COMMANDS.map((c) => c.name));
    const registered = await rest.request<{ id: string; name: string }[]>('GET', path);
    for (const stale of registered.filter((c) => !defined.has(c.name))) {
      await rest.request('DELETE', `${path}/${stale.id}`);
      console.log(`removed /${stale.name} (${scope})`);
    }
  }
} catch (err) {
  console.error(err instanceof DiscordRestError ? err.message : err);
  process.exit(1);
}
