// Every command Vintage exposes, from every module. One list feeds every surface:
// Convex functions, /mcp, Discord, the CLI, the hosted agent, and the command manifest.

import { type AgentDeps, agentCommands } from '@vintage/agent/commands';
import { type ApplicationsDeps, applicationsCommands } from '@vintage/applications/commands';
import { type CoordinatorDeps, coordinatorCommands } from '@vintage/coordinator/commands';
import type { AnyGuildCommand } from '@vintage/guild-kit';
import { type IdentityDeps, identityCommands } from '@vintage/identity/commands';
import { type InsightsDeps, insightsCommands } from '@vintage/insights/commands';
import { type PollsDeps, pollsCommands } from '@vintage/polls/commands';
import { type ProgressDeps, progressCommands } from '@vintage/progress/commands';
import { type RaidsDeps, raidsCommands } from '@vintage/raids/commands';
import { type SiteDeps, siteCommands } from '@vintage/site/commands';

/** Union of every module's deps. Each host builds this from its own stores. */
export type VintageDeps = IdentityDeps &
  RaidsDeps &
  CoordinatorDeps &
  PollsDeps &
  ProgressDeps &
  SiteDeps &
  AgentDeps &
  ApplicationsDeps &
  InsightsDeps;

export const commands: readonly AnyGuildCommand<VintageDeps>[] = [
  ...identityCommands,
  ...raidsCommands,
  ...coordinatorCommands,
  ...pollsCommands,
  ...progressCommands,
  ...siteCommands,
  ...agentCommands,
  ...applicationsCommands,
  ...insightsCommands,
];
