// Discord interactions, run inside Convex (#10). The gateway verifies Discord's signature and
// forwards component and modal interactions, `/random poll`, and `/random raid` to the HTTP route
// in http.ts, which calls `interaction` here. The flows live in src/discord-*.ts.
import type { Interaction } from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import type { Signup } from '@vintage/raids/contract';
import { v } from 'convex/values';
import { handleAgentInteraction } from '../src/discord-agent';
import { handlePollInteraction } from '../src/discord-polls';
import { handleRaidInteraction } from '../src/discord-raids';
import { handleSignupInteraction } from '../src/discord-signups';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
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

    const agent = await handleAgentInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      ask: (caller, input, delivery) => askAs(ctx, caller, input, delivery),
      run: (caller, name, input) => runCommandAs(ctx, caller, name, input),
    });
    if (agent) return agent;

    const raids = raidsStore(ctx);
    const signup = await handleSignupInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      characters: (memberId) => people.listCharacters(GUILD_ID, { memberId }),
      event: (eventId) => raids.getEvent(GUILD_ID, eventId),
      signup: (eventId, memberId) => raids.getSignupByMember(GUILD_ID, eventId, memberId),
      signups: (eventId) => raids.listSignups(GUILD_ID, eventId),
      // The registry's results are untyped at this boundary; signup-set returns a Signup.
      signupSet: (caller: Caller, input) =>
        runCommandAs(ctx, caller, 'signup-set', input) as Promise<CommandResult<Signup>>,
      afterChange: () => coordinatorScheduler(ctx).runTickNow(GUILD_ID),
    });
    if (signup) return signup;

    const raid = await handleRaidInteraction(incoming, {
      discordGuildId,
      guildId: GUILD_ID,
      memberByDiscordId,
      run: (caller, name, input) => runCommandAs(ctx, caller, name, input),
      afterChange: () => coordinatorScheduler(ctx).runTickNow(GUILD_ID),
      now: () => Date.now(),
    });
    if (raid) return raid;

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
