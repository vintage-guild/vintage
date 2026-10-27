// Adapters from module ports to Convex: each module's store calls its own component.
// Commands never see Convex; they get these through `deps` (PLAN §3.3).

import type { AgentDeps, AgentStore } from '@vintage/agent/commands';
import {
  type AgentConfig,
  type AgentConfirmation,
  type AgentDelivery,
  type AgentRun,
  defaultAgentConfig,
} from '@vintage/agent/contract';
import type { ApplicationsDeps, ApplicationsStore } from '@vintage/applications/commands';
import {
  type Application,
  type ApplicationsConfig,
  defaultApplicationsConfig,
} from '@vintage/applications/contract';
import type { CoordinatorDeps, CoordinatorStore, TickSource } from '@vintage/coordinator/commands';
import { type CoordinatorConfig, defaultConfig } from '@vintage/coordinator/contract';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import type { IdentityDeps, IdentityStore } from '@vintage/identity/commands';
import type { Character, GuildRank, Member, RoleRankMap } from '@vintage/identity/contract';
import type { InsightsDeps, InsightsStore } from '@vintage/insights/commands';
import type { InsightFinding, InsightRun } from '@vintage/insights/contract';
import type { PollsDeps, PollsEventSink, PollsStore } from '@vintage/polls/commands';
import type { Poll } from '@vintage/polls/contract';
import type { ProgressDeps, ProgressStore } from '@vintage/progress/commands';
import type { RaidsDeps, RaidsEventSink, RaidsStore } from '@vintage/raids/commands';
import type { Signup } from '@vintage/raids/contract';
import type { SiteDeps, SiteStore } from '@vintage/site/commands';
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

/**
 * Module events go on the app's event bus table (PLAN §4.3); subscribers come later. One
 * writer serves every module's sink type, since each only narrows `type` and `payload`.
 */
function eventSink(ctx: Ctx): RaidsEventSink & PollsEventSink {
  return {
    emit: async (guildId: string, type: string, payload: unknown) => {
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

const polls = components.polls;

export function pollsStore(ctx: Ctx): PollsStore {
  return {
    listPolls: (guildId, filter = {}) => ctx.runQuery(polls.polls.list, { guildId, ...filter }),
    getPoll: (guildId, pollId) => ctx.runQuery(polls.polls.get, { guildId, pollId }),
    insertPoll: (poll) => writable(ctx).runMutation(polls.polls.insert, poll),
    updatePoll: (guildId, pollId, patch) =>
      writable(ctx).runMutation(polls.polls.update, { guildId, pollId, patch }),

    listVotes: (guildId, pollId) => ctx.runQuery(polls.votes.list, { guildId, pollId }),
    countVotes: (guildId, pollId) => ctx.runQuery(polls.votes.count, { guildId, pollId }),
    getVoteByMember: (guildId, pollId, memberId) =>
      ctx.runQuery(polls.votes.byMember, { guildId, pollId, memberId }),
    insertVote: (vote) => writable(ctx).runMutation(polls.votes.insert, vote),
    updateVote: (guildId, voteId, patch) =>
      writable(ctx).runMutation(polls.votes.update, { guildId, voteId, patch }),
    deleteVote: async (guildId, voteId) => {
      await writable(ctx).runMutation(polls.votes.remove, { guildId, voteId });
    },

    listPosts: (guildId, pollId) => ctx.runQuery(polls.posts.list, { guildId, pollId }),
    insertPost: (post) => writable(ctx).runMutation(polls.posts.insert, post),
    updatePost: (guildId, postId, patch) =>
      writable(ctx).runMutation(polls.posts.update, { guildId, postId, patch }),
  };
}

export function pollsDeps(ctx: Ctx): PollsDeps {
  const people = identityStore(ctx);
  return {
    polls: pollsStore(ctx),
    pollMembers: {
      getMember: (guildId, memberId) => people.getMember(guildId, memberId),
      listMembers: (guildId) => people.listMembers(guildId),
    },
    pollEvents: eventSink(ctx),
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

const site = components.site;

export function siteStore(ctx: Ctx): SiteStore {
  return {
    getRecruiting: (guildId) => ctx.runQuery(site.recruiting.get, { guildId }),
    putRecruiting: (record) => writable(ctx).runMutation(site.recruiting.put, record),
    getProfile: (guildId) => ctx.runQuery(site.profile.get, { guildId }),
    putProfile: (record) => writable(ctx).runMutation(site.profile.put, record),
  };
}

export function siteDeps(ctx: Ctx): SiteDeps {
  return { site: siteStore(ctx) };
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
    listRaidNights: (guildId, filter = {}) =>
      ctx.runQuery(coordinator.raidNights.list, { guildId, ...filter }),
    insertRaidNight: (raidNight) =>
      writable(ctx).runMutation(coordinator.raidNights.insert, raidNight),
    updateRaidNight: (guildId, raidNightId, patch) =>
      writable(ctx).runMutation(coordinator.raidNights.update, { guildId, raidNightId, patch }),
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
const postPoll = makeFunctionReference<'action', { pollId: string; channelId: string }>(
  'pollPosts:post',
);

/** Runs a command through the registry as a caller; commands.ts passes it in (no import cycle). */
export type RunCommand = (
  caller: Caller,
  name: string,
  input: unknown,
) => Promise<CommandResult<unknown>>;

/** Starts a coordinator tick outside the current transaction. */
export function coordinatorScheduler(ctx: Ctx): CoordinatorDeps['scheduler'] {
  return {
    runTickNow: async () => {
      await writable(ctx).scheduler.runAfter(0, tickNow, {});
    },
  };
}

/**
 * Polls as the coordinator sees them: `create` runs poll-create as the leader through the
 * registry and puts the post up; `get` reads the poll like tickSource reads raids.
 */
export function coordinatorPolls(ctx: Ctx, run: RunCommand): CoordinatorDeps['coordinatorPolls'] {
  return {
    create: async (caller, input, channelId) => {
      const result = (await run(caller, 'poll-create', input)) as CommandResult<Poll>;
      if (result.success && channelId) {
        await writable(ctx).scheduler.runAfter(0, postPoll, { pollId: result.data!.id, channelId });
      }
      return result;
    },
    get: (guildId, pollId) => pollsStore(ctx).getPoll(guildId, pollId),
  };
}

export function coordinatorDeps(ctx: Ctx, run: RunCommand): CoordinatorDeps {
  return {
    coordinator: coordinatorStore(ctx),
    tickSource: tickSource(ctx),
    scheduler: coordinatorScheduler(ctx),
    coordinatorPolls: coordinatorPolls(ctx, run),
  };
}

const agent = components.agent;

/** The agent component, mapped to the module's port. Unsaved config answers the defaults. */
export function agentStore(ctx: Ctx): AgentStore {
  return {
    getConfig: async (guildId) =>
      (await ctx.runQuery(agent.config.get, { guildId })) ?? defaultAgentConfig(guildId),
    setConfig: async (guildId, patch, now, updatedBy) => {
      const current =
        (await ctx.runQuery(agent.config.get, { guildId })) ?? defaultAgentConfig(guildId);
      const next = { ...current, ...patch, guildId, updatedAt: now, updatedBy };
      return writable(ctx).runMutation(agent.config.put, next) as Promise<AgentConfig>;
    },
    insertRun: (run) => writable(ctx).runMutation(agent.runs.insert, run) as Promise<AgentRun>,
    getRun: (guildId, runId) =>
      ctx.runQuery(agent.runs.get, { guildId, runId }) as Promise<AgentRun | null>,
    updateRun: (guildId, runId, patch) =>
      writable(ctx).runMutation(agent.runs.update, { guildId, runId, patch }) as Promise<AgentRun>,
    listRuns: (guildId, filter = {}) =>
      ctx.runQuery(agent.runs.list, { guildId, ...filter }) as Promise<AgentRun[]>,
    countRuns: (guildId, { limit: _limit, ...filter }) =>
      ctx.runQuery(agent.runs.count, { guildId, ...filter }),
    getSession: (guildId, threadKey) => ctx.runQuery(agent.sessions.get, { guildId, threadKey }),
    putSession: (record) => writable(ctx).runMutation(agent.sessions.put, record),
    deleteSession: (guildId, threadKey) =>
      writable(ctx).runMutation(agent.sessions.remove, { guildId, threadKey }),
    listIdleSessions: (guildId, before) => ctx.runQuery(agent.sessions.idle, { guildId, before }),
    insertConfirmation: (confirmation) =>
      writable(ctx).runMutation(agent.confirmations.insert, {
        ...confirmation,
        input: toJson(confirmation.input),
        preview: toJson(confirmation.preview),
        result: toJson(confirmation.result),
      }) as Promise<AgentConfirmation>,
    getConfirmation: (guildId, confirmationId) =>
      ctx.runQuery(agent.confirmations.get, {
        guildId,
        confirmationId,
      }) as Promise<AgentConfirmation | null>,
    updateConfirmation: (guildId, confirmationId, patch) =>
      writable(ctx).runMutation(agent.confirmations.update, {
        guildId,
        confirmationId,
        patch: {
          ...patch,
          ...(patch.result === undefined ? {} : { result: toJson(patch.result) }),
        },
      }) as Promise<AgentConfirmation>,
    listConfirmations: (guildId, runId) =>
      ctx.runQuery(agent.confirmations.byRun, { guildId, runId }) as Promise<AgentConfirmation[]>,
    listExpiredConfirmations: (guildId, now) =>
      ctx.runQuery(agent.confirmations.expired, { guildId, now }) as Promise<AgentConfirmation[]>,
    getUsage: (guildId, key) => ctx.runQuery(agent.usage.get, { guildId, key }),
    bumpUsage: (guildId, key) => writable(ctx).runMutation(agent.usage.bump, { guildId, key }),
    getToolResult: (guildId, runId, callId) =>
      ctx.runQuery(agent.confirmations.getToolResult, { guildId, runId, callId }),
    putToolResult: (result) => writable(ctx).runMutation(agent.confirmations.putToolResult, result),
  };
}

/** Convex values can't hold `undefined`; command results are JSON-shaped, so round-trip them. */
const toJson = (value: unknown) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

// Referenced by name to avoid a type cycle between this file and the generated api.
const answerRun = makeFunctionReference<'action', { runId: string; delivery?: AgentDelivery }>(
  'agent:answer',
);

/** Runs a command as a caller, with a confirm token for destructive ones (agent-confirm). */
export type RunConfirmedCommand = (
  caller: Caller,
  name: string,
  input: unknown,
  confirmToken?: string,
) => Promise<CommandResult<unknown>>;

/** `delivery`: where the answer goes too (the Discord interaction that asked), when there is one. */
export function agentDeps(ctx: Ctx, run: RunConfirmedCommand, delivery?: AgentDelivery): AgentDeps {
  return {
    agent: agentStore(ctx),
    agentQueue: {
      enqueue: async (_guildId, runId) => {
        await writable(ctx).scheduler.runAfter(0, answerRun, {
          runId,
          ...(delivery ? { delivery } : {}),
        });
      },
    },
    agentRunner: { run },
  };
}

const applications = components.applications;

// Component rows store class as a plain string; the module's commands only write valid classes.
const asApplication = (row: unknown) => row as Application;

export function applicationsStore(ctx: Ctx): ApplicationsStore {
  return {
    insert: async (application) =>
      asApplication(await writable(ctx).runMutation(applications.applications.insert, application)),
    get: async (guildId, applicationId) => {
      const row = await ctx.runQuery(applications.applications.get, { guildId, applicationId });
      return row && asApplication(row);
    },
    update: async (guildId, applicationId, patch) =>
      asApplication(
        await writable(ctx).runMutation(applications.applications.update, {
          guildId,
          applicationId,
          patch,
        }),
      ),
    list: async (guildId, { statuses, ...filter } = {}) =>
      (
        await ctx.runQuery(applications.applications.list, {
          guildId,
          ...filter,
          ...(statuses ? { statuses: [...statuses] } : {}),
        })
      ).map(asApplication),
    getConfig: async (guildId) =>
      ((await ctx.runQuery(applications.applications.getConfig, {
        guildId,
      })) as ApplicationsConfig | null) ?? defaultApplicationsConfig(guildId),
    setConfig: async (guildId, patch, now) => {
      const current =
        ((await ctx.runQuery(applications.applications.getConfig, {
          guildId,
        })) as ApplicationsConfig | null) ?? defaultApplicationsConfig(guildId);
      return (await writable(ctx).runMutation(applications.applications.putConfig, {
        ...current,
        ...patch,
        guildId,
        updatedAt: now,
      })) as ApplicationsConfig;
    },
  };
}

// Referenced by name to avoid a type cycle between this file and the generated api.
const applicationAction = (name: string) =>
  makeFunctionReference<'action', { applicationId: string }>(`applications:${name}`);

/** Effects run as scheduled actions: label and post, accept, reply, refresh (convex/applications.ts). */
export function applicationsDeps(ctx: Ctx): ApplicationsDeps {
  const later = (name: string) => async (_guildId: string, applicationId: string) => {
    await writable(ctx).scheduler.runAfter(0, applicationAction(name), { applicationId });
  };
  return {
    applications: applicationsStore(ctx),
    applicationEffects: {
      submitted: later('afterSubmit'),
      accepted: later('afterAccept'),
      replied: later('sendReply'),
      changed: later('refreshPost'),
    },
  };
}

const insights = components.insights;

export function insightsStore(ctx: Ctx): InsightsStore {
  return {
    insertRun: (run) =>
      writable(ctx).runMutation(insights.insights.insertRun, run) as Promise<InsightRun>,
    getRun: (guildId, runId) =>
      ctx.runQuery(insights.insights.getRun, { guildId, runId }) as Promise<InsightRun | null>,
    getRunByKey: (guildId, runKey) =>
      ctx.runQuery(insights.insights.getRunByKey, {
        guildId,
        runKey,
      }) as Promise<InsightRun | null>,
    listRuns: (guildId, limit) =>
      ctx.runQuery(insights.insights.listRuns, { guildId, limit }) as Promise<InsightRun[]>,
    markSent: (guildId, runId, at) =>
      writable(ctx).runMutation(insights.insights.markSent, {
        guildId,
        runId,
        at,
      }) as Promise<InsightRun>,
    insertFindings: async (findings) => {
      await writable(ctx).runMutation(insights.insights.insertFindings, { findings });
    },
    listFindings: (guildId, runId) =>
      ctx.runQuery(insights.insights.listFindings, { guildId, runId }) as Promise<InsightFinding[]>,
    getOptIn: (guildId, memberId) =>
      ctx.runQuery(insights.insights.getOptIn, { guildId, memberId }),
    setOptIn: (optIn) => writable(ctx).runMutation(insights.insights.setOptIn, optIn),
    listOptedIn: (guildId) => ctx.runQuery(insights.insights.listOptedIn, { guildId }),
  };
}

// Referenced by name to avoid a type cycle between this file and the generated api.
const sendInsights = makeFunctionReference<'action', { runId: string }>('insights:send');

/** Characters match identity's characters by name (Farsight strips the realm, so does Vintage). */
export function insightsDeps(ctx: Ctx): InsightsDeps {
  return {
    insights: insightsStore(ctx),
    characterOwners: {
      ownersOf: async (guildId, names) => {
        const wanted = new Set(names.map((n) => n.toLowerCase()));
        const owners = new Map<string, string>();
        for (const c of await identityStore(ctx).listCharacters(guildId)) {
          if (!wanted.has(c.name.toLowerCase())) continue;
          const name = names.find((n) => n.toLowerCase() === c.name.toLowerCase());
          if (name && !owners.has(name)) owners.set(name, c.memberId);
        }
        return owners;
      },
    },
    insightsEffects: {
      send: async (_guildId, runId) => {
        await writable(ctx).scheduler.runAfter(0, sendInsights, { runId });
      },
    },
  };
}
