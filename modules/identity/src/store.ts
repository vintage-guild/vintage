import { commandsFor } from '@vintage/guild-kit';
import type { Character, Member, MemberPrefs, RoleRankMap } from './contract';

/**
 * The identity module's data port. Commands depend on this, not on Convex: production
 * wires it to the module's Convex component, tests use the memory store in `./testing`.
 */
export interface IdentityStore {
  getMember(guildId: string, memberId: string): Promise<Member | null>;
  getMemberByDiscordId(guildId: string, discordId: string): Promise<Member | null>;
  listMembers(guildId: string): Promise<Member[]>;
  /** Insert or update by (guildId, discordId); keeps existing prefs. Returns the stored member. */
  upsertMember(member: Omit<Member, 'id' | 'prefs'>): Promise<Member>;
  setPrefs(guildId: string, memberId: string, prefs: MemberPrefs): Promise<Member>;

  listCharacters(guildId: string, filter?: { memberId?: string }): Promise<Character[]>;
  getCharacter(guildId: string, characterId: string): Promise<Character | null>;
  insertCharacter(character: Omit<Character, 'id'>): Promise<Character>;
  updateCharacter(
    guildId: string,
    characterId: string,
    patch: Partial<Omit<Character, 'id' | 'guildId' | 'memberId'>>,
  ): Promise<Character>;
  deleteCharacter(guildId: string, characterId: string): Promise<void>;

  /** The guild's Discord role id → guild rank map (empty until an officer sets it). */
  getRoleRankMap(guildId: string): Promise<RoleRankMap>;
  /** Replace the guild's whole role → rank map. Returns the stored map. */
  setRoleRankMap(guildId: string, map: RoleRankMap): Promise<RoleRankMap>;
}

export interface IdentityDeps {
  identity: IdentityStore;
}

export const command = commandsFor<IdentityDeps>();
