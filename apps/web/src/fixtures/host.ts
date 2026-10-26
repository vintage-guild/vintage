// An in-memory Vintage for development: the real command registry over every module's memory
// store, seeded through the same commands the site will call for real. Nothing here fakes a
// command's answer; swapping to Convex replaces the client, not the pages.
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
import {
  createMemoryPollsStore,
  createRecordingEventSink as createPollsEventSink,
} from '@vintage/polls/testing';
import { type ProgressDeps, progressCommands } from '@vintage/progress/commands';
import { createMemoryProgressStore } from '@vintage/progress/testing';
import { type RaidsDeps, raidsCommands } from '@vintage/raids/commands';
import { DEFAULT_TIMINGS } from '@vintage/raids/contract';
import { createMemoryRaidsStore, createRecordingEventSink } from '@vintage/raids/testing';
import type { CommandClient } from '@vintage/ui-kit';
import { FIXTURE_GUILD_ID, ROLE_IDS } from './data';

export type FixtureDeps = IdentityDeps & RaidsDeps & ProgressDeps & PollsDeps & CoordinatorDeps;

/** How far ahead the coordinator looks, as in apps/api. */
const LOOKAHEAD_MS = 29 * 24 * 60 * 60 * 1000;

export interface FixtureHost {
  guildId: string;
  deps: FixtureDeps;
  /** What the coordinator "sent" to Discord during seeding and after. */
  discord: ReturnType<typeof createFakeDiscord>;
  /** Run a command as `caller`; destructive commands are confirmed automatically. */
  run<T = unknown>(caller: Caller, name: string, input?: unknown): Promise<CommandResult<T>>;
  /** The caller for a synced member, with the tier identity gave them. */
  callerFor(member: Member): Caller;
  /** A member by display name, once seeded. */
  member(displayName: string): Promise<Member | null>;
  system: Caller;
}

export function createFixtureHost(guildId = FIXTURE_GUILD_ID): FixtureHost {
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

  const deps: FixtureDeps = {
    identity,
    raids,
    members: {
      getCharacter: (g, id) => identity.getCharacter(g, id),
      getMember: (g, id) => identity.getMember(g, id),
    },
    events: createRecordingEventSink(),
    progress: createMemoryProgressStore(),
    polls: createMemoryPollsStore(),
    pollMembers: {
      getMember: (g, id) => identity.getMember(g, id),
      listMembers: (g) => identity.listMembers(g),
    },
    pollEvents: createPollsEventSink(),
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
            },
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
    ],
    confirmSecret: 'development-fixtures',
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
export function createHostClient(host: FixtureHost, caller: Caller): CommandClient {
  return {
    read: (name, input) => host.run(caller, name, input ?? {}),
    run: (name, input) => host.run(caller, name, input ?? {}),
  };
}
