// Discord interactions, run inside Convex (#10). The gateway verifies Discord's signature and
// forwards component and modal interactions, `/random poll`, `/random event`, and the rest of
// FORWARDED_GROUPS to the HTTP route in http.ts, which calls `interaction` here. The flows live in
// src/discord-*.ts. Help goes first: `/random poll help` would otherwise reach the poll flow.
// Autocomplete (`/random character` spec and name, #149; the raid in `/random event check-export`)
// runs in `autocomplete`, a query: indexed reads, no writes, so it answers well inside Discord's
// 3 seconds.
import type { Interaction } from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import type { Character } from '@vintage/identity/contract';
import type { Signup, SignupGuess } from '@vintage/raids/contract';
import { v } from 'convex/values';
import { handleAgentInteraction } from '../src/discord-agent';
import { handleApplicationInteraction } from '../src/discord-applications';
import { handleCharacterAutocomplete, handleCharacterInteraction } from '../src/discord-characters';
import {
  FALLBACK_TIME_ZONE,
  handleEventAutocomplete,
  handleEventInteraction,
} from '../src/discord-events';
import { handleHelpInteraction } from '../src/discord-help';
import { handlePollInteraction } from '../src/discord-polls';
import { handleSignupInteraction } from '../src/discord-signups';
import { internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import { askAs, GUILD_ID, runCommandAs } from './commands';
import { REFRESH_DELAY_MS } from './pollPosts';
import { coordinatorScheduler, identityStore, raidsStore } from './stores';

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
      afterChange: () => coordinatorScheduler(ctx).runTickNow(GUILD_ID),
    });
    if (signup) return signup;

    const event = await handleEventInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      run: (caller, name, input) => runCommandAs(ctx, caller, name, input),
      afterChange: () => coordinatorScheduler(ctx).runTickNow(GUILD_ID),
      now: () => Date.now(),
    });
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
 * Autocomplete for `/random character` (spec, name) and `/random event check-export` (the raid):
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
