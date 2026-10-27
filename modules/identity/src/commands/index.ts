import { characterAdd, characterList, characterRemove, characterUpdate } from './character';
import { guildRolesGet, guildRolesSet } from './guild-roles';
import { memberList, memberMe, memberPrefsSet, memberRefresh, memberSync } from './member';

export type { DirectoryMember, GuildDirectory, GuildDirectoryPage } from '../directory';
export { readDirectory } from '../directory';
export { type MemberSyncInput, planRoleSync } from '../domain/role-sync';
export type { IdentityDeps, IdentityStore } from '../store';

/** Every identity command, registered by apps/api through guild-kit. */
export const identityCommands = [
  memberMe,
  memberList,
  memberSync,
  memberRefresh,
  memberPrefsSet,
  characterAdd,
  characterUpdate,
  characterRemove,
  characterList,
  guildRolesGet,
  guildRolesSet,
] as const;
