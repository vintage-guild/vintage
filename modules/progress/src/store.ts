import { commandsFor } from '@vintage/guild-kit';
import type { Kill, RaidId } from './contract';

/**
 * The progress module's data port. Commands depend on this, not on Convex: production wires
 * it to the module's Convex component, tests use the memory store in `./testing`.
 */
export interface ProgressStore {
  /** Sorted by kill time, then record time. */
  listKills(guildId: string, filter?: { raidId?: RaidId }): Promise<Kill[]>;
  insertKill(kill: Omit<Kill, 'id'>): Promise<Kill>;
}

/** Keyed `progress` so it never collides with another module's deps in apps/api. */
export interface ProgressDeps {
  progress: ProgressStore;
}

export const command = commandsFor<ProgressDeps>();
