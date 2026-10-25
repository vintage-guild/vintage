import { characterAdd, characterList, characterRemove, characterUpdate } from './character';
import { memberList, memberMe, memberPrefsSet, memberSync } from './member';

export type { IdentityDeps, IdentityStore } from '../store';

/** Every identity command, registered by apps/api through guild-kit. */
export const identityCommands = [
  memberMe,
  memberList,
  memberSync,
  memberPrefsSet,
  characterAdd,
  characterUpdate,
  characterRemove,
  characterList,
] as const;
