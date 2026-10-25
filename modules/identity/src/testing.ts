import type { Character, Member, RoleRankMap } from './contract';
import type { IdentityDeps, IdentityStore } from './store';

/** In-memory IdentityStore for tests and local agents. Same behavior contract as the Convex store. */
export function createMemoryIdentityStore(): IdentityStore & {
  members: Map<string, Member>;
  characters: Map<string, Character>;
  /** guildId → role → rank map. */
  roleRanks: Map<string, RoleRankMap>;
} {
  const members = new Map<string, Member>();
  const characters = new Map<string, Character>();
  const roleRanks = new Map<string, RoleRankMap>();
  let seq = 0;
  const id = (prefix: string) => `${prefix}_${++seq}`;
  const must = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`${what} not found`);
    return value;
  };

  return {
    members,
    characters,
    roleRanks,
    async getMember(guildId, memberId) {
      const m = members.get(memberId);
      return m && m.guildId === guildId ? m : null;
    },
    async getMemberByDiscordId(guildId, discordId) {
      return (
        [...members.values()].find((m) => m.guildId === guildId && m.discordId === discordId) ??
        null
      );
    },
    async listMembers(guildId) {
      return [...members.values()].filter((m) => m.guildId === guildId);
    },
    async upsertMember(input) {
      const existing = await this.getMemberByDiscordId(input.guildId, input.discordId);
      const member: Member = existing
        ? { ...existing, ...input }
        : { ...input, id: id('member'), prefs: { dmOptOut: false } };
      members.set(member.id, member);
      return member;
    },
    async setPrefs(guildId, memberId, prefs) {
      const member = must((await this.getMember(guildId, memberId)) ?? undefined, 'member');
      const updated = { ...member, prefs };
      members.set(memberId, updated);
      return updated;
    },
    async listCharacters(guildId, filter = {}) {
      return [...characters.values()]
        .filter(
          (c) => c.guildId === guildId && (!filter.memberId || c.memberId === filter.memberId),
        )
        .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name));
    },
    async getCharacter(guildId, characterId) {
      const c = characters.get(characterId);
      return c && c.guildId === guildId ? c : null;
    },
    async insertCharacter(input) {
      const character = { ...input, id: id('character') };
      characters.set(character.id, character);
      return character;
    },
    async updateCharacter(guildId, characterId, patch) {
      const c = must((await this.getCharacter(guildId, characterId)) ?? undefined, 'character');
      const updated = { ...c, ...patch };
      characters.set(characterId, updated);
      return updated;
    },
    async deleteCharacter(_guildId, characterId) {
      characters.delete(characterId);
    },
    async getRoleRankMap(guildId) {
      return sortedMap(roleRanks.get(guildId) ?? {});
    },
    async setRoleRankMap(guildId, map) {
      const stored = sortedMap(map);
      roleRanks.set(guildId, stored);
      return { ...stored };
    },
  };
}

/** Same ordering as the component: entries by Discord role id. */
const sortedMap = (map: RoleRankMap): RoleRankMap =>
  Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));

/**
 * Deps for identity commands backed by the memory store, optionally seeded with a role → rank
 * map for `guildId` (the test guild by default).
 */
export function createMemoryIdentityDeps(
  roleRankMap: RoleRankMap = {},
  guildId = 'guild-test', // TEST_GUILD_ID in @vintage/testing
): IdentityDeps & {
  identity: ReturnType<typeof createMemoryIdentityStore>;
} {
  const identity = createMemoryIdentityStore();
  identity.roleRanks.set(guildId, sortedMap(roleRankMap));
  return { identity };
}
