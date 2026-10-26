import type { CommandResult } from '@vintage/guild-kit';

/** Options for `run`: the confirm token from a destructive command's dryRun preview. */
export interface RunOptions {
  confirmToken?: string;
}

/**
 * How components reach the server's command surface. The Convex adapter maps `read` to
 * `commands.read` (a reactive query) and `run` to `commands.run` (a mutation, including the
 * dryRun → confirm flow). Components never talk to Convex directly.
 */
export interface CommandClient {
  read<T = unknown>(name: string, input?: unknown): Promise<CommandResult<T>>;
  run<T = unknown>(name: string, input?: unknown, options?: RunOptions): Promise<CommandResult<T>>;
}

export const NOT_CONNECTED = 'NOT_CONNECTED';

/** A client that answers every call with NOT_CONNECTED, until the Convex adapter exists. */
export function createStubClient(): CommandClient {
  const notConnected = async <T>(name: string): Promise<CommandResult<T>> => ({
    success: false,
    error: {
      code: NOT_CONNECTED,
      message: `The website isn't connected to the guild server yet, so ${name} can't run`,
      suggestion: 'Try again once Discord sign-in is live on the website',
      retryable: false,
    },
  });
  return { read: notConnected, run: notConnected };
}

let current: CommandClient = createStubClient();

/** The client components use. */
export function getCommandClient(): CommandClient {
  return current;
}

/** Swap the client (the app at startup, or a test). Returns the previous one. */
export function setCommandClient(client: CommandClient): CommandClient {
  const previous = current;
  current = client;
  return previous;
}
