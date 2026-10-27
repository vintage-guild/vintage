// Public surface of the identity module. Other modules import only this file.

import type { Tier } from '@vintage/guild-kit';
import type { Role, WowClass } from '@vintage/wow-data';

/**
 * Guild ranks, highest first, matching the Vintage Discord roles (PLAN §3.4, Q1).
 * Rank is about standing in the guild; tier (derived from rank) is about permissions.
 * The coordinator uses rank for priority, e.g. raiders get first dibs over flex raiders.
 */
export const GUILD_RANKS = [
  'officer',
  'raid-leader',
  'raider',
  'flex-raider',
  'recruit',
  'member',
  'friend',
] as const;
export type GuildRank = (typeof GUILD_RANKS)[number];

/** The permission tier each rank grants. Friends are Discord-only, not guild members. */
export const RANK_TIER: Record<GuildRank, Tier> = {
  officer: 'officer',
  'raid-leader': 'leader',
  raider: 'raider',
  'flex-raider': 'raider',
  recruit: 'recruit',
  member: 'member',
  friend: 'public',
};

export interface Member {
  id: string;
  guildId: string;
  discordId: string;
  displayName: string;
  /** Discord role ids at the last sync. */
  roleIds: string[];
  /** Highest guild rank among the member's Discord roles; null when they have none. */
  rank: GuildRank | null;
  /** Permission tier derived from rank (`public` without one). Written only by `member-sync`. */
  tier: Tier;
  prefs: MemberPrefs;
  syncedAt: number;
  /**
   * When the member got their current rank (or lost their last one): the sync that first saw
   * it, so a new member counts from their first sync. Null when the rank last changed before
   * this was recorded (2026-10-27). Written only by `member-sync`. A recruit's trial runs
   * from here.
   */
  rankSince: number | null;
}

/** The main (`Character.isMain`) is the default character; there is no separate pref (#149). */
export interface MemberPrefs {
  dmOptOut: boolean;
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
  /**
   * True when the member picked the role (a Fury warrior who tanks); absent or false means it
   * is guessed from the spec, and a spec change re-guesses it.
   */
  rolePicked?: boolean;
  isMain: boolean;
}

/** Discord role id → guild rank. Officer-editable config (PLAN §3.4, Q1). */
export type RoleRankMap = Record<string, GuildRank>;

export const IDENTITY_COMMANDS = [
  'member-me',
  'member-list',
  'member-sync',
  'member-prefs-set',
  'character-add',
  'character-update',
  'character-remove',
  'character-list',
  'guild-roles-get',
  'guild-roles-set',
] as const;
export type IdentityCommandName = (typeof IDENTITY_COMMANDS)[number];

/** Events identity emits on the core event bus (PLAN §4.3). */
export interface IdentityEvents {
  'member-rank-changed': {
    memberId: string;
    from: GuildRank | null;
    to: GuildRank | null;
    tier: Tier;
  };
  'character-added': { memberId: string; characterId: string };
}
