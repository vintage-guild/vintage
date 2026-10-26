// Set the bot's Discord username and avatar (PATCH /users/@me).
//
//   DISCORD_BOT_TOKEN=… [DISCORD_GUILD_ID=…] pnpm --filter @vintage/gateway set-bot-profile \
//     [--username Random] [--avatar path/to/avatar.png]
//
// The username is display only: slash commands stay /vintage. The avatar must be PNG, JPEG, or
// GIF; Discord rejects WebP, so convert the site art first (any image editor, or a browser canvas).
// Discord allows about two username changes per hour. With DISCORD_GUILD_ID it also reports the
// bot's nickname in that server, which overrides the username there. The token is never printed.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import { createDiscordRest, DiscordRestError } from '@vintage/discord-kit';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    username: { type: 'string', default: 'Random' },
    avatar: { type: 'string' },
  },
});

const token = process.env.DISCORD_BOT_TOKEN || fail('DISCORD_BOT_TOKEN is not set');
const guildId = process.env.DISCORD_GUILD_ID || undefined;

function avatarDataUri(path: string): string {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) fail(`${path}: Discord avatars must be PNG, JPEG, or GIF`);
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

const rest = createDiscordRest({ token });
const body: { username?: string; avatar?: string } = {};
if (values.username) body.username = values.username;
if (values.avatar) body.avatar = avatarDataUri(values.avatar);

try {
  const me = await rest.request<{ id: string; username: string; avatar: string | null }>(
    'PATCH',
    '/users/@me',
    { body },
  );
  console.log(`bot is now "${me.username}"${me.avatar ? ', avatar set' : ''}`);
  if (guildId) {
    // Bots can't read /members/@me; look themselves up by id.
    const member = await rest.request<{ nick: string | null }>(
      'GET',
      `/guilds/${guildId}/members/${me.id}`,
    );
    console.log(
      member.nick
        ? `in server ${guildId} the bot's nickname "${member.nick}" overrides the username`
        : `no nickname in server ${guildId}: members see "${me.username}"`,
    );
  }
} catch (err) {
  fail(err instanceof DiscordRestError ? err.message : String(err));
}
