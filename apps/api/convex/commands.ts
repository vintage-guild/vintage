// The Convex surface of the command registry. The website calls `read` (live queries) and
// `run` (mutations); /mcp, Discord, and the agent go through the same registry (PLAN §3.3).
import type { AgentDelivery } from '@vintage/agent/contract';
import {
  type Caller,
  type CommandResult,
  createGuildRegistry,
  systemCaller,
} from '@vintage/guild-kit';
import { type Infer, v } from 'convex/values';
import { onboardAfterSync } from '../src/onboarding';
import { refuseMutationInRead } from '../src/read-only';
import { commands, type VintageDeps } from '../src/registry';
import { discordIdOf, webCaller } from '../src/web-caller';
import { internalMutation, mutation, query } from './_generated/server';
import {
  agentDeps,
  applicationsDeps,
  coordinatorDeps,
  identityDeps,
  identityStore,
  insightsDeps,
  lootDeps,
  pollsDeps,
  progressDeps,
  raidsDeps,
  siteDeps,
} from './stores';

/** Single-guild deployment for now; every record still carries guildId (PLAN §3.11). */
export const GUILD_ID = process.env.VINTAGE_GUILD_ID ?? 'vintage';

export function registry() {
  const confirmSecret = process.env.VINTAGE_CONFIRM_SECRET;
  if (!confirmSecret) throw new Error('Set VINTAGE_CONFIRM_SECRET in the Convex environment');
  return createGuildRegistry<VintageDeps>({ commands, confirmSecret });
}

type Ctx = Parameters<typeof identityStore>[0];

/** `options.agentDelivery`: where agent-ask delivers the answer (a Discord interaction). */
export const deps = (ctx: Ctx, options: { agentDelivery?: AgentDelivery } = {}): VintageDeps => ({
  ...identityDeps(ctx),
  ...raidsDeps(ctx),
  ...coordinatorDeps(ctx, (caller, name, input) => runAs(ctx, caller, { name, input })),
  ...pollsDeps(ctx),
  ...progressDeps(ctx),
  ...siteDeps(ctx),
  ...agentDeps(
    ctx,
    (caller, name, input, confirmToken) =>
      runAs(ctx, caller, { name, input, ...(confirmToken ? { confirmToken } : {}) }),
    options.agentDelivery,
  ),
  ...applicationsDeps(ctx),
  ...insightsDeps(ctx),
  ...lootDeps(ctx),
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
    const caller = await resolveCaller(ctx);
    const refusal = refuseMutationInRead(reg, caller, name);
    if (refusal) return toConvex(refusal);
    // A mutation the caller may not run gets COMMAND_NOT_FOUND here, before any handler runs.
    return toConvex(await reg.execute({ name, input, caller }, deps(ctx)));
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

/** agent-ask as a resolved caller, delivering the answer to the interaction that asked (#18). */
export const askAs = async (
  ctx: Ctx,
  caller: Caller,
  input: { question: string; thread?: string },
  agentDelivery: AgentDelivery,
): Promise<CommandResult<unknown>> =>
  toConvex(
    await registry().execute({ name: 'agent-ask', input, caller }, deps(ctx, { agentDelivery })),
  );

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

/** member-sync, then onboarding if it promoted an accepted applicant (src/onboarding.ts). */
async function runMemberSync(ctx: Ctx, input: Infer<typeof memberSyncInput>) {
  const result = await registry().execute(
    { name: 'member-sync', input, caller: systemCaller(GUILD_ID) },
    deps(ctx),
  );
  // Onboarding must never stop rank sync: a throw here would roll back the whole batch.
  try {
    await onboardAfterSync(result, (name, onboardInput) =>
      runSystemCommand(ctx, name, onboardInput),
    );
  } catch (err) {
    console.error(`member-sync ${input.discordId}: onboarding failed: ${String(err)}`);
  }
  return result;
}

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
