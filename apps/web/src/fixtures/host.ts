// An in-memory Vintage for development: the real command registry over every module's memory
// store, seeded through the same commands the site will call for real. Nothing here fakes a
// command's answer; swapping to Convex replaces the client, not the pages.

import { type AgentDeps, agentCommands } from '@vintage/agent/commands';
import { createMemoryAgentStore } from '@vintage/agent/testing';
import { type ApplicationsDeps, applicationsCommands } from '@vintage/applications/commands';
import { createMemoryApplicationsStore } from '@vintage/applications/testing';
import {
  type CoordinatorDeps,
  coordinatorCommands,
  runTick,
  type TickSource,
} from '@vintage/coordinator/commands';
import { createFakeDiscord, createMemoryCoordinatorStore } from '@vintage/coordinator/testing';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import { createGuildRegistry, systemCaller } from '@vintage/guild-kit';
import { type IdentityDeps, identityCommands } from '@vintage/identity/commands';
import type { GuildRank, Member, RoleRankMap } from '@vintage/identity/contract';
import { createMemoryIdentityDeps } from '@vintage/identity/testing';
import { type PollsDeps, pollsCommands } from '@vintage/polls/commands';
import type { Poll } from '@vintage/polls/contract';
import {
  createMemoryPollsStore,
  createRecordingEventSink as createPollsEventSink,
} from '@vintage/polls/testing';
import { type ProgressDeps, progressCommands } from '@vintage/progress/commands';
import { createMemoryProgressStore } from '@vintage/progress/testing';
import { type RaidsDeps, raidsCommands } from '@vintage/raids/commands';
import { DEFAULT_TIMINGS } from '@vintage/raids/contract';
import {
  createMemoryRaidsLoot,
  createMemoryRaidsStore,
  createRecordingEventSink,
} from '@vintage/raids/testing';
import { type SiteDeps, siteCommands } from '@vintage/site/commands';
import { createMemorySiteStore } from '@vintage/site/testing';
import type { CommandClient } from '@vintage/ui-kit';
import { createFixtureAgent } from './agent';
import { FIXTURE_GUILD_ID, ROLE_IDS } from './data';

export type FixtureDeps = IdentityDeps &
  RaidsDeps &
  ProgressDeps &
  PollsDeps &
  CoordinatorDeps &
  SiteDeps &
  ApplicationsDeps &
  AgentDeps;

/** How far ahead the coordinator looks, as in apps/api. */
const LOOKAHEAD_MS = 29 * 24 * 60 * 60 * 1000;

export interface FixtureHost {
  guildId: string;
  deps: FixtureDeps;
  /** What the coordinator "sent" to Discord during seeding and after. */
  discord: ReturnType<typeof createFakeDiscord>;
  /** Run a command as `caller`; destructive commands are confirmed automatically (seeding). */
  run<T = unknown>(caller: Caller, name: string, input?: unknown): Promise<CommandResult<T>>;
  /**
   * Run a command as `caller` the way the server does: a destructive command without a token
   * answers with its preview and a `confirmToken`, and runs only when called again with it.
   */
  execute<T = unknown>(
    caller: Caller,
    name: string,
    input?: unknown,
    confirmToken?: string,
  ): Promise<CommandResult<T>>;
  /** The caller for a synced member, with the tier identity gave them. */
  callerFor(member: Member): Caller;
  /** A member by display name, once seeded. */
  member(displayName: string): Promise<Member | null>;
  system: Caller;
}

/**
 * `now` is the registry's clock (the real one by default); a test sets it past the raids' unlock
 * to record kills.
 */
export function createFixtureHost(
  guildId = FIXTURE_GUILD_ID,
  options: { now?: () => number } = {},
): FixtureHost {
  const roleRankMap: RoleRankMap = {};
  for (const [rank, id] of Object.entries(ROLE_IDS)) roleRankMap[id] = rank as GuildRank;
  const { identity } = createMemoryIdentityDeps(roleRankMap, guildId);
  const raids = createMemoryRaidsStore();
  const coordinator = createMemoryCoordinatorStore();
  const discord = createFakeDiscord();
  const system = systemCaller(guildId);

  /** The coordinator's read path over the memory stores, as apps/api does over Convex. */
  const tickSource: TickSource = {
    async load(g, now) {
      const events = await raids.listEvents(g, {
        from: now,
        to: now + LOOKAHEAD_MS,
        statuses: ['open', 'locked'],
      });
      const ticks = await Promise.all(
        events.map(async (event) => ({
          event,
          timings: DEFAULT_TIMINGS,
          signups: await raids.listSignups(g, event.id),
        })),
      );
      const members = (await identity.listMembers(g)).map((m) => ({
        memberId: m.id,
        discordId: m.discordId,
        displayName: m.displayName,
        rank: m.rank,
        dmOptOut: m.prefs.dmOptOut,
      }));
      return {
        guildId: g,
        config: await coordinator.getConfig(g),
        events: ticks,
        members,
        actions: await coordinator.listActions(g, { eventIds: events.map((e) => e.id) }),
      };
    },
  };

  const polls = createMemoryPollsStore();
  // Random in dev: the real agent commands and ledger, with a fake turn instead of OpenAI.
  const agent = createMemoryAgentStore();
  const fixtureAgent = createFixtureAgent<FixtureDeps>({
    store: agent,
    registry: () => registry,
    deps: () => deps,
    member: (g, id) => identity.getMember(g, id),
  });
  const deps: FixtureDeps = {
    agent,
    agentQueue: fixtureAgent,
    agentRunner: {
      run: (caller, name, input, confirmToken) =>
        registry.execute({ name, input, caller, ...(confirmToken ? { confirmToken } : {}) }, deps),
    },
    identity,
    raids,
    members: {
      getCharacter: (g, id) => identity.getCharacter(g, id),
      listCharacters: (g, memberId) => identity.listCharacters(g, { memberId }),
      getMember: (g, id) => identity.getMember(g, id),
    },
    events: createRecordingEventSink(),
    // Recorded drops stay in memory; the dev site has no loot module yet.
    raidLoot: createMemoryRaidsLoot(),
    progress: createMemoryProgressStore(),
    site: createMemorySiteStore(),
    // Applications in dev: no labeling or Discord post; the quarters' desk reads the store.
    applications: createMemoryApplicationsStore(),
    applicationEffects: {
      submitted: async () => undefined,
      accepted: async () => undefined,
      onboard: async () => undefined,
      replied: async () => undefined,
      changed: async () => undefined,
      limitReached: async () => undefined,
    },
    // Dev has no Discord server to be in: every signed-in account counts as joined.
    applicationMembers: { inServer: async () => true },
    applicationRoles: {
      recruitRoleId: async (g) =>
        Object.entries(await identity.getRoleRankMap(g)).find(([, r]) => r === 'recruit')?.[0] ??
        null,
    },
    polls,
    pollMembers: {
      getMember: (g, id) => identity.getMember(g, id),
      listMembers: (g) => identity.listMembers(g),
    },
    pollEvents: createPollsEventSink(),
    // Like apps/api: poll-create as the caller; there is no Discord post to put up here.
    coordinatorPolls: {
      create: (caller, input) => run(caller, 'poll-create', input) as Promise<CommandResult<Poll>>,
      get: (g, id) => polls.getPoll(g, id),
    },
    coordinator,
    tickSource,
    scheduler: {
      // apps/api schedules a Convex action; here the tick runs at once against the fake Discord.
      runTickNow: async (g) => {
        await runTick(
          {
            store: coordinator,
            source: tickSource,
            discord,
            raids: {
              materialize: async () => {
                await run(system, 'schedule-materialize', {});
              },
              lock: async (_g, eventId) => {
                await run(system, 'roster-lock', { eventId });
              },
              createForRaidNight: async (g, raidNightId, raid, detail) => {
                const created = await run(system, 'raid-create', raid);
                if (!created.success)
                  throw new Error(created.error?.message ?? 'raid-create failed');
                const { id } = created.data as { id: string };
                await coordinator.updateRaidNight(g, raidNightId, {
                  outcome: 'created',
                  raidEventId: id,
                  detail,
                });
                return { id };
              },
            },
            polls: { get: (g, id) => polls.getPoll(g, id) },
          },
          g,
          Date.now(),
        );
      },
    },
  };
  const registry = createGuildRegistry<FixtureDeps>({
    commands: [
      ...identityCommands,
      ...raidsCommands,
      ...progressCommands,
      ...pollsCommands,
      ...coordinatorCommands,
      ...siteCommands,
      ...applicationsCommands,
      ...agentCommands,
    ],
    confirmSecret: 'development-fixtures',
    ...(options.now ? { now: options.now } : {}),
  });

  async function run<T>(caller: Caller, name: string, input: unknown = {}) {
    const first = await registry.execute({ name, input, caller }, deps);
    const token = first.success
      ? (first.data as { confirmToken?: string } | undefined)?.confirmToken
      : undefined;
    if (!token) return first as CommandResult<T>;
    return registry.execute({ name, input, caller, confirmToken: token }, deps) as Promise<
      CommandResult<T>
    >;
  }

  return {
    guildId,
    deps,
    discord,
    run,
    execute: (caller, name, input = {}, confirmToken) =>
      registry.execute({ name, input, caller, confirmToken }, deps) as Promise<
        CommandResult<never>
      >,
    system,
    callerFor: (member) => ({
      surface: 'web',
      guildId,
      tier: member.tier,
      memberId: member.id,
      discordId: member.discordId,
    }),
    member: (displayName) =>
      identity
        .listMembers(guildId)
        .then((all) => all.find((m) => m.displayName === displayName) ?? null),
  };
}

/** A ui-kit command client that runs every call through the host as one caller. */
/**
 * The pages' client: no auto-confirm, so a destructive command shows its preview and waits for
 * the confirm token, exactly as it will against Convex.
 */
export function createHostClient(host: FixtureHost, caller: Caller): CommandClient {
  return {
    read: (name, input) => host.execute(caller, name, input ?? {}),
    run: (name, input, options) => host.execute(caller, name, input ?? {}, options?.confirmToken),
  };
}
