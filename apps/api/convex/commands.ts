// The Convex surface of the command registry. The website calls `read` (live queries) and
// `run` (mutations); /mcp, Discord, and the agent go through the same registry (PLAN §3.3).
import { type Caller, createGuildRegistry, error, systemCaller } from '@vintage/guild-kit';
import { type Infer, v } from 'convex/values';
import { commands, type VintageDeps } from '../src/registry';
import { discordIdOf, webCaller } from '../src/web-caller';
import { internalMutation, mutation, query } from './_generated/server';
import {
  coordinatorDeps,
  identityDeps,
  identityStore,
  pollsDeps,
  progressDeps,
  raidsDeps,
  siteDeps,
} from './stores';

/** Single-guild deployment for now; every record still carries guildId (PLAN §3.11). */
export const GUILD_ID = process.env.VINTAGE_GUILD_ID ?? 'vintage';

function registry() {
  const confirmSecret = process.env.VINTAGE_CONFIRM_SECRET;
  if (!confirmSecret) throw new Error('Set VINTAGE_CONFIRM_SECRET in the Convex environment');
  return createGuildRegistry<VintageDeps>({ commands, confirmSecret });
}

type Ctx = Parameters<typeof identityStore>[0];

const deps = (ctx: Ctx): VintageDeps => ({
  ...identityDeps(ctx),
  ...raidsDeps(ctx),
  ...coordinatorDeps(ctx, (caller, name, input) => runAs(ctx, caller, { name, input })),
  ...pollsDeps(ctx),
  ...progressDeps(ctx),
  ...siteDeps(ctx),
});

/** The website caller: the signed-in member from the token's Discord id (convex/auth.ts), else public. */
async function resolveCaller(ctx: Ctx): Promise<Caller> {
  const identity = await ctx.auth.getUserIdentity();
  return webCaller(GUILD_ID, discordIdOf(identity), (discordId) =>
    identityStore(ctx).getMemberByDiscordId(GUILD_ID, discordId),
  );
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

type RunArgs = Infer<typeof requestArgsValidator>;
const requestArgsValidator = v.object(requestArgs);

async function runAs(ctx: Ctx, caller: Caller, { name, input, confirmToken }: RunArgs) {
  const request = confirmToken ? { name, input, caller, confirmToken } : { name, input, caller };
  return toConvex(await registry().execute(request, deps(ctx)));
}

/** Any command, including mutations and the dryRun → confirm flow. */
export const run = mutation({
  args: requestArgs,
  handler: async (ctx, args) => runAs(ctx, await resolveCaller(ctx), args),
});

/**
 * Run a command as a resolved caller from server code (Discord interactions). Pass the token a
 * destructive command's preview returned to run it for real.
 */
export const runCommandAs = (
  ctx: Ctx,
  caller: Caller,
  name: string,
  input: unknown,
  confirmToken?: string,
) => runAs(ctx, caller, { name, input, ...(confirmToken ? { confirmToken } : {}) });

/** Run a command as the system caller from server code (the coordinator tick, crons). */
export const runSystemCommand = (ctx: Ctx, name: string, input: unknown) =>
  runAs(ctx, systemCaller(GUILD_ID), { name, input });

/**
 * Operator entry point: any command as the system caller (officer tier), with the same
 * preview → confirm flow for destructive commands. Internal, so only someone with deployment
 * admin access can call it. Bootstraps the first role map before anyone is an officer:
 *   npx convex run commands:runAsSystem '{"name":"guild-roles-set","input":{"roles":{…}}}'
 * then again with the returned confirmToken.
 */
export const runAsSystem = internalMutation({
  args: requestArgs,
  handler: async (ctx, args) => runAs(ctx, systemCaller(GUILD_ID), args),
});

const memberSyncInput = v.object({
  discordId: v.string(),
  displayName: v.string(),
  inServer: v.boolean(),
  roleIds: v.array(v.string()),
});

const runMemberSync = (ctx: Ctx, input: Infer<typeof memberSyncInput>) =>
  registry().execute({ name: 'member-sync', input, caller: systemCaller(GUILD_ID) }, deps(ctx));

/** System entry point for sign-in and the role-sync cron: runs `member-sync` as the system caller. */
export const syncMember = internalMutation({
  args: memberSyncInput.fields,
  handler: async (ctx, input) => toConvex(await runMemberSync(ctx, input)),
});

/** A batch of `member-sync` calls in one transaction, for the role-sync cron (roleSync.ts). */
export const syncMembers = internalMutation({
  args: { members: v.array(memberSyncInput) },
  handler: async (ctx, { members }) => {
    const failed: { discordId: string; code: string }[] = [];
    for (const input of members) {
      const result = await runMemberSync(ctx, input);
      if (!result.success) {
        failed.push({ discordId: input.discordId, code: result.error?.code ?? 'UNKNOWN' });
      }
    }
    return { synced: members.length - failed.length, failed };
  },
});
