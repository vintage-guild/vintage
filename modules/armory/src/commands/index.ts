import { armoryLink, armoryRefresh, armoryUnlink } from './link';
import { armoryGet, armoryList } from './read';
import { armoryRecord, armorySweep } from './system';

export { type ArmoryClient, fetchArmory } from '../domain/fetch';
export type {
  ArmoryCharacter,
  ArmoryCharacters,
  ArmoryDeps,
  ArmoryEffects,
  ArmoryStore,
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
] as const;
