import { guildProfileGet, guildProfileSet } from './profile';
import { recruitingGet, recruitingSet } from './recruiting';

export type { SiteDeps, SiteStore, StoredProfile, StoredRecruiting } from '../store';

/** Every site command, registered by apps/api through guild-kit. */
export const siteCommands = [
  recruitingGet,
  recruitingSet,
  guildProfileGet,
  guildProfileSet,
] as const;
