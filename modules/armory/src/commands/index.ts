import {
  armoryCatalogRecord,
  armoryCatalogSync,
  armoryProfessionGet,
  armoryProfessionList,
} from './catalog';
import { armoryLink, armoryRefresh, armoryUnlink } from './link';
import { armoryGet, armoryList } from './read';
import { armoryRecipeSearch } from './recipes';
import { armoryGuildRoster, armoryGuildRosterRecord, armoryGuildRosterSync } from './roster';
import { armoryRecord, armorySweep } from './system';

export { type CatalogClient, catalogProfessions, fetchCatalog } from '../domain/catalog';
export { type ArmoryClient, fetchArmory } from '../domain/fetch';
export {
  chunkBySize,
  fetchRosterEntry,
  type RosterClient,
  serializedBytes,
  toRosterMembers,
} from '../domain/roster';
export type {
  ArmoryCharacter,
  ArmoryCharacters,
  ArmoryDeps,
  ArmoryEffects,
  ArmoryStore,
  CatalogEffects,
  CatalogStore,
  RosterEffects,
  RosterStore,
} from '../store';

/** Every armory command, registered by apps/api through guild-kit. */
export const armoryCommands = [
  armoryLink,
  armoryUnlink,
  armoryRefresh,
  armoryGet,
  armoryList,
  armorySweep,
  armoryRecord,
  armoryGuildRoster,
  armoryGuildRosterSync,
  armoryGuildRosterRecord,
  armoryRecipeSearch,
  armoryCatalogSync,
  armoryCatalogRecord,
  armoryProfessionList,
  armoryProfessionGet,
] as const;
