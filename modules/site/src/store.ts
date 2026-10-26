import { commandsFor } from '@vintage/guild-kit';
import type { ClassNeed } from './contract';

/** The saved recruiting copy for one guild. */
export interface StoredRecruiting {
  guildId: string;
  headline: string;
  pitch: string;
  needs: ClassNeed[];
  updatedAt: number;
  updatedBy: string;
}

/**
 * The site module's data port. Commands depend on this, not on Convex: production wires it to
 * the module's Convex component, tests use the memory store in `./testing`.
 */
export interface SiteStore {
  /** Null until an officer saves the band for the first time. */
  getRecruiting(guildId: string): Promise<StoredRecruiting | null>;
  /** Insert or replace the guild's one recruiting record. */
  putRecruiting(record: StoredRecruiting): Promise<StoredRecruiting>;
}

/** Keyed `site` so it never collides with another module's deps in apps/api. */
export interface SiteDeps {
  site: SiteStore;
}

export const command = commandsFor<SiteDeps>();
