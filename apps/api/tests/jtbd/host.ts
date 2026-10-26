// An in-memory Vintage for JTBD scenarios: every module's memory store, the real command registry,
// the real coordinator tick, and a fake Discord that records what the bot sends. Callers are
// resolved from synced members the way commands.ts does it, so tiers come from Discord roles.
import { runTick } from '@vintage/coordinator/commands';
import { createFakeDiscord, createMemoryCoordinatorStore } from '@vintage/coordinator/testing';
import { type Interaction, InteractionType } from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import { systemCaller } from '@vintage/guild-kit';
import { createMemoryIdentityDeps } from '@vintage/identity/testing';
import { createMemoryProgressStore } from '@vintage/progress/testing';
import type { Signup } from '@vintage/raids/contract';
import { createMemoryRaidsStore, createRecordingEventSink } from '@vintage/raids/testing';
import { fixedClock, testRegistry } from '@vintage/testing';
import { handleSignupInteraction } from '../../src/discord-signups';
import { commands, type VintageDeps } from '../../src/registry';
import { createTickSource } from '../../src/tick-source';

export const GUILD = 'guild-test';

/** Discord role ids for the test guild, mirroring the real rank roles. */
export const ROLES = {
  officer: '300000000000000001',
  raidLeader: '300000000000000002',
  raider: '300000000000000003',
  flexRaider: '300000000000000004',
  recruit: '300000000000000005',
  member: '300000000000000006',
  friend: '300000000000000007',
} as const;

/** The guild's Discord server id; interactions from elsewhere are refused. */
export const DISCORD_GUILD = '600000000000000001';
export const SIGNUP_CHANNEL = '400000000000000001';
export const OPS_CHANNEL = '400000000000000002';

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export function createHost(start = Date.UTC(2026, 9, 26, 16)) {
  const clock = fixedClock(start); // Mon 26 Oct 2026, 12:00 New York
  const { identity } = createMemoryIdentityDeps(
    {
      [ROLES.officer]: 'officer',
      [ROLES.raidLeader]: 'raid-leader',
      [ROLES.raider]: 'raider',
      [ROLES.flexRaider]: 'flex-raider',
      [ROLES.recruit]: 'recruit',
      [ROLES.member]: 'member',
      [ROLES.friend]: 'friend',
    },
    GUILD,
  );
  const raids = createMemoryRaidsStore();
  const events = createRecordingEventSink();
  const coordinator = createMemoryCoordinatorStore();
  const tickSource = createTickSource({ raids, identity, coordinator });
  const ticksRequested: string[] = [];
  const deps: VintageDeps = {
    identity,
    raids,
    members: {
      getCharacter: (g, id) => identity.getCharacter(g, id),
      getMember: (g, id) => identity.getMember(g, id),
    },
    events,
    coordinator,
    tickSource,
    scheduler: { runTickNow: async (g) => void ticksRequested.push(g) },
    progress: createMemoryProgressStore(),
  };
  const registry = testRegistry<VintageDeps>(commands, clock);
  const discord = createFakeDiscord();
  const system = systemCaller(GUILD);

  /** Run a command; destructive ones go through preview and confirm like a careful agent would. */
  async function run(caller: Caller, name: string, input: unknown = {}) {
    const first = await registry.execute({ name, input, caller }, deps);
    const token = first.success
      ? (first.data as { confirmToken?: string } | undefined)?.confirmToken
      : undefined;
    if (!token) return first;
    return registry.execute({ name, input, caller, confirmToken: token }, deps);
  }

  /** Run a command and return its data, failing loudly with the error otherwise. */
  async function ok<T = unknown>(caller: Caller, name: string, input: unknown = {}): Promise<T> {
    const result = await run(caller, name, input);
    if (!result.success) throw new Error(`${name} failed: ${JSON.stringify(result.error)}`);
    return result.data as T;
  }

  /** A Discord user joins (or changes roles); member-sync runs as the role-sync cron would. */
  async function discordMember(discordId: string, displayName: string, roleIds: string[]) {
    await ok(system, 'member-sync', { discordId, displayName, inServer: true, roleIds });
    return as(discordId);
  }

  /** The caller for a signed-in Discord user, resolved like commands.ts resolveCaller. */
  async function as(discordId: string): Promise<Caller> {
    const m = await identity.getMemberByDiscordId(GUILD, discordId);
    if (!m) return { surface: 'web', guildId: GUILD, tier: 'public', discordId };
    return { surface: 'web', guildId: GUILD, tier: m.tier, memberId: m.id, discordId };
  }

  /** One coordinator tick, wired like convex/coordinator.ts but against memory and fake Discord. */
  function tick() {
    return runTick(
      {
        store: coordinator,
        source: tickSource,
        raids: {
          materialize: async () => {
            await ok(system, 'schedule-materialize');
          },
          lock: async (_g, eventId) => {
            await ok(system, 'roster-lock', { eventId });
          },
        },
        discord,
      },
      GUILD,
      clock.now(),
    );
  }

  /** Point the coordinator at the test channels, as an officer would once. */
  async function configureCoordinator(input: Record<string, unknown> = {}) {
    await ok(system, 'coordinator-config-set', {
      signupChannelId: SIGNUP_CHANNEL,
      opsChannelId: OPS_CHANNEL,
      ...input,
    });
  }

  /** Messages the bot sent to a channel or user, newest last. */
  const sentTo = (to: string) => discord.sent.filter((m) => m.to === to && m.kind !== 'edit');
  const editsTo = (to: string) => discord.sent.filter((m) => m.to === to && m.kind === 'edit');

  /**
   * A Discord interaction from a member, run through the same signup flow Convex runs
   * (src/discord-signups.ts) over these stores and the registry.
   */
  function interact(
    discordId: string,
    data: Interaction['data'],
    type: Interaction['type'] = InteractionType.MESSAGE_COMPONENT,
    guildId: string = DISCORD_GUILD,
  ) {
    const interaction: Interaction = {
      id: 'i',
      application_id: 'app',
      token: 'token',
      type,
      guild_id: guildId,
      member: { user: { id: discordId, username: discordId }, roles: [] },
      data,
    };
    return handleSignupInteraction(interaction, {
      discordGuildId: DISCORD_GUILD,
      guildId: GUILD,
      memberByDiscordId: (id) => identity.getMemberByDiscordId(GUILD, id),
      characters: (memberId) => identity.listCharacters(GUILD, { memberId }),
      event: (eventId) => raids.getEvent(GUILD, eventId),
      signup: (eventId, memberId) => raids.getSignupByMember(GUILD, eventId, memberId),
      signupSet: (caller, input) =>
        registry.execute({ name: 'signup-set', input, caller }, deps) as Promise<
          CommandResult<Signup>
        >,
      afterChange: () => deps.scheduler.runTickNow(GUILD),
    });
  }

  /** Clicking a signup button, picking from the character menu, or submitting the reason form. */
  const discordUi = {
    click: (discordId: string, customId: string) =>
      interact(discordId, { custom_id: customId, component_type: 2 }),
    pick: (discordId: string, customId: string, value: string) =>
      interact(discordId, { custom_id: customId, component_type: 3, values: [value] }),
    submit: (discordId: string, customId: string, note: string) =>
      interact(
        discordId,
        {
          custom_id: customId,
          components: [{ type: 1, components: [{ type: 4, custom_id: 'note', value: note }] }],
        },
        InteractionType.MODAL_SUBMIT,
      ),
    clickFromServer: (discordId: string, customId: string, guildId: string) =>
      interact(
        discordId,
        { custom_id: customId, component_type: 2 },
        InteractionType.MESSAGE_COMPONENT,
        guildId,
      ),
  };

  return {
    discordUi,
    clock,
    deps,
    discord,
    events,
    system,
    ticksRequested,
    run,
    ok,
    as,
    discordMember,
    tick,
    configureCoordinator,
    sentTo,
    editsTo,
  };
}

export type Host = ReturnType<typeof createHost>;
