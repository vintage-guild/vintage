// GuildDirectory over the Discord REST API with plain fetch. Deliberately small: it is swapped for
// libs/discord-kit's REST client once that lands (#10). Never logs or echoes the bot token.
import type { DirectoryMember, GuildDirectory } from '@vintage/identity/commands';

const API = 'https://discord.com/api/v10';
const USER_AGENT = 'DiscordBot (https://github.com/vintage-guild/vintage, 0.0.0)';

/** The fields of a Discord guild member object this adapter reads. */
interface ApiGuildMember {
  user?: { id: string; username: string; global_name?: string | null; bot?: boolean };
  nick?: string | null;
  roles: string[];
}

export interface DiscordDirectoryOptions {
  token: string;
  /** The Discord guild (server) id. */
  guildId: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Members per request; Discord allows 1–1000. */
  pageSize?: number;
  /** 429 retries per request before giving up. */
  maxRetries?: number;
  /** Longest rate-limit wait to honor; longer ones fail the run (the next cron run retries). */
  maxWaitMs?: number;
}

const HINTS: Record<number, string> = {
  401: 'check DISCORD_BOT_TOKEN',
  403: 'enable the Server Members intent and make sure the bot is in the guild',
  404: 'check DISCORD_GUILD_ID',
};

export function discordGuildDirectory(options: DiscordDirectoryOptions): GuildDirectory {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pageSize = options.pageSize ?? 1000;
  const maxRetries = options.maxRetries ?? 5;
  const maxWaitMs = options.maxWaitMs ?? 60_000;
  let waitBeforeNext = 0;

  const wait = async (ms: number) => {
    if (ms > maxWaitMs) throw new Error(`Discord asked to wait ${ms}ms; giving up this run`);
    if (ms > 0) await sleep(ms);
  };

  async function get(url: URL): Promise<ApiGuildMember[]> {
    for (let attempt = 0; ; attempt++) {
      await wait(waitBeforeNext);
      waitBeforeNext = 0;
      const res = await doFetch(url, {
        headers: { Authorization: `Bot ${options.token}`, 'User-Agent': USER_AGENT },
      });
      if (res.status === 429) {
        if (attempt >= maxRetries) throw new Error(`Discord rate limit: ${attempt} retries used`);
        waitBeforeNext = await retryAfterMs(res);
        continue;
      }
      if (!res.ok) throw failure(res.status);
      waitBeforeNext = resetAfterMs(res);
      return (await res.json()) as ApiGuildMember[];
    }
  }

  return {
    async page(cursor) {
      const url = new URL(`${API}/guilds/${encodeURIComponent(options.guildId)}/members`);
      url.searchParams.set('limit', String(pageSize));
      if (cursor) url.searchParams.set('after', cursor);
      const rows = await get(url);
      // Members come back in ascending user id order; the last id is the next `after`.
      const last = rows.at(-1)?.user?.id;
      return {
        members: rows.flatMap(toDirectoryMember),
        next: rows.length >= pageSize && last ? last : null,
      };
    },
  };
}

/** Discord's error code for "that user isn't in this server". */
const UNKNOWN_MEMBER = 10007;

/**
 * One guild member by Discord id (sign-in, #7), or null when they aren't in the server. Other
 * failures throw, including an unknown guild, so a misconfigured server id isn't read as "left".
 */
export async function fetchGuildMember(
  options: Pick<DiscordDirectoryOptions, 'token' | 'guildId' | 'fetch'>,
  discordId: string,
): Promise<DirectoryMember | null> {
  const doFetch = options.fetch ?? fetch;
  const url = `${API}/guilds/${encodeURIComponent(options.guildId)}/members/${encodeURIComponent(discordId)}`;
  const res = await doFetch(url, {
    headers: { Authorization: `Bot ${options.token}`, 'User-Agent': USER_AGENT },
  });
  if (res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { code?: number };
    if (body.code === UNKNOWN_MEMBER) return null;
  }
  if (!res.ok) throw failure(res.status, 'get guild member');
  return toDirectoryMember((await res.json()) as ApiGuildMember)[0] ?? null;
}

/** How long a 429 asks us to wait: `retry_after` (seconds) in the body, else the header. */
async function retryAfterMs(res: Response): Promise<number> {
  const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
  const seconds = body.retry_after ?? Number(res.headers.get('retry-after') ?? 1);
  return Math.ceil(seconds * 1000);
}

/** Bucket exhausted: wait out the reset before the next request instead of earning a 429. */
function resetAfterMs(res: Response): number {
  if (res.headers.get('x-ratelimit-remaining') !== '0') return 0;
  return Math.ceil(Number(res.headers.get('x-ratelimit-reset-after') ?? 0) * 1000);
}

function failure(status: number, what = 'list guild members'): Error {
  const hint = HINTS[status];
  return new Error(`Discord ${what} failed: ${status}${hint ? `, ${hint}` : ''}`);
}

/** Bots are never guild members; rows without a user can't be synced. */
function toDirectoryMember(row: ApiGuildMember): DirectoryMember[] {
  if (!row.user || row.user.bot) return [];
  const displayName = row.nick || row.user.global_name || row.user.username;
  return [{ discordId: row.user.id, displayName, roleIds: row.roles }];
}
