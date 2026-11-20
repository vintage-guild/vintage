import {
  armoryCatalogRecord,
  armoryCatalogSync,
  armoryProfessionGet,
  armoryProfessionList,
} from './catalog';
import { armoryLink, armoryRefresh, armoryUnlink } from './link';
import { armoryGet, armoryList } from './read';
import {
  armoryCharacterRecipes,
  armoryRecipeDetailRecord,
  armoryRecipeGet,
} from './recipe-details';
import { armoryRecipeSearch } from './recipes';
import {
  armoryGuildRoster,
  armoryGuildRosterRecord,
  armoryGuildRosterRoleSet,
  armoryGuildRosterSync,
} from './roster';
import { armoryRecord, armorySweep } from './system';

export { type CatalogClient, catalogProfessions, fetchCatalog } from '../domain/catalog';
export { type ArmoryClient, fetchArmory } from '../domain/fetch';
export {
  fetchRecipeDetail,
  itemLines,
  type RecipeClient,
  type RecipeDetailFetch,
  toRecipeDetail,
} from '../domain/recipe';
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
  armoryGuildRosterRoleSet,
  armoryRecipeSearch,
  armoryCatalogSync,
  armoryCatalogRecord,
  armoryProfessionList,
  armoryProfessionGet,
  armoryRecipeDetailRecord,
  armoryRecipeGet,
  armoryCharacterRecipes,
] as const;
