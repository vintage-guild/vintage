// An in-memory Vintage for JTBD scenarios: every module's memory store, the real command registry,
// the real coordinator tick, and a fake Discord that records what the bot sends. Callers are
// resolved from synced members the way commands.ts does it, so tiers come from Discord roles.
import { recordToolCall, renderAgentReply } from '@vintage/agent/commands';
import { type AgentDelivery, isAgentCommand, toConfirmationView } from '@vintage/agent/contract';
import { createMemoryAgentStore } from '@vintage/agent/testing';
import { createRegistryTools } from '@vintage/agent-runtime';
import { renderOnboardingDm } from '@vintage/applications/commands';
import { createMemoryApplicationsStore } from '@vintage/applications/testing';
import { runTick } from '@vintage/coordinator/commands';
import { createFakeDiscord, createMemoryCoordinatorStore } from '@vintage/coordinator/testing';
import type { DecisionsPort } from '@vintage/decisions';
import {
  type CommandInteractionOption,
  type Interaction,
  InteractionType,
  type LayoutComponent,
  layoutText,
  type MessageData,
} from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import { systemCaller } from '@vintage/guild-kit';
import { createMemoryIdentityDeps } from '@vintage/identity/testing';
import { createMemoryInsightsStore } from '@vintage/insights/testing';
import { buildPollCard, renderPollPost } from '@vintage/polls/commands';
import type { Poll } from '@vintage/polls/contract';
import {
  createMemoryPollsStore,
  createRecordingEventSink as createPollEventSink,
} from '@vintage/polls/testing';
import { createMemoryProgressStore } from '@vintage/progress/testing';
import type { Signup, SignupGuess } from '@vintage/raids/contract';
import { createMemoryRaidsStore, createRecordingEventSink } from '@vintage/raids/testing';
import { STARTER_RECRUITING } from '@vintage/site/contract';
import { createMemorySiteStore } from '@vintage/site/testing';
import { fixedClock, testRegistry } from '@vintage/testing';
import { handleAgentInteraction } from '../../src/discord-agent';
import { handleApplicationInteraction } from '../../src/discord-applications';
import { handleEventInteraction } from '../../src/discord-events';
import { handleHelpInteraction } from '../../src/discord-help';
import { handlePollInteraction } from '../../src/discord-polls';
import { handleSignupInteraction } from '../../src/discord-signups';
import { onboardAfterSync, onboardIfPromoted } from '../../src/onboarding';
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
export const POLL_CHANNEL = '400000000000000003';
export const SITE_URL = 'https://vintageguild.gg';

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
  const polls = createMemoryPollsStore();
  const pollEvents = createPollEventSink();
  const tickSource = createTickSource({ raids, identity, coordinator });
  const ticksRequested: string[] = [];
  const siteStore = createMemorySiteStore();
  /** Rewording for the weekly assessment; null keeps the facts (like a deployment with no key). */
  let wording: string | null = null;
  const applicationsStore = createMemoryApplicationsStore();
  /** Runs whose insights an officer sent (the DMs themselves need Discord). */
  const insightsSent: string[] = [];
  /** Application effects the commands scheduled (label and post, accept, onboard, reply, refresh). */
  const applicationEffects: { effect: string; id: string }[] = [];
  /** Questions agent-ask queued, with where the answer goes (as the Convex action receives them). */
  const queued: { runId: string; delivery: AgentDelivery | undefined }[] = [];
  let pendingDelivery: AgentDelivery | undefined;
  /** Decisions for the tick's digest; null keeps notes raw, like a deployment without a key. */
  let decisions: DecisionsPort | null = null;
  const deps: VintageDeps = {
    identity,
    raids,
    members: {
      getCharacter: (g, id) => identity.getCharacter(g, id),
      listCharacters: (g, memberId) => identity.listCharacters(g, { memberId }),
      getMember: (g, id) => identity.getMember(g, id),
    },
    events,
    coordinator,
    tickSource,
    scheduler: { runTickNow: async (g) => void ticksRequested.push(g) },
    polls,
    pollMembers: {
      getMember: (g, id) => identity.getMember(g, id),
      listMembers: (g) => identity.listMembers(g),
    },
    pollEvents,
    coordinatorPolls: {
      // Like apps/api coordinatorPolls: poll-create as the leader, then the post goes up.
      create: async (caller, input, channelId) => {
        const result = (await registry.execute(
          { name: 'poll-create', input, caller },
          deps,
        )) as CommandResult<Poll>;
        if (result.success && channelId) await postPoll(result.data!.id, channelId);
        return result;
      },
      get: (g, id) => polls.getPoll(g, id),
    },
    progress: createMemoryProgressStore(),
    site: siteStore,
    insights: createMemoryInsightsStore(),
    characterOwners: {
      ownersOf: async (g, names) => {
        const owners = new Map<string, string>();
        for (const c of await identity.listCharacters(g)) {
          const name = names.find((n) => n.toLowerCase() === c.name.toLowerCase());
          if (name && !owners.has(name)) owners.set(name, c.memberId);
        }
        return owners;
      },
    },
    insightsEffects: { send: async (_g, runId) => void insightsSent.push(runId) },
    applications: applicationsStore,
    applicationEffects: {
      submitted: async (_g, id) => void applicationEffects.push({ effect: 'submitted', id }),
      // Like convex/applications.ts: onboard at once if they already hold the role.
      accepted: async (_g, id) => {
        applicationEffects.push({ effect: 'accepted', id });
        const app = await applicationsStore.get(GUILD, id);
        const member = app ? await identity.getMemberByDiscordId(GUILD, app.discordId) : null;
        await onboardIfPromoted(member, (name, input) => run(system, name, input));
      },
      // Like sendOnboarding: the guild's note, DMed through the (fake) bot.
      onboard: async (_g, id) => {
        applicationEffects.push({ effect: 'onboard', id });
        const app = await applicationsStore.get(GUILD, id);
        const config = await applicationsStore.getConfig(GUILD);
        if (app) await discord.dm(app.discordId, renderOnboardingDm(config.onboarding, SITE_URL));
      },
      replied: async (_g, id) => void applicationEffects.push({ effect: 'replied', id }),
      changed: async (_g, id) => void applicationEffects.push({ effect: 'changed', id }),
    },
    applicationRoles: {
      recruitRoleId: async (g) =>
        Object.entries(await identity.getRoleRankMap(g)).find(([, r]) => r === 'recruit')?.[0] ??
        null,
    },
    agent: createMemoryAgentStore(),
    // The turn itself needs OpenAI; agentUi.answer stands in for it (it calls the same tools).
    agentQueue: {
      enqueue: async (_g, runId) => {
        queued.push({ runId, delivery: pendingDelivery });
      },
    },
    agentRunner: {
      run: (caller, name, input, confirmToken) =>
        registry.execute({ name, input, caller, ...(confirmToken ? { confirmToken } : {}) }, deps),
    },
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

  /** A destructive command's preview only: what the caller sees before Confirm. */
  async function preview<T = unknown>(caller: Caller, name: string, input: unknown = {}) {
    const result = await registry.execute({ name, input, caller }, deps);
    if (!result.success) throw new Error(`${name} failed: ${JSON.stringify(result.error)}`);
    return (result.data as { preview: T }).preview;
  }

  /** Run a command and return its data, failing loudly with the error otherwise. */
  async function ok<T = unknown>(caller: Caller, name: string, input: unknown = {}): Promise<T> {
    const result = await run(caller, name, input);
    if (!result.success) throw new Error(`${name} failed: ${JSON.stringify(result.error)}`);
    return result.data as T;
  }

  /**
   * A Discord user joins (or changes roles); member-sync runs as the role-sync cron would, then
   * onboarding if that promoted an accepted applicant (convex/commands.ts).
   */
  async function discordMember(discordId: string, displayName: string, roleIds: string[]) {
    const input = { discordId, displayName, inServer: true, roleIds };
    const synced = await run(system, 'member-sync', input);
    if (!synced.success) throw new Error(`member-sync failed: ${JSON.stringify(synced.error)}`);
    await onboardAfterSync(synced, (name, onboardInput) => run(system, name, onboardInput));
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
          createForRaidNight: async (g, raidNightId, raid, detail) => {
            const created = await ok<{ id: string }>(system, 'raid-create', raid);
            await coordinator.updateRaidNight(g, raidNightId, {
              outcome: 'created',
              raidEventId: created.id,
              detail,
            });
            return { id: created.id };
          },
        },
        discord,
        polls: { get: (g, id) => polls.getPoll(g, id) },
        decisions,
        links: { discordGuildId: DISCORD_GUILD, siteUrl: null },
        recruiting: {
          needs: async (g) => (await siteStore.getRecruiting(g))?.needs ?? STARTER_RECRUITING.needs,
        },
        wording: { write: async () => wording },
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
      signups: (eventId) => raids.listSignups(GUILD, eventId),
      signupSuggest: (caller, input) =>
        registry.execute({ name: 'signup-suggest', input, caller }, deps) as Promise<
          CommandResult<SignupGuess | null>
        >,
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

  /**
   * Poll posts as members see them, by poll id: rendered the way Convex's pollPosts does when
   * the poll flow asks to post or refresh (src/discord-polls.ts).
   */
  const pollPosts = new Map<string, { channelId: string; message: MessageData }>();
  async function renderPost(pollId: string) {
    const poll = await polls.getPoll(GUILD, pollId);
    if (!poll) return null;
    const card = buildPollCard(
      poll,
      await polls.listVotes(GUILD, pollId),
      await identity.listMembers(GUILD),
      null,
    );
    return renderPollPost(card);
  }

  async function postPoll(pollId: string, channelId: string) {
    const message = await renderPost(pollId);
    if (message) pollPosts.set(pollId, { channelId, message });
  }

  function pollInteract(discordId: string, interaction: Partial<Interaction>) {
    return handlePollInteraction(
      {
        id: 'i',
        application_id: 'app',
        token: 'token',
        type: InteractionType.MESSAGE_COMPONENT,
        guild_id: DISCORD_GUILD,
        channel_id: POLL_CHANNEL,
        member: { user: { id: discordId, username: discordId }, roles: [] },
        ...interaction,
      },
      {
        discordGuildId: DISCORD_GUILD,
        guildId: GUILD,
        memberByDiscordId: (id) => identity.getMemberByDiscordId(GUILD, id),
        run: (caller, name, input, confirmToken) =>
          registry.execute(
            { name, input, caller, ...(confirmToken ? { confirmToken } : {}) },
            deps,
          ),
        post: postPoll,
        refresh: async (pollId) => {
          const posted = pollPosts.get(pollId);
          const message = await renderPost(pollId);
          if (posted && message) pollPosts.set(pollId, { ...posted, message });
        },
        now: clock.now,
      },
    );
  }

  /** `/random poll create`, and clicks or picks on a poll post or its private replies. */

  /** The member's caller for a Discord interaction, resolved like convex/discord.ts. */
  const memberByDiscordId = (discordId: string) => identity.getMemberByDiscordId(GUILD, discordId);

  function agentInteract(discordId: string, interaction: Partial<Interaction>) {
    return handleAgentInteraction(
      {
        id: 'i',
        application_id: 'app',
        token: `token-${discordId}`,
        type: InteractionType.MESSAGE_COMPONENT,
        guild_id: DISCORD_GUILD,
        channel_id: POLL_CHANNEL,
        member: { user: { id: discordId, username: discordId }, roles: [] },
        ...interaction,
      } as Interaction,
      {
        discordGuildId: DISCORD_GUILD,
        guildId: GUILD,
        memberByDiscordId,
        ask: async (caller, input, delivery) => {
          pendingDelivery = delivery;
          try {
            return await registry.execute({ name: 'agent-ask', input, caller }, deps);
          } finally {
            pendingDelivery = undefined;
          }
        },
        run: (caller, name, input) => registry.execute({ name, input, caller }, deps),
      },
    );
  }

  /** The member's private reply once a run ends, as convex/agent.ts delivers it. */
  async function agentReply(runId: string) {
    const run = await deps.agent.getRun(GUILD, runId);
    if (!run) throw new Error(`no run ${runId}`);
    const confirmations = (await deps.agent.listConfirmations(GUILD, runId)).map(
      toConfirmationView,
    );
    return renderAgentReply({
      status: run.status,
      answer: run.answer,
      error: run.error,
      confirmations,
    });
  }

  /** `/random event create` and `/random event pick-night`, run through src/discord-events.ts. */
  const eventUi = {
    slash: (
      discordId: string,
      sub: 'create' | 'pick-night',
      options: Record<string, string | number>,
    ) =>
      handleEventInteraction(
        {
          id: 'i',
          application_id: 'app',
          token: 'token',
          type: InteractionType.APPLICATION_COMMAND,
          guild_id: DISCORD_GUILD,
          channel_id: SIGNUP_CHANNEL,
          member: { user: { id: discordId, username: discordId }, roles: [] },
          data: {
            name: 'random',
            options: [
              {
                name: 'event',
                type: 2,
                options: [
                  {
                    name: sub,
                    type: 1,
                    options: Object.entries(options).map(([name, value]) => ({
                      name,
                      value,
                      type: typeof value === 'number' ? 4 : 3,
                    })),
                  },
                ],
              },
            ],
          },
        },
        {
          discordGuildId: DISCORD_GUILD,
          guildId: GUILD,
          memberByDiscordId,
          run: (caller, name, input) => registry.execute({ name, input, caller }, deps),
          afterChange: () => deps.scheduler.runTickNow(GUILD),
          now: clock.now,
        },
      ),
  };

  /** `/random help [topic]` and `/random <group> help`, run through src/discord-help.ts. */
  const helpUi = {
    slash: (discordId: string, where: { topic?: string; group?: string } = {}) => {
      const help: CommandInteractionOption = {
        name: 'help',
        type: 1,
        options: where.topic ? [{ name: 'topic', type: 3, value: where.topic }] : [],
      };
      return handleHelpInteraction(
        {
          id: 'i',
          application_id: 'app',
          token: 'token',
          type: InteractionType.APPLICATION_COMMAND,
          guild_id: DISCORD_GUILD,
          channel_id: SIGNUP_CHANNEL,
          member: { user: { id: discordId, username: discordId }, roles: [] },
          data: {
            name: 'random',
            options: where.group ? [{ name: where.group, type: 2, options: [help] }] : [help],
          },
        },
        {
          discordGuildId: DISCORD_GUILD,
          guildId: GUILD,
          memberByDiscordId,
          run: (caller, name, input) => registry.execute({ name, input, caller }, deps),
        },
      );
    },
  };

  const agentUi = {
    ask: (discordId: string, question: string) =>
      agentInteract(discordId, {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: 'random',
          options: [
            { name: 'ask', type: 1, options: [{ name: 'question', type: 3, value: question }] },
          ],
        },
      } as Partial<Interaction>),
    click: (discordId: string, customId: string, content: string) =>
      agentInteract(discordId, {
        data: { custom_id: customId, component_type: 2 },
        message: { id: 'reply', content },
      } as Partial<Interaction>),
    /**
     * Stand in for the OpenAI turn: the agent calls `calls` through the real registry tools as the
     * asking member (recorded like the Convex tool mutation), then answers `text`.
     */
    answer: async (
      runId: string,
      calls: { tool: string; args: Record<string, unknown> }[],
      text: string,
    ) => {
      const run = await deps.agent.getRun(GUILD, runId);
      const member = run?.memberId ? await identity.getMember(GUILD, run.memberId) : null;
      if (!run || !member) throw new Error('the run has no member');
      const tools = createRegistryTools({
        registry,
        deps,
        caller: {
          surface: 'agent',
          guildId: GUILD,
          tier: member.tier,
          memberId: member.id,
          discordId: member.discordId,
          onBehalfOf: member.id,
        },
        hidden: isAgentCommand,
      });
      for (const [i, call] of calls.entries()) {
        await recordToolCall(
          deps.agent,
          { guildId: GUILD, runId, callId: `call-${i}`, name: call.tool },
          clock.now(),
          () => tools.execute(call.tool, call.args),
        );
      }
      await deps.agent.updateRun(GUILD, runId, {
        status: 'answered',
        answer: text,
        finishedAt: clock.now(),
      });
      return agentReply(runId);
    },
    queued,
    setDecisions: (port: DecisionsPort | null) => {
      decisions = port;
    },
  };

  function applicationInteract(discordId: string, interaction: Partial<Interaction>) {
    return handleApplicationInteraction(
      {
        id: 'i',
        application_id: 'app',
        token: 'token',
        type: InteractionType.MESSAGE_COMPONENT,
        guild_id: DISCORD_GUILD,
        channel_id: POLL_CHANNEL,
        member: {
          user: { id: discordId, username: discordId, global_name: `${discordId}-name` },
          roles: [],
        },
        ...interaction,
      } as Interaction,
      {
        discordGuildId: DISCORD_GUILD,
        guildId: GUILD,
        siteUrl: SITE_URL,
        memberByDiscordId: (id) => identity.getMemberByDiscordId(GUILD, id),
        run: (caller, name, input, confirmToken) =>
          registry.execute(
            { name, input, caller, ...(confirmToken ? { confirmToken } : {}) },
            deps,
          ),
      },
    );
  }

  const applicationUi = {
    /** /random apply, then the modal, as one Discord user. */
    apply: async (
      discordId: string,
      form: { character: string; class: string; spec: string; role: string },
      answers: { about: string; experience: string; availability: string },
    ) => {
      const opened = (await applicationInteract(discordId, {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: 'random',
          options: [
            {
              name: 'apply',
              type: 1,
              options: Object.entries(form).map(([name, value]) => ({ name, type: 3, value })),
            },
          ],
        },
      } as Partial<Interaction>)) as { type: number; data: { custom_id: string } };
      // Refused before the form (already raiding, or an application still open): that reply.
      if (opened.type !== 9) return opened;
      return applicationInteract(discordId, {
        type: InteractionType.MODAL_SUBMIT,
        data: {
          custom_id: opened.data.custom_id,
          components: Object.entries(answers).map(([id, value]) => ({
            type: 1,
            components: [{ type: 4, custom_id: id, value }],
          })),
        },
      } as Partial<Interaction>);
    },
    /** `/random recruiting`: the recruiting post (public for leaders, private for others). */
    recruiting: (discordId: string) =>
      applicationInteract(discordId, {
        type: InteractionType.APPLICATION_COMMAND,
        data: { name: 'random', options: [{ name: 'recruiting', type: 1 }] },
      } as Partial<Interaction>),
    /** Click an Apply button on the recruiting post, then fill the whole form in its modal. */
    applyFromPost: async (discordId: string, buttonId: string, fields: Record<string, string>) => {
      const opened = (await applicationUi.click(discordId, buttonId)) as {
        type: number;
        data: { custom_id: string };
      };
      if (opened.type !== 9) return opened;
      return applicationInteract(discordId, {
        type: InteractionType.MODAL_SUBMIT,
        data: {
          custom_id: opened.data.custom_id,
          components: Object.entries(fields).map(([id, value]) => ({
            type: 1,
            components: [{ type: 4, custom_id: id, value }],
          })),
        },
      } as Partial<Interaction>);
    },
    click: (discordId: string, customId: string) =>
      applicationInteract(discordId, {
        data: { custom_id: customId, component_type: 2 },
      } as Partial<Interaction>),
    /** Submit the Ask more modal on a review post. */
    askMore: (discordId: string, customId: string, text: string) =>
      applicationInteract(discordId, {
        type: InteractionType.MODAL_SUBMIT,
        data: {
          custom_id: customId,
          components: [{ type: 1, components: [{ type: 4, custom_id: 'reply', value: text }] }],
        },
      } as Partial<Interaction>),
    setWording: (text: string | null) => {
      wording = text;
    },
  };

  const pollUi = {
    create: (discordId: string, options: Record<string, string | number | boolean>) =>
      pollInteract(discordId, {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: 'random',
          options: [
            {
              name: 'poll',
              type: 2,
              options: [
                {
                  name: 'create',
                  type: 1,
                  options: Object.entries(options).map(([name, value]) => ({
                    name,
                    value,
                    type: typeof value === 'number' ? 4 : typeof value === 'boolean' ? 5 : 3,
                  })),
                },
              ],
            },
          ],
        },
      }),
    click: (discordId: string, customId: string) =>
      pollInteract(discordId, { data: { custom_id: customId, component_type: 2 } }),
    pick: (discordId: string, customId: string, values: string[]) =>
      pollInteract(discordId, { data: { custom_id: customId, component_type: 3, values } }),
    /** The post's text, as layoutText reads it. */
    postText: (pollId: string) => {
      const posted = pollPosts.get(pollId);
      return posted ? layoutText((posted.message.components ?? []) as LayoutComponent[]) : null;
    },
    pollPosts,
  };

  return {
    agentUi,
    helpUi,
    applicationUi,
    applicationEffects,
    insightsSent,
    discordUi,
    eventUi,
    pollUi,
    clock,
    deps,
    discord,
    events,
    system,
    ticksRequested,
    run,
    preview,
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
