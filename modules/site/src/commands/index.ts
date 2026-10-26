import { recruitingGet, recruitingSet } from './recruiting';

export type { SiteDeps, SiteStore, StoredRecruiting } from '../store';

/** Every site command, registered by apps/api through guild-kit. */
export const siteCommands = [recruitingGet, recruitingSet] as const;
