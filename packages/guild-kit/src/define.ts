import type { CommandResult } from '@lushly-dev/afd-core';
import type { z } from 'zod';
import type { Caller } from './caller';
import type { Tier } from './tiers';

/** AFD naming convention: kebab-case `<noun>-<verb>`, e.g. `character-add`, `raid-create`. */
export const COMMAND_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

/** What a command handler receives besides its input. */
export interface GuildContext<Deps> {
  caller: Caller;
  guildId: string;
  /** Module ports supplied by the host (Convex stores in production, memory stores in tests). */
  deps: Deps;
  /** True during the preview step of a destructive command: describe, don't change. */
  dryRun: boolean;
  now(): number;
}

export interface GuildCommandOptions<Input extends z.ZodType, Output, Deps> {
  name: string;
  description: string;
  /** Minimum permission tier (PLAN §3.4). */
  tier: Tier;
  /** Changes data. Read-only commands may run as Convex queries. */
  mutation?: boolean;
  /** Needs the dryRun → confirmToken flow before it runs for real (PLAN §3.7). */
  destructive?: boolean;
  /**
   * Only the system caller (crons, sign-in, other server code) may run it. Every other surface
   * gets COMMAND_NOT_FOUND whatever its tier, and discovery hides it. For commands whose input
   * is trusted data from elsewhere (Discord roles), so no member can supply it.
   */
  systemOnly?: boolean;
  input: Input;
  output?: z.ZodType<Output>;
  handler: (input: z.infer<Input>, ctx: GuildContext<Deps>) => Promise<CommandResult<Output>>;
}

export interface GuildCommand<Input extends z.ZodType = z.ZodType, Output = unknown, Deps = unknown>
  extends GuildCommandOptions<Input, Output, Deps> {
  mutation: boolean;
  destructive: boolean;
  systemOnly: boolean;
}

/**
 * A command in a collection (registry, manifest). Input and output differ per command, and the
 * registry validates input at runtime, so they are erased here; `Deps` stays checked.
 */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous command lists; input is validated at runtime
export type AnyGuildCommand<Deps = any> = GuildCommand<any, any, Deps>;

/**
 * Define a Vintage command. Thin over AFD's model: Zod input, `CommandResult` output,
 * plus the tier and mutation metadata guild-kit enforces.
 */
export function defineGuildCommand<Input extends z.ZodType, Output, Deps>(
  options: GuildCommandOptions<Input, Output, Deps>,
): GuildCommand<Input, Output, Deps> {
  if (!COMMAND_NAME.test(options.name)) {
    throw new Error(`Command name "${options.name}" must be kebab-case <noun>-<verb>`);
  }
  const destructive = options.destructive ?? false;
  return {
    ...options,
    destructive,
    mutation: options.mutation ?? destructive,
    systemOnly: options.systemOnly ?? false,
  };
}

/**
 * Bind a module's deps type once: `const command = commandsFor<IdentityDeps>()`, then
 * `command({ ... })` infers input and output while `ctx.deps` is typed.
 */
export function commandsFor<Deps>() {
  return <Input extends z.ZodType, Output>(options: GuildCommandOptions<Input, Output, Deps>) =>
    defineGuildCommand<Input, Output, Deps>(options);
}
