// The Discord interactions endpoint as a web-standard handler (Request → Response), so the same
// code runs on Vercel functions and in tests. Verify first, over the raw body: Discord probes the
// URL with bad signatures and drops it unless those get a 401 (PLAN §6.2).
//
// Button clicks, modal submits, and the `/random` groups in FORWARDED_GROUPS are forwarded to
// Convex, which runs them through the command registry (apps/api convex/http.ts → discord.ts).
// Autocomplete for `/random character` (#149) goes the same way under a short timeout, and any
// trouble answers with no suggestions: Discord wants type 8 within 3 seconds, and an empty list
// just means the member types the value themselves (the command still checks it).
// `/random ping` answers locally. A `/random` command or click that this gateway or Convex doesn't
// know yet (say, registered before a deploy reached both) gets a private "can't do that yet"
// instead of a timeout.
import {
  autocompleteResult,
  discordTimestamp,
  type Interaction,
  type InteractionResponse,
  InteractionResponseType,
  InteractionType,
  importPublicKey,
  pong,
  reply,
  SIGNATURE_HEADER,
  subcommandPath,
  TIMESTAMP_HEADER,
  verifyInteraction,
} from '@vintage/discord-kit';
import { AUTOCOMPLETED_GROUPS, FORWARDED_GROUPS, RANDOM_COMMAND } from './commands';

/** Where verified component and modal interactions go: the Convex HTTP route and its secret. */
export interface ConvexForward {
  /** The deployment's HTTP actions URL, e.g. https://<name>.convex.site. */
  siteUrl: string;
  secret: string;
  fetch?: typeof fetch;
}

export interface InteractionHandlerOptions {
  /** The application's public key (hex), from the Discord Developer Portal. */
  publicKey: string;
  /** Forward buttons, modals, and `/random poll` here. Without it they get a "not set up yet" reply. */
  convex?: ConvexForward;
  now?: () => Date;
  /** How long autocomplete waits for Convex before answering with no suggestions. */
  autocompleteTimeoutMs?: number;
}

/** Under Discord's 3 seconds, with room for the gateway's own work and the trip back. */
export const AUTOCOMPLETE_TIMEOUT_MS = 2000;

const NO_SUGGESTIONS = autocompleteResult([]);

const TROUBLE = reply('Random could not reach its backend. Please try again in a minute.', {
  ephemeral: true,
});

const NOT_YET = reply(
  "Random can't do that yet. It may be mid-update; try again in a few minutes.",
  {
    ephemeral: true,
  },
);

const post = (convex: ConvexForward, interaction: Interaction, signal?: AbortSignal) =>
  (convex.fetch ?? fetch)(`${convex.siteUrl.replace(/\/$/, '')}/gateway/interaction`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${convex.secret}` },
    body: JSON.stringify(interaction),
    ...(signal ? { signal } : {}),
  });

/** Send a verified component or modal interaction to Convex and return its response. */
async function forward(convex: ConvexForward | undefined, interaction: Interaction) {
  if (!convex) {
    return reply('This part of Random is not set up in Discord yet.', { ephemeral: true });
  }
  try {
    const res = await post(convex, interaction);
    if (res.status === 404) return NOT_YET;
    if (!res.ok) return TROUBLE;
    return (await res.json()) as InteractionResponse;
  } catch {
    return TROUBLE;
  }
}

/**
 * Ask Convex for autocomplete suggestions, giving up after `timeoutMs`. Anything but a type 8
 * answer in time (down, slow, not deployed yet, or a wrong shape) becomes no suggestions.
 */
async function forwardAutocomplete(
  convex: ConvexForward | undefined,
  interaction: Interaction,
  timeoutMs: number,
): Promise<InteractionResponse> {
  if (!convex) return NO_SUGGESTIONS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await post(convex, interaction, controller.signal);
    if (!res.ok) return NO_SUGGESTIONS;
    const body = (await res.json()) as InteractionResponse;
    return body?.type === InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
      ? body
      : NO_SUGGESTIONS;
  } catch {
    return NO_SUGGESTIONS;
  } finally {
    clearTimeout(timer);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const problem = (status: number, error: string) => json({ error }, status);

function parse(body: string): Interaction | undefined {
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === 'object' && value !== null && 'type' in value
      ? (value as Interaction)
      : undefined;
  } catch {
    return undefined;
  }
}

async function route(
  interaction: Interaction,
  now: Date,
  convex: ConvexForward | undefined,
  autocompleteTimeoutMs: number,
): Promise<InteractionResponse | undefined> {
  if (interaction.type === InteractionType.PING) return pong();
  if (
    interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE &&
    interaction.data?.name === RANDOM_COMMAND.name
  ) {
    const [group] = subcommandPath(interaction);
    return group && AUTOCOMPLETED_GROUPS.has(group)
      ? forwardAutocomplete(convex, interaction, autocompleteTimeoutMs)
      : NO_SUGGESTIONS;
  }
  if (
    interaction.type === InteractionType.MESSAGE_COMPONENT ||
    interaction.type === InteractionType.MODAL_SUBMIT
  ) {
    return forward(convex, interaction);
  }
  if (
    interaction.type === InteractionType.APPLICATION_COMMAND &&
    interaction.data?.name === RANDOM_COMMAND.name
  ) {
    const [sub] = subcommandPath(interaction);
    if (sub === 'ping') return reply(`pong · ${discordTimestamp(now)}`, { ephemeral: true });
    if (sub && FORWARDED_GROUPS.has(sub)) return forward(convex, interaction);
    return NOT_YET;
  }
  return undefined;
}

export function createInteractionHandler({
  publicKey,
  convex,
  now = () => new Date(),
  autocompleteTimeoutMs = AUTOCOMPLETE_TIMEOUT_MS,
}: InteractionHandlerOptions) {
  // Import once per instance. A malformed key is a deployment error: answer 500, don't crash.
  const keyPromise = importPublicKey(publicKey).catch(() => undefined);

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return problem(405, 'method not allowed');
    const key = await keyPromise;
    if (!key) return problem(500, 'interactions endpoint is misconfigured');
    const body = await request.text();
    const valid = await verifyInteraction(
      key,
      {
        signature: request.headers.get(SIGNATURE_HEADER),
        timestamp: request.headers.get(TIMESTAMP_HEADER),
        body,
      },
      { now },
    );
    if (!valid) return problem(401, 'invalid request signature');

    const interaction = parse(body);
    const response =
      interaction && (await route(interaction, now(), convex, autocompleteTimeoutMs));
    return response ? json(response) : problem(400, 'unknown interaction');
  };
}
