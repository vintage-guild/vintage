// The Convex surface of the command registry. The website calls `read` (live queries) and
// `run` (mutations); /mcp, Discord, and the agent go through the same registry (PLAN §3.3).
import {
  type Caller,
  createGuildRegistry,
  error,
  publicCaller,
  systemCaller,
} from '@vintage/guild-kit';
import { v } from 'convex/values';
import { commands, type VintageDeps } from '../src/registry';
import { internalMutation, mutation, query } from './_generated/server';
import { identityDeps, identityStore } from './stores';

/** Single-guild deployment for now; every record still carries guildId (PLAN §3.11). */
const GUILD_ID = process.env.VINTAGE_GUILD_ID ?? 'vintage';

function registry() {
  const confirmSecret = process.env.VINTAGE_CONFIRM_SECRET;
  if (!confirmSecret) throw new Error('Set VINTAGE_CONFIRM_SECRET in the Convex environment');
  return createGuildRegistry<VintageDeps>({ commands, confirmSecret });
}

type Ctx = Parameters<typeof identityStore>[0];

const deps = (ctx: Ctx): VintageDeps => identityDeps(ctx, GUILD_ID);

/**
 * Resolve the caller from the auth identity. Better Auth's Discord provider (Phase 0, next step)
 * sets the identity subject to the Discord user id; until then every web caller is public.
 */
async function resolveCaller(ctx: Ctx): Promise<Caller> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return publicCaller(GUILD_ID);
  const member = await identityStore(ctx).getMemberByDiscordId(GUILD_ID, identity.subject);
  if (!member) return { ...publicCaller(GUILD_ID), discordId: identity.subject };
  return {
    surface: 'web',
    guildId: GUILD_ID,
    tier: member.tier,
    memberId: member.id,
    discordId: member.discordId,
  };
}

const requestArgs = {
  name: v.string(),
  input: v.any(),
  confirmToken: v.optional(v.string()),
};

/** Convex values can't hold `undefined`; CommandResult is JSON-shaped, so round-trip it. */
const toConvex = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Read-only commands, as a reactive query. */
export const read = query({
  args: requestArgs,
  handler: async (ctx, { name, input }) => {
    const reg = registry();
    if (reg.get(name)?.mutation) {
      return toConvex(
        error('USE_RUN', `${name} changes data; call commands.run instead`, { retryable: false }),
      );
    }
    return toConvex(
      await reg.execute({ name, input, caller: await resolveCaller(ctx) }, deps(ctx)),
    );
  },
});

/** Any command, including mutations and the dryRun → confirm flow. */
export const run = mutation({
  args: requestArgs,
  handler: async (ctx, { name, input, confirmToken }) => {
    const caller = await resolveCaller(ctx);
    const request = confirmToken ? { name, input, caller, confirmToken } : { name, input, caller };
    return toConvex(await registry().execute(request, deps(ctx)));
  },
});

/** System entry point for sign-in and the role-sync cron: runs `member-sync` as the system caller. */
export const syncMember = internalMutation({
  args: {
    discordId: v.string(),
    displayName: v.string(),
    inGuild: v.boolean(),
    roleIds: v.array(v.string()),
  },
  handler: async (ctx, input) =>
    toConvex(
      await registry().execute(
        { name: 'member-sync', input, caller: systemCaller(GUILD_ID) },
        deps(ctx),
      ),
    ),
});
