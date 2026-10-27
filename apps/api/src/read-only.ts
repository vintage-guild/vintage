// `commands.read` runs as a reactive query, so it can't run a mutation. Telling the caller to use
// `commands.run` instead would reveal that the command exists, so that answer is only for a
// caller who may run it; anyone else gets the registry's usual COMMAND_NOT_FOUND (AFD D4).
import { type Caller, type CommandResult, error, type GuildRegistry } from '@vintage/guild-kit';

/** The USE_RUN refusal for a mutation sent to `read`, or null to let the registry answer. */
export function refuseMutationInRead<Deps>(
  registry: GuildRegistry<Deps>,
  caller: Caller,
  name: string,
): CommandResult<never> | null {
  const command = registry.visibleTo(caller).find((c) => c.name === name);
  if (!command?.mutation) return null;
  return error('USE_RUN', `${name} changes data; call commands.run instead`, { retryable: false });
}
