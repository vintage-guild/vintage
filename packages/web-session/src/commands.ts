// A CommandClient over Convex: `read` is the `commands:read` query, `run` the `commands:run`
// mutation. The server resolves the caller from the sign-in token, so pages never pass one.
// Structurally the same as ui-kit's CommandClient, without depending on it.
import type { CommandResult } from '@vintage/guild-kit';
import { makeFunctionReference } from 'convex/server';

export interface RunOptions {
  /** The token a destructive command's dryRun preview returned, to run it for real. */
  confirmToken?: string;
}

export interface CommandClient {
  read<T = unknown>(name: string, input?: unknown): Promise<CommandResult<T>>;
  run<T = unknown>(name: string, input?: unknown, options?: RunOptions): Promise<CommandResult<T>>;
}

type CommandArgs = { name: string; input: unknown; confirmToken?: string };

const readRef = makeFunctionReference<'query', CommandArgs, CommandResult<unknown>>(
  'commands:read',
);
const runRef = makeFunctionReference<'mutation', CommandArgs, CommandResult<unknown>>(
  'commands:run',
);

/** The slice of ConvexClient this needs, so tests can pass a fake. */
export interface ConvexCalls {
  query(ref: typeof readRef, args: CommandArgs): Promise<CommandResult<unknown>>;
  mutation(ref: typeof runRef, args: CommandArgs): Promise<CommandResult<unknown>>;
}

export function convexCommandClient(convex: ConvexCalls): CommandClient {
  return {
    async read<T>(name: string, input: unknown = {}) {
      return (await convex.query(readRef, { name, input })) as CommandResult<T>;
    },
    async run<T>(name: string, input: unknown = {}, options: RunOptions = {}) {
      const args: CommandArgs = options.confirmToken
        ? { name, input, confirmToken: options.confirmToken }
        : { name, input };
      return (await convex.mutation(runRef, args)) as CommandResult<T>;
    },
  };
}
