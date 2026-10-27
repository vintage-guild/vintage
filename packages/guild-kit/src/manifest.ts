import { z } from 'zod';
import type { AnyGuildCommand } from './define';

export interface ManifestEntry {
  name: string;
  description: string;
  tier: string;
  mutation: boolean;
  destructive: boolean;
  /** Present (true) only for commands just the system caller may run. */
  systemOnly?: true;
  input: unknown;
  output?: unknown;
}

export interface CommandManifest {
  schemaVersion: 1;
  commands: ManifestEntry[];
}

/**
 * The public command contract (PLAN §3.3). CI diffs this file on every PR; a breaking
 * change to a name, tier, or schema needs the `breaking-contract` label.
 */
export function toManifest(commands: readonly AnyGuildCommand[]): CommandManifest {
  return {
    schemaVersion: 1,
    commands: [...commands]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        name: c.name,
        description: c.description,
        tier: c.tier,
        mutation: c.mutation,
        destructive: c.destructive,
        ...(c.systemOnly ? { systemOnly: true as const } : {}),
        input: z.toJSONSchema(c.input, { io: 'input' }),
        ...(c.output ? { output: z.toJSONSchema(c.output, { io: 'output' }) } : {}),
      })),
  };
}
