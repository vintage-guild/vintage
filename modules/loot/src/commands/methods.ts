import { error, success } from '@vintage/guild-kit';
import { DEFAULT_METHOD_ID } from '@vintage/loot-core';
import { z } from 'zod';
import { command } from '../store';
import { methodNotFound, registryOf, resolveMethod } from './helpers';

export const lootMethodsList = command({
  name: 'loot-methods-list',
  description:
    'List available loot methods and this guild’s saved config and version for each method.',
  tier: 'member',
  input: z.object({}),
  handler: async (_input, { guildId, deps }) => {
    const registry = registryOf(deps);
    const saved = await deps.loot.listMethodConfigs(guildId);
    const byId = new Map(saved.map((row) => [row.methodId, row]));
    const methods = registry.list().map((info) => {
      const row = byId.get(info.id);
      return {
        ...info,
        isDefault: info.id === DEFAULT_METHOD_ID,
        configured: row !== undefined && row.configVersion > 0,
        configVersion: row?.configVersion ?? 0,
        config: row?.config ?? info.defaultConfig,
        updatedAt: row?.updatedAt ?? null,
      };
    });
    return success(
      { defaultMethodId: DEFAULT_METHOD_ID, methods },
      { reasoning: `${methods.length} loot method${methods.length === 1 ? '' : 's'} available` },
    );
  },
});

export const lootMethodConfigure = command({
  name: 'loot-method-configure',
  description:
    'Save officer configuration for a loot method. Validates against the method’s schema and ' +
    'bumps configVersion so future awards record which rules were active.',
  tier: 'officer',
  mutation: true,
  input: z.object({
    methodId: z.string().min(1),
    config: z.record(z.string(), z.unknown()),
    resetState: z.boolean().optional(),
  }),
  handler: async ({ methodId, config, resetState }, { guildId, caller, deps, now }) => {
    const method = resolveMethod(deps, methodId);
    if (!method) return methodNotFound(methodId);

    const parsed = method.configSchema.safeParse(config);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.length ? `${issue.path.join('.')}: ` : '';
      return error('VALIDATION_ERROR', `Invalid ${method.name} config: ${path}${issue?.message}`, {
        suggestion: 'Check loot-methods-list for the method’s default config shape',
        retryable: false,
      });
    }

    const existing = await deps.loot.getMethodConfig(guildId, method.id);
    const nextVersion = (existing?.configVersion ?? 0) + 1;
    const state = !existing || resetState ? method.initialState(parsed.data) : existing.state;
    const saved = await deps.loot.upsertMethodConfig({
      guildId,
      methodId: method.id,
      methodVersion: method.version,
      configVersion: nextVersion,
      config: parsed.data,
      state,
      updatedAt: now(),
      updatedBy: caller.memberId ?? caller.discordId ?? 'system',
    });

    return success(
      { method: saved },
      { reasoning: `Saved ${method.name} config (v${saved.configVersion})` },
    );
  },
});
