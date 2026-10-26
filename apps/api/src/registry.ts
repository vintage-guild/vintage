// Every command Vintage exposes, from every module. One list feeds every surface:
// Convex functions, /mcp, Discord, the CLI, the hosted agent, and the command manifest.

import { type CoordinatorDeps, coordinatorCommands } from '@vintage/coordinator/commands';
import type { AnyGuildCommand } from '@vintage/guild-kit';
import { type IdentityDeps, identityCommands } from '@vintage/identity/commands';
import { type PollsDeps, pollsCommands } from '@vintage/polls/commands';
import { type RaidsDeps, raidsCommands } from '@vintage/raids/commands';

/** Union of every module's deps. Each host builds this from its own stores. */
export type VintageDeps = IdentityDeps & RaidsDeps & CoordinatorDeps & PollsDeps;

export const commands: readonly AnyGuildCommand<VintageDeps>[] = [
  ...identityCommands,
  ...raidsCommands,
  ...coordinatorCommands,
  ...pollsCommands,
];
