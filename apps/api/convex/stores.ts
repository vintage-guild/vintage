// Adapters from module ports to Convex: each module's store calls its own component.
// Commands never see Convex; they get these through `deps` (PLAN §3.3).

import type { CoordinatorDeps, CoordinatorStore, TickSource } from '@vintage/coordinator/commands';
import { type CoordinatorConfig, defaultConfig } from '@vintage/coordinator/contract';
import type { IdentityDeps, IdentityStore } from '@vintage/identity/commands';
import type { Character, GuildRank, Member, RoleRankMap } from '@vintage/identity/contract';
import type { ProgressDeps, ProgressStore } from '@vintage/progress/commands';
import type { RaidsDeps, RaidsEventSink, RaidsStore } from '@vintage/raids/commands';
import type { Signup } from '@vintage/raids/contract';
import type { WowClass } from '@vintage/wow-data';
import {
  type GenericMutationCtx,
  type GenericQueryCtx,
  makeFunctionReference,
} from 'convex/server';
import { createTickSource } from '../src/tick-source';
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

const raids = components.raids;

// Like characters, signup rows store class as a plain string.
const asSignup = (row: Omit<Signup, 'class'> & { class: string }): Signup => ({
  ...row,
  class: row.class as WowClass,
});

export function raidsStore(ctx: Ctx): RaidsStore {
  return {
    listSchedules: (guildId, filter = {}) =>
      ctx.runQuery(raids.schedules.list, { guildId, ...filter }),
    getSchedule: (guildId, scheduleId) =>
      ctx.runQuery(raids.schedules.get, { guildId, scheduleId }),
    insertSchedule: (schedule) => writable(ctx).runMutation(raids.schedules.insert, schedule),
    updateSchedule: (guildId, scheduleId, patch) =>
      writable(ctx).runMutation(raids.schedules.update, { guildId, scheduleId, patch }),

    listEvents: (guildId, filter = {}) =>
      ctx.runQuery(raids.raidEvents.list, { guildId, ...filter }),
    getEvent: (guildId, eventId) => ctx.runQuery(raids.raidEvents.get, { guildId, eventId }),
    insertEvent: (event) => writable(ctx).runMutation(raids.raidEvents.insert, event),
    updateEvent: (guildId, eventId, patch) =>
      writable(ctx).runMutation(raids.raidEvents.update, { guildId, eventId, patch }),

    listSignups: async (guildId, eventId) =>
      (await ctx.runQuery(raids.signups.list, { guildId, eventId })).map(asSignup),
    getSignup: async (guildId, signupId) => {
      const row = await ctx.runQuery(raids.signups.get, { guildId, signupId });
      return row && asSignup(row);
    },
    getSignupByMember: async (guildId, eventId, memberId) => {
      const row = await ctx.runQuery(raids.signups.byMember, { guildId, eventId, memberId });
      return row && asSignup(row);
    },
    insertSignup: async (signup) =>
      asSignup(await writable(ctx).runMutation(raids.signups.insert, signup)),
    updateSignup: async (guildId, signupId, patch) =>
      asSignup(await writable(ctx).runMutation(raids.signups.update, { guildId, signupId, patch })),
    deleteSignup: async (guildId, signupId) => {
      await writable(ctx).runMutation(raids.signups.remove, { guildId, signupId });
    },
  };
}

/** Raids events go on the app's event bus table (PLAN §4.3); subscribers come later. */
function eventSink(ctx: Ctx): RaidsEventSink {
  return {
    emit: async (guildId, type, payload) => {
      await writable(ctx).db.insert('events', { guildId, type, payload, emittedAt: Date.now() });
    },
  };
}

export function raidsDeps(ctx: Ctx): RaidsDeps {
  const people = identityStore(ctx);
  return {
    raids: raidsStore(ctx),
    members: {
      getCharacter: (guildId, characterId) => people.getCharacter(guildId, characterId),
      getMember: (guildId, memberId) => people.getMember(guildId, memberId),
    },
    events: eventSink(ctx),
  };
}

const progress = components.progress;

export function progressStore(ctx: Ctx): ProgressStore {
  return {
    listKills: (guildId, filter = {}) => ctx.runQuery(progress.kills.list, { guildId, ...filter }),
    insertKill: (kill) => writable(ctx).runMutation(progress.kills.insert, kill),
  };
}

export function progressDeps(ctx: Ctx): ProgressDeps {
  return { progress: progressStore(ctx) };
}

const coordinator = components.coordinator;

export function coordinatorStore(ctx: Ctx): CoordinatorStore {
  const getConfig = async (guildId: string): Promise<CoordinatorConfig> =>
    (await ctx.runQuery(coordinator.config.get, { guildId })) ?? defaultConfig(guildId);
  return {
    getConfig,
    setConfig: async (guildId, patch, now) => {
      const { guildId: _g, updatedAt: _u, ...current } = await getConfig(guildId);
      return writable(ctx).runMutation(coordinator.config.put, {
        guildId,
        config: { ...current, ...patch },
        updatedAt: now,
      });
    },
    listActions: (guildId, filter = {}) =>
      ctx.runQuery(coordinator.actions.list, { guildId, ...filter }),
    claimAction: (key, now, staleMs) =>
      writable(ctx).runMutation(coordinator.actions.claim, { ...key, now, staleMs }),
    completeAction: (guildId, actionId, result, now) =>
      writable(ctx).runMutation(coordinator.actions.complete, {
        guildId,
        actionId,
        status: result.status,
        discordMessageId: result.discordMessageId ?? null,
        detail: result.detail ?? null,
        renderHash: result.renderHash ?? null,
        now,
      }),
    setRenderHash: async (guildId, actionId, renderHash) => {
      await writable(ctx).runMutation(coordinator.actions.setRenderHash, {
        guildId,
        actionId,
        renderHash,
      });
    },
  };
}

/** Reads raids, identity, and the action log for one tick (or coordinator-status). */
export function tickSource(ctx: Ctx): TickSource {
  return createTickSource({
    raids: raidsStore(ctx),
    identity: identityStore(ctx),
    coordinator: coordinatorStore(ctx),
  });
}

// Referenced by name to avoid a type cycle between this file and the generated api.
const tickNow = makeFunctionReference<'action', Record<string, never>>('coordinator:tick');

export function coordinatorDeps(ctx: Ctx): CoordinatorDeps {
  return {
    coordinator: coordinatorStore(ctx),
    tickSource: tickSource(ctx),
    scheduler: {
      runTickNow: async () => {
        await writable(ctx).scheduler.runAfter(0, tickNow, {});
      },
    },
  };
}
