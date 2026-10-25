// Adapters from module ports to Convex: each module's store calls its own component.
// Commands never see Convex; they get these through `deps` (PLAN §3.3).
import type { IdentityDeps, IdentityStore } from '@vintage/identity/commands';
import type { Character, GuildRank, Member, RoleRankMap } from '@vintage/identity/contract';
import type { WowClass } from '@vintage/wow-data';
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

type QueryCtx = GenericQueryCtx<DataModel>;
type MutationCtx = GenericMutationCtx<DataModel>;
type Ctx = QueryCtx | MutationCtx;

const identity = components.identity;

function writable(ctx: Ctx): MutationCtx {
  if (!('runMutation' in ctx)) {
    throw new Error(
      'This command changes data and must run through the `run` mutation, not `read`',
    );
  }
  return ctx;
}

// Component rows store class as a plain string; the module's commands only ever write valid classes.
const asCharacter = (row: Omit<Character, 'class'> & { class: string }): Character => ({
  ...row,
  class: row.class as WowClass,
});
const asMember = (row: Member): Member => row;

export function identityStore(ctx: Ctx): IdentityStore {
  return {
    getMember: async (guildId, memberId) => {
      const row = await ctx.runQuery(identity.members.get, { guildId, memberId });
      return row && asMember(row);
    },
    getMemberByDiscordId: async (guildId, discordId) => {
      const row = await ctx.runQuery(identity.members.byDiscordId, { guildId, discordId });
      return row && asMember(row);
    },
    listMembers: async (guildId) =>
      (await ctx.runQuery(identity.members.list, { guildId })).map(asMember),
    upsertMember: async (member) =>
      asMember(await writable(ctx).runMutation(identity.members.upsert, member)),
    setPrefs: async (guildId, memberId, prefs) =>
      asMember(
        await writable(ctx).runMutation(identity.members.setPrefs, { guildId, memberId, prefs }),
      ),

    listCharacters: async (guildId, filter = {}) =>
      (await ctx.runQuery(identity.characters.list, { guildId, ...filter })).map(asCharacter),
    getCharacter: async (guildId, characterId) => {
      const row = await ctx.runQuery(identity.characters.get, { guildId, characterId });
      return row && asCharacter(row);
    },
    insertCharacter: async (character) =>
      asCharacter(await writable(ctx).runMutation(identity.characters.insert, character)),
    updateCharacter: async (guildId, characterId, patch) =>
      asCharacter(
        await writable(ctx).runMutation(identity.characters.update, {
          guildId,
          characterId,
          patch,
        }),
      ),
    deleteCharacter: async (guildId, characterId) => {
      await writable(ctx).runMutation(identity.characters.remove, { guildId, characterId });
    },

    getRoleRankMap: async (guildId) =>
      asRoleRankMap(await ctx.runQuery(identity.roleRanks.list, { guildId })),
    setRoleRankMap: async (guildId, map) =>
      asRoleRankMap(
        await writable(ctx).runMutation(identity.roleRanks.replace, {
          guildId,
          entries: Object.entries(map).map(([discordRoleId, rank]) => ({ discordRoleId, rank })),
        }),
      ),
  };
}

// The component stores one row per role (Discord ids as values, not object keys).
const asRoleRankMap = (entries: { discordRoleId: string; rank: GuildRank }[]): RoleRankMap =>
  Object.fromEntries(entries.map((e) => [e.discordRoleId, e.rank]));

export function identityDeps(ctx: Ctx): IdentityDeps {
  return { identity: identityStore(ctx) };
}
