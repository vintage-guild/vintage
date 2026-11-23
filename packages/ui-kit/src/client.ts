import type { CommandResult } from '@vintage/guild-kit';

/** Options for `run`: the confirm token from a destructive command's dryRun preview. */
export interface RunOptions {
  confirmToken?: string;
}

/** Stops a live query subscription (`CommandClient.watch`). */
export type Unsubscribe = () => void;

/**
 * How components reach the server's command surface. The Convex adapter maps `read` to
 * `commands.read` (one-shot query), `watch` to `commands.read` (live subscription via
 * `ConvexClient.onUpdate`), and `run` to `commands.run` (a mutation, including the dryRun →
 * confirm flow). Components never talk to Convex directly.
 */
export interface CommandClient {
  read<T = unknown>(name: string, input?: unknown): Promise<CommandResult<T>>;
  run<T = unknown>(name: string, input?: unknown, options?: RunOptions): Promise<CommandResult<T>>;
  /**
   * Subscribe to a read-only command as a live query. Delivers the initial result and every
   * subsequent update until unsubscribed. Optional so one-shot clients and test fakes only need
   * `read` and `run`.
   */
  watch?<T = unknown>(
    name: string,
    input: unknown,
    onUpdate: (result: CommandResult<T>) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe;
}

/**
 * Subscribe to a read-only command, falling back to a single `read()` when the client has no
 * `watch` method (one-shot fakes or the stub client). Unsubscribing before a fallback read
 * settles suppresses its callback.
 */
export function watchCommand<T = unknown>(
  client: CommandClient,
  name: string,
  input: unknown,
  onUpdate: (result: CommandResult<T>) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (client.watch) {
    return client.watch<T>(name, input, onUpdate, onError);
  }
  let active = true;
  void client.read<T>(name, input).then(
    (result) => {
      if (active) onUpdate(result);
    },
    (err) => {
      if (active) onError?.(err instanceof Error ? err : new Error(String(err)));
    },
  );
  return () => {
    active = false;
  };
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
