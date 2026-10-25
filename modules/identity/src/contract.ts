// Public surface of the identity module. Other modules import only this file.

import type { Tier } from '@vintage/guild-kit';
import type { Role, WowClass } from '@vintage/wow-data';

export interface Member {
  id: string;
  guildId: string;
  discordId: string;
  displayName: string;
  /** Discord role ids at the last sync. */
  roleIds: string[];
  tier: Tier;
  prefs: MemberPrefs;
  syncedAt: number;
}

export interface MemberPrefs {
  dmOptOut: boolean;
  defaultCharacterId?: string;
  timezone?: string;
}

export interface Character {
  id: string;
  guildId: string;
  memberId: string;
  name: string;
  class: WowClass;
  spec: string;
  role: Role;
  isMain: boolean;
}

/** Discord role id → tier. Officer-editable config (PLAN §3.4, Q1). */
export type RoleTierMap = Record<string, Tier>;

export const IDENTITY_COMMANDS = [
  'member-me',
  'member-list',
  'member-sync',
  'member-prefs-set',
  'character-add',
  'character-update',
  'character-remove',
  'character-list',
] as const;
export type IdentityCommandName = (typeof IDENTITY_COMMANDS)[number];

/** Events identity emits on the core event bus (PLAN §4.3). */
export interface IdentityEvents {
  'member-tier-changed': { memberId: string; from: Tier; to: Tier };
  'character-added': { memberId: string; characterId: string };
}
