import { armoryLink, armoryRefresh, armoryUnlink } from './link';
import { armoryGet, armoryList } from './read';
import { armoryGuildRoster, armoryGuildRosterRecord, armoryGuildRosterSync } from './roster';
import { armoryRecord, armorySweep } from './system';

export { type ArmoryClient, fetchArmory } from '../domain/fetch';
export { fetchRosterEntry, type RosterClient, toRosterMembers } from '../domain/roster';
export type {
  ArmoryCharacter,
  ArmoryCharacters,
  ArmoryDeps,
  ArmoryEffects,
  ArmoryStore,
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
] as const;
