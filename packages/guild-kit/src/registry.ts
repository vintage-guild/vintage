import { type CommandResult, error, success } from '@lushly-dev/afd-core';
import type { Caller } from './caller';
import { hashInput, issueConfirmToken, verifyConfirmToken } from './confirm';
import type { AnyGuildCommand, GuildContext } from './define';
import { tierAllows } from './tiers';

export interface ExecuteRequest {
  name: string;
  input: unknown;
  caller: Caller;
  /** Required to run a destructive command for real; returned by its dryRun preview. */
  confirmToken?: string;
}

export interface ConfirmPreview<T> {
  preview: T;
  confirmToken: string;
  expiresInMs: number;
}

export interface GuildRegistryOptions<Deps> {
  commands: readonly AnyGuildCommand<Deps>[];
  /** HMAC secret for confirm tokens (an env var in each host). */
  confirmSecret: string;
  now?: () => number;
}

export interface GuildRegistry<Deps> {
  list(): readonly AnyGuildCommand<Deps>[];
  get(name: string): AnyGuildCommand<Deps> | undefined;
  /** Commands the caller is allowed to run, for discovery surfaces (afd-discover, docs). */
  visibleTo(caller: Caller): readonly AnyGuildCommand<Deps>[];
  execute(request: ExecuteRequest, deps: Deps): Promise<CommandResult<unknown>>;
}

function subjectOf(caller: Caller): string {
  return caller.memberId ?? caller.discordId ?? `${caller.surface}:${caller.tier}`;
}

/**
 * The single execution path every surface uses: lookup → permission → validation →
 * (dryRun/confirm for destructive commands) → handler.
 */
export function createGuildRegistry<Deps>(
  options: GuildRegistryOptions<Deps>,
): GuildRegistry<Deps> {
  const commands = options.commands;
  const now = options.now ?? Date.now;
  const byName = new Map<string, AnyGuildCommand<Deps>>();
  for (const command of commands) {
    if (byName.has(command.name)) throw new Error(`Duplicate command name "${command.name}"`);
    byName.set(command.name, command);
  }

  return {
    list: () => [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    get: (name) => byName.get(name),
    visibleTo: (caller) =>
      [...byName.values()]
        .filter((c) => tierAllows(caller.tier, c.tier))
        .sort((a, b) => a.name.localeCompare(b.name)),

    async execute({ name, input, caller, confirmToken }, deps) {
      const command = byName.get(name);
      if (!command || !tierAllows(caller.tier, command.tier)) {
        // Same answer for unknown and forbidden, so the surface doesn't reveal private commands (AFD D4).
        return error('COMMAND_NOT_FOUND', `No command named "${name}" is available to you`, {
          suggestion: 'Use afd-discover to list the commands you can run',
          retryable: false,
        });
      }

      const parsed = command.input.safeParse(input);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', `Invalid input for ${name}`, {
          suggestion: 'Check the input against the command schema (afd-detail)',
          retryable: false,
          details: { issues: parsed.error.issues },
        });
      }

      const context = (dryRun: boolean): GuildContext<Deps> => ({
        caller,
        guildId: caller.guildId,
        deps,
        dryRun,
        now,
      });

      if (!command.destructive) return command.handler(parsed.data, context(false));

      const claims = {
        command: name,
        inputHash: await hashInput(parsed.data),
        subject: subjectOf(caller),
      };
      if (!confirmToken) {
        const preview = await command.handler(parsed.data, context(true));
        if (!preview.success) return preview;
        const token = await issueConfirmToken(options.confirmSecret, claims, now());
        return success<ConfirmPreview<unknown>>(
          { preview: preview.data, confirmToken: token, expiresInMs: 5 * 60 * 1000 },
          {
            reasoning: `${name} changes data. Review the preview, then call again with confirmToken.`,
          },
        );
      }

      const check = await verifyConfirmToken(options.confirmSecret, confirmToken, claims, now());
      if (!check.ok) {
        return error('CONFIRMATION_INVALID', `Confirmation token ${check.reason}`, {
          suggestion: 'Run the command again without confirmToken to get a fresh preview',
          retryable: true,
        });
      }
      return command.handler(parsed.data, context(false));
    },
  };
}
