// A small Discord REST client. `fetch` is injected so it runs anywhere (Convex actions, Vercel,
// tests) and so tests never touch the real API. Handles bot-token auth, JSON, and 429s: it waits
// `retry_after` and retries, a bounded number of times. Other errors surface as DiscordRestError.
import type { ApplicationCommand } from './commands';
import type { MessageData } from './interactions';

export const DISCORD_API_BASE = 'https://discord.com/api/v10';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface DiscordRestOptions {
  /** Bot token, without the `Bot ` prefix. Required for any call that uses bot auth. */
  token?: string;
  fetch?: FetchLike;
  baseUrl?: string;
  /** Retries after a 429 before giving up. Default 3. */
  maxRetries?: number;
  /** A 429 asking to wait longer than this fails fast instead. Default 30 s. */
  maxRetryAfterMs?: number;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
}

export interface RequestOptions {
  body?: unknown;
  /** Send the bot token. Interaction-token (webhook) routes do not need it. Default true. */
  auth?: boolean;
}

/** Guild Scheduled Event status (Discord's numbers). */
export const ScheduledEventStatus = {
  SCHEDULED: 1,
  ACTIVE: 2,
  COMPLETED: 3,
  CANCELED: 4,
} as const;

/** Guild Scheduled Event entity type. EXTERNAL events carry a location and need an end time. */
export const ScheduledEventEntityType = { STAGE_INSTANCE: 1, VOICE: 2, EXTERNAL: 3 } as const;

/** Only privacy level Discord accepts for guild scheduled events. */
export const SCHEDULED_EVENT_GUILD_ONLY = 2;

/** The fields we send for an EXTERNAL guild scheduled event (POST, or PATCH with a subset). */
export interface ScheduledEventData {
  name: string;
  /** ISO 8601. */
  scheduled_start_time: string;
  /** ISO 8601. Required for EXTERNAL events. */
  scheduled_end_time: string;
  description?: string | null;
  entity_metadata: { location: string };
  entity_type?: number;
  privacy_level?: number;
  status?: number;
}

/** Discord's error code when a scheduled event no longer exists (deleted in the app). */
export const UNKNOWN_SCHEDULED_EVENT = 10070;

export class DiscordRestError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Discord ${method} ${path} failed with ${status}${describe(body)}`);
    this.name = 'DiscordRestError';
  }

  /** Discord's JSON error code, when the body carried one. */
  get code(): number | undefined {
    return isRecord(this.body) && typeof this.body.code === 'number' ? this.body.code : undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function describe(body: unknown): string {
  return isRecord(body) && typeof body.message === 'string' ? `: ${body.message}` : '';
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Milliseconds a 429 asks us to wait: body `retry_after` (seconds), then the header, then 1 s. */
function retryAfterMs(res: Response, body: unknown): number {
  const fromBody = isRecord(body) ? body.retry_after : undefined;
  const seconds =
    typeof fromBody === 'number' ? fromBody : Number(res.headers.get('retry-after') ?? 1);
  return Math.max(0, Math.ceil((Number.isFinite(seconds) ? seconds : 1) * 1000));
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type DiscordRest = ReturnType<typeof createDiscordRest>;

export function createDiscordRest(options: DiscordRestOptions = {}) {
  const {
    token,
    baseUrl = DISCORD_API_BASE,
    maxRetries = 3,
    maxRetryAfterMs = 30_000,
    sleep = defaultSleep,
    userAgent = 'DiscordBot (https://github.com/vintage-guild/vintage, 0.0.0)',
  } = options;
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

  function headersFor(auth: boolean, hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = { 'User-Agent': userAgent };
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (auth) {
      if (!token) throw new Error('Discord bot token is required for this request');
      headers.Authorization = `Bot ${token}`;
    }
    return headers;
  }

  async function request<T = unknown>(
    method: string,
    path: string,
    { body, auth = true }: RequestOptions = {},
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: headersFor(auth, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    };
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(`${baseUrl}${path}`, init);
      const parsed = await readBody(res);
      if (res.ok) return parsed as T;
      const wait = res.status === 429 ? retryAfterMs(res, parsed) : Number.POSITIVE_INFINITY;
      if (attempt >= maxRetries || wait > maxRetryAfterMs) {
        throw new DiscordRestError(method, path, res.status, parsed);
      }
      await sleep(wait);
    }
  }

  const webhook = (applicationId: string, interactionToken: string) =>
    `/webhooks/${applicationId}/${interactionToken}`;

  return {
    request,

    /** Edit the deferred or immediate response to an interaction. Token is valid 15 minutes. */
    editOriginalResponse: (applicationId: string, interactionToken: string, data: MessageData) =>
      request('PATCH', `${webhook(applicationId, interactionToken)}/messages/@original`, {
        body: data,
        auth: false,
      }),

    /** Send an extra message for an interaction (within the token's 15 minutes). */
    createFollowup: (applicationId: string, interactionToken: string, data: MessageData) =>
      request('POST', webhook(applicationId, interactionToken), { body: data, auth: false }),

    /** Post a message to a channel as the bot. */
    createMessage: (channelId: string, data: MessageData) =>
      request('POST', `/channels/${channelId}/messages`, { body: data }),

    /**
     * Create an EXTERNAL guild scheduled event (shows in the server's Events list). Needs the
     * bot's CREATE_EVENTS permission (1 << 44). Discord allows 100 SCHEDULED or ACTIVE events.
     */
    createScheduledEvent: (guildId: string, data: ScheduledEventData) =>
      request<{ id: string }>('POST', `/guilds/${guildId}/scheduled-events`, {
        body: {
          entity_type: ScheduledEventEntityType.EXTERNAL,
          privacy_level: SCHEDULED_EVENT_GUILD_ONLY,
          ...data,
        },
      }),

    /** Change a scheduled event; set `status` to cancel (CANCELED) or end it. */
    editScheduledEvent: (guildId: string, eventId: string, data: Partial<ScheduledEventData>) =>
      request<{ id: string }>('PATCH', `/guilds/${guildId}/scheduled-events/${eventId}`, {
        body: data,
      }),

    /** Delete a scheduled event outright. */
    deleteScheduledEvent: (guildId: string, eventId: string) =>
      request<void>('DELETE', `/guilds/${guildId}/scheduled-events/${eventId}`),

    /**
     * Create or replace one slash command by name. Guild commands update instantly; global
     * commands can take up to an hour to appear.
     */
    upsertCommand: (applicationId: string, command: ApplicationCommand, guildId?: string) =>
      request(
        'POST',
        guildId
          ? `/applications/${applicationId}/guilds/${guildId}/commands`
          : `/applications/${applicationId}/commands`,
        { body: command },
      ),
  };
}
