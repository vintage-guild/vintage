// An in-memory Vintage for development: the real command registry over every module's memory
// store, seeded through the same commands the site will call for real. Nothing here fakes a
// command's answer; swapping to Convex replaces the client, not the pages.
import type { Caller, CommandResult } from '@vintage/guild-kit';
import { createGuildRegistry, systemCaller } from '@vintage/guild-kit';
import { type IdentityDeps, identityCommands } from '@vintage/identity/commands';
import type { GuildRank, Member, RoleRankMap } from '@vintage/identity/contract';
import { createMemoryIdentityDeps } from '@vintage/identity/testing';
import { type ProgressDeps, progressCommands } from '@vintage/progress/commands';
import { createMemoryProgressStore } from '@vintage/progress/testing';
import { type RaidsDeps, raidsCommands } from '@vintage/raids/commands';
import { createMemoryRaidsStore, createRecordingEventSink } from '@vintage/raids/testing';
import type { CommandClient } from '@vintage/ui-kit';
import { FIXTURE_GUILD_ID, ROLE_IDS } from './data';

export type FixtureDeps = IdentityDeps & RaidsDeps & ProgressDeps;

export interface FixtureHost {
  guildId: string;
  deps: FixtureDeps;
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
  const deps: FixtureDeps = {
    identity,
    raids: createMemoryRaidsStore(),
    members: {
      getCharacter: (g, id) => identity.getCharacter(g, id),
      getMember: (g, id) => identity.getMember(g, id),
    },
    events: createRecordingEventSink(),
    progress: createMemoryProgressStore(),
  };
  const registry = createGuildRegistry<FixtureDeps>({
    commands: [...identityCommands, ...raidsCommands, ...progressCommands],
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
    run,
    system: systemCaller(guildId),
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
    run: (name, input, options) =>
      options?.confirmToken
        ? host.run(caller, name, input ?? {})
        : host.run(caller, name, input ?? {}),
  };
}
