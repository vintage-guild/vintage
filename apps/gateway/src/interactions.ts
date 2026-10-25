// The Discord interactions endpoint as a web-standard handler (Request → Response), so the same
// code runs on Vercel functions and in tests. Verify first, over the raw body: Discord probes the
// URL with bad signatures and drops it unless those get a 401 (PLAN §6.2).
//
// TODO(#10): route commands through the guild-kit registry in apps/api (Convex) once the gateway
// can call it; `/vintage ping` answers locally for now.
import {
  discordTimestamp,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  importPublicKey,
  pong,
  reply,
  SIGNATURE_HEADER,
  subcommandPath,
  TIMESTAMP_HEADER,
  verifyInteraction,
} from '@vintage/discord-kit';
import { VINTAGE_COMMAND } from './commands';

export interface InteractionHandlerOptions {
  /** The application's public key (hex), from the Discord Developer Portal. */
  publicKey: string;
  now?: () => Date;
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

function route(interaction: Interaction, now: Date): InteractionResponse | undefined {
  if (interaction.type === InteractionType.PING) return pong();
  if (
    interaction.type === InteractionType.APPLICATION_COMMAND &&
    interaction.data?.name === VINTAGE_COMMAND.name
  ) {
    const [sub] = subcommandPath(interaction);
    if (sub === 'ping') return reply(`pong · ${discordTimestamp(now)}`, { ephemeral: true });
  }
  return undefined;
}

export function createInteractionHandler({
  publicKey,
  now = () => new Date(),
}: InteractionHandlerOptions) {
  // Import once per instance. A malformed key is a deployment error: answer 500, don't crash.
  const keyPromise = importPublicKey(publicKey).catch(() => undefined);

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return problem(405, 'method not allowed');
    const key = await keyPromise;
    if (!key) return problem(500, 'interactions endpoint is misconfigured');
    const body = await request.text();
    const valid = await verifyInteraction(key, {
      signature: request.headers.get(SIGNATURE_HEADER),
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      body,
    });
    if (!valid) return problem(401, 'invalid request signature');

    const interaction = parse(body);
    const response = interaction && route(interaction, now());
    return response ? json(response) : problem(400, 'unknown interaction');
  };
}
