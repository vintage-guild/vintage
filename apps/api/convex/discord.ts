// Discord signup buttons, run inside Convex (#10). The gateway verifies Discord's signature and
// forwards component and modal interactions to the HTTP route in http.ts, which calls `interaction`
// here. The flow itself lives in src/discord-signups.ts.
import type { Interaction } from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import type { Signup } from '@vintage/raids/contract';
import { v } from 'convex/values';
import { handleSignupInteraction } from '../src/discord-signups';
import { internalMutation } from './_generated/server';
import { GUILD_ID, runCommandAs } from './commands';
import { coordinatorDeps, identityStore, raidsStore } from './stores';

export const interaction = internalMutation({
  args: { interaction: v.any() },
  handler: async (ctx, args) => {
    const people = identityStore(ctx);
    const raids = raidsStore(ctx);
    const response = await handleSignupInteraction(args.interaction as Interaction, {
      discordGuildId: process.env.DISCORD_GUILD_ID,
      guildId: GUILD_ID,
      memberByDiscordId: (discordId) => people.getMemberByDiscordId(GUILD_ID, discordId),
      characters: (memberId) => people.listCharacters(GUILD_ID, { memberId }),
      event: (eventId) => raids.getEvent(GUILD_ID, eventId),
      signup: (eventId, memberId) => raids.getSignupByMember(GUILD_ID, eventId, memberId),
      // The registry's results are untyped at this boundary; signup-set returns a Signup.
      signupSet: (caller: Caller, input) =>
        runCommandAs(ctx, caller, 'signup-set', input) as Promise<CommandResult<Signup>>,
      afterChange: () => coordinatorDeps(ctx).scheduler.runTickNow(GUILD_ID),
    });
    return response ?? null;
  },
});
