// Discord interactions, run inside Convex (#10). The gateway verifies Discord's signature and
// forwards component and modal interactions, `/vintage poll`, `/vintage event`, and the rest of
// FORWARDED_GROUPS to the HTTP route in http.ts, which calls `interaction` here. The flows live in
// src/discord-*.ts. Help goes first: `/vintage poll help` would otherwise reach the poll flow.
// Autocomplete (`/vintage character` spec and name, #149; the raid in `/vintage event check-export`)
// runs in `autocomplete`, a query: indexed reads, no writes, so it answers well inside Discord's
// 3 seconds.
import type { Interaction } from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import type { Signup, SignupGuess } from '@vintage/raids/contract';
import { v } from 'convex/values';
import { handleAbsenceAutocomplete, handleAbsenceInteraction } from '../src/discord-absences';
import { handleAgentInteraction } from '../src/discord-agent';
import { handleApplicationInteraction } from '../src/discord-applications';
import { handleCharacterAutocomplete, handleCharacterInteraction } from '../src/discord-characters';
import { handleEventFormInteraction } from '../src/discord-event-form';
import {
  FALLBACK_TIME_ZONE,
  handleEventAutocomplete,
  handleEventInteraction,
} from '../src/discord-events';
import { handleHelpInteraction } from '../src/discord-help';
import { handleLeadsInteraction } from '../src/discord-leads';
import { handlePollInteraction } from '../src/discord-polls';
import { handleSignupInteraction } from '../src/discord-signups';
import { internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import { askAs, GUILD_ID, runCommandAs, runSystemCommand } from './commands';
import { REFRESH_DELAY_MS } from './pollPosts';
import {
  coordinatorScheduler,
  coordinatorStore,
  identityStore,
  raidsStore,
  scheduleCoalescedTick,
} from './stores';

export const interaction = internalMutation({
  args: { interaction: v.any() },
  handler: async (ctx, args) => {
    const incoming = args.interaction as Interaction;
    const discordGuildId = process.env.DISCORD_GUILD_ID;
    const people = identityStore(ctx);
    const memberByDiscordId = (discordId: string) =>
      people.getMemberByDiscordId(GUILD_ID, discordId);

    const help = await handleHelpInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      run: (caller, name, input) => runCommandAs(ctx, caller, name, input),
    });
    if (help) return help;

    const agent = await handleAgentInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      ask: (caller, input, delivery) => askAs(ctx, caller, input, delivery),
      run: (caller, name, input) => runCommandAs(ctx, caller, name, input),
    });
    if (agent) return agent;

    const application = await handleApplicationInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      siteUrl: process.env.VINTAGE_SITE_URL ?? null,
      memberByDiscordId,
      run: (caller, name, input, confirmToken) =>
        runCommandAs(ctx, caller, name, input, confirmToken),
    });
    if (application) return application;

    const character = await handleCharacterInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      run: (caller, name, input, confirmToken) =>
        runCommandAs(ctx, caller, name, input, confirmToken),
    });
    if (character) return character;

    const raids = raidsStore(ctx);
    const absence = await handleAbsenceInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      absences: (memberId) => raids.listAbsences(GUILD_ID, { memberId, activeOnly: true }),
      characters: (memberId) => people.listCharacters(GUILD_ID, { memberId }),
      signup: (eventId, memberId) => raids.getSignupByMember(GUILD_ID, eventId, memberId),
      run: (caller, name, input) => runCommandAs(ctx, caller, name, input),
      afterChange: () => scheduleCoalescedTick(ctx, GUILD_ID),
      now: () => Date.now(),
    });
    if (absence) return absence;

    const leads = await handleLeadsInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      memberById: (memberId) => people.getMember(GUILD_ID, memberId),
      event: (eventId) => raids.getEvent(GUILD_ID, eventId),
      signups: (eventId) => raids.listSignups(GUILD_ID, eventId),
      config: () => coordinatorStore(ctx).getConfig(GUILD_ID),
      run: (caller, name, input) => runCommandAs(ctx, caller, name, input),
      clearGroups: async (eventId) => {
        const list = await raids.listSignups(GUILD_ID, eventId);
        for (const s of list) {
          if (s.group !== null) {
            await raids.updateSignup(GUILD_ID, s.id, { group: null });
          }
        }
      },
      postMention: async (channelId, content, mentionUserId) => {
        await ctx.scheduler.runAfter(0, internal.coordinator.postChannelMessage, {
          channelId,
          content,
          mentionUserId,
        });
      },
      afterChange: () => scheduleCoalescedTick(ctx, GUILD_ID),
    });
    if (leads) return leads;

    const signup = await handleSignupInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      characters: (memberId) => people.listCharacters(GUILD_ID, { memberId }),
      event: (eventId) => raids.getEvent(GUILD_ID, eventId),
      signup: (eventId, memberId) => raids.getSignupByMember(GUILD_ID, eventId, memberId),
      signups: (eventId) => raids.listSignups(GUILD_ID, eventId),
      // The registry's results are untyped at this boundary; signup-suggest returns a guess or
      // null, signup-set a Signup.
      signupSuggest: (caller: Caller, input) =>
        runCommandAs(ctx, caller, 'signup-suggest', input) as Promise<
          CommandResult<SignupGuess | null>
        >,
      signupSet: (caller: Caller, input) =>
        runCommandAs(ctx, caller, 'signup-set', input) as Promise<CommandResult<Signup>>,
      characterAdd: (caller: Caller, input) =>
        runCommandAs(ctx, caller, 'character-add', input) as Promise<CommandResult<Character>>,
      absences: (memberId) => raids.listAbsences(GUILD_ID, { memberId, activeOnly: true }),
      rosterContext: async () => ({
        members: await people.listMembers(GUILD_ID),
        absences: await raids.listAbsences(GUILD_ID, { activeOnly: true }),
      }),
      syncMember: async (input) => {
        const res = (await runSystemCommand(ctx, 'member-sync', input)) as CommandResult<Member>;
        return res.success ? (res.data ?? null) : null;
      },
      afterChange: () => coordinatorScheduler(ctx).runTickNow(GUILD_ID),
    });
    if (signup) return signup;

    const eventPorts = {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      run: (caller: Caller, name: string, input: unknown) => runCommandAs(ctx, caller, name, input),
      afterChange: () => coordinatorScheduler(ctx).runTickNow(GUILD_ID),
      now: () => Date.now(),
    };
    // The New event form first: it takes a bare `/vintage event create` and its own clicks.
    const form = await handleEventFormInteraction(incoming, eventPorts);
    if (form) return form;
    const event = await handleEventInteraction(incoming, eventPorts);
    if (event) return event;

    const poll = await handlePollInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      run: (caller, name, input, confirmToken) =>
        runCommandAs(ctx, caller, name, input, confirmToken),
      post: async (pollId, channelId) => {
        await ctx.scheduler.runAfter(0, internal.pollPosts.post, { pollId, channelId });
      },
      refresh: async (pollId) => {
        await ctx.scheduler.runAfter(REFRESH_DELAY_MS, internal.pollPosts.refresh, { pollId });
      },
      now: () => Date.now(),
    });
    return poll ?? null;
  },
});

/**
 * Autocomplete for `/vintage character` (spec, name) and `/vintage event check-export` (the raid):
 * suggestions only, so a query (no command runs).
 */
export const autocomplete = internalQuery({
  args: { interaction: v.any() },
  handler: async (ctx, args) => {
    const incoming = args.interaction as Interaction;
    const people = identityStore(ctx);
    const memberByDiscordId = (discordId: string) =>
      people.getMemberByDiscordId(GUILD_ID, discordId);
    const discordGuildId = process.env.DISCORD_GUILD_ID;
    const character = await handleCharacterAutocomplete(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      characters: (memberId) => people.listCharacters(GUILD_ID, { memberId }),
    });
    if (character) return character;
    const raids = raidsStore(ctx);
    const absence = await handleAbsenceAutocomplete(incoming, {
      discordGuildId,
      memberByDiscordId,
      absences: (memberId) => raids.listAbsences(GUILD_ID, { memberId, activeOnly: true }),
    });
    if (absence) return absence;
    return handleEventAutocomplete(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      events: (window) => raids.listEvents(GUILD_ID, window),
      timeZone: async () => {
        const schedules = await raids.listSchedules(GUILD_ID);
        const zoned = schedules.find((s) => s.active) ?? schedules[0];
        return zoned?.recurrence.timeZone ?? FALLBACK_TIME_ZONE;
      },
      now: () => Date.now(),
    });
  },
});
