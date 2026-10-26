// One coordinator tick (PLAN §6.1): create upcoming raids, read the state, plan, then perform each
// action. Every action is claimed in the store before it is sent, so two overlapping ticks can't
// both send it, and re-running a tick sends nothing twice.
import { DiscordRestError, type MessageData } from '@vintage/discord-kit';
import { type PlannedAction, planTick } from './domain/plan';
import {
  hashMessage,
  renderDigest,
  renderDm,
  renderFailure,
  renderFinalRoster,
  renderImportString,
  renderPromotion,
  renderReminder,
  renderSignupPost,
} from './domain/render';
import type { TickPorts, TickState } from './store';

/** A claim older than this is treated as abandoned (the tick that took it crashed). */
export const CLAIM_STALE_MS = 10 * 60 * 1000;

export interface TickOutcome {
  eventId: string;
  rule: string;
  target: string;
  status: 'sent' | 'skipped' | 'failed' | 'edited' | 'busy';
  detail?: string;
}

export interface TickReport {
  skipped?: string;
  outcomes: TickOutcome[];
}

type Performed = {
  status: 'sent' | 'skipped';
  messageId?: string | null;
  detail?: string;
  renderHash?: string;
};

async function perform(
  action: Exclude<PlannedAction, { kind: 'refresh' }>,
  state: TickState,
  ports: TickPorts,
  now: number,
): Promise<Performed> {
  const { tick } = action;
  const send = async (message: MessageData) =>
    ({ status: 'sent', messageId: (await ports.discord.post(action.target, message)).id }) as const;
  switch (action.kind) {
    case 'post': {
      const message = renderSignupPost(tick, state.members);
      return { ...(await send(message)), renderHash: hashMessage(message) };
    }
    case 'promote':
      return send(
        renderPromotion(
          tick,
          action.signup,
          state.members.find((m) => m.memberId === action.signup.memberId),
        ),
      );
    case 'remind':
      return send(renderReminder(tick, action.waiting));
    case 'dm':
      try {
        const { id } = await ports.discord.dm(
          action.member.discordId,
          renderDm(tick, action.member),
        );
        return { status: 'sent', messageId: id };
      } catch (err) {
        // 50007: the member doesn't accept DMs from this server. Not worth retrying.
        if (err instanceof DiscordRestError && err.code === 50007) {
          return { status: 'skipped', detail: 'member does not accept DMs' };
        }
        throw err;
      }
    case 'digest':
      return send(renderDigest(tick, state.members, action.waiting));
    case 'lock':
      await ports.raids.lock(state.guildId, tick.event.id);
      return { status: 'sent' };
    case 'final-roster':
      return send(renderFinalRoster(tick, state.members));
    case 'import-string':
      return send(renderImportString(tick, state.members, state.guildId, now));
    case 'skip':
      return { status: 'skipped', detail: action.reason };
  }
}

/** Edit the signup post in place; failures are retried next tick and never logged as actions. */
async function refresh(
  action: Extract<PlannedAction, { kind: 'refresh' }>,
  state: TickState,
  ports: TickPorts,
): Promise<TickOutcome> {
  const { tick, post } = action;
  const base = { eventId: tick.event.id, rule: 'refresh', target: post.target };
  if (!post.discordMessageId)
    return { ...base, status: 'skipped', detail: 'post has no message id' };
  const message = renderSignupPost(tick, state.members);
  try {
    await ports.discord.edit(post.target, post.discordMessageId, message);
    await ports.store.setRenderHash(state.guildId, post.id, hashMessage(message));
    return { ...base, status: 'edited' };
  } catch (err) {
    return { ...base, status: 'failed', detail: describe(err) };
  }
}

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function reportFailure(
  state: TickState,
  ports: TickPorts,
  action: PlannedAction,
  error: string,
) {
  const ops = state.config.opsChannelId;
  if (!ops || action.kind === 'refresh' || action.target === ops) return;
  try {
    await ports.discord.post(ops, renderFailure(action.tick, action.rule, error));
  } catch {
    // The ops channel itself is failing; the action log still records the failure.
  }
}

/** Claim, perform, and record one action. */
async function execute(
  action: Exclude<PlannedAction, { kind: 'refresh' }>,
  state: TickState,
  ports: TickPorts,
  now: number,
): Promise<TickOutcome> {
  const { guildId } = state;
  const key = { guildId, eventId: action.tick.event.id, rule: action.rule, target: action.target };
  const claimed = await ports.store.claimAction(key, now, CLAIM_STALE_MS);
  if (!claimed) return { ...key, status: 'busy' };
  try {
    const done = await perform(action, state, ports, now);
    await ports.store.completeAction(
      guildId,
      claimed.action.id,
      {
        status: done.status,
        discordMessageId: done.messageId ?? null,
        detail: done.detail ?? null,
        renderHash: done.renderHash ?? null,
      },
      now,
    );
    return { ...key, status: done.status, ...(done.detail ? { detail: done.detail } : {}) };
  } catch (err) {
    const detail = describe(err);
    await ports.store.completeAction(guildId, claimed.action.id, { status: 'failed', detail }, now);
    // Report the first failure only; retries on later ticks stay quiet.
    if (!claimed.retry) await reportFailure(state, ports, action, detail);
    return { ...key, status: 'failed', detail };
  }
}

export async function runTick(ports: TickPorts, guildId: string, now: number): Promise<TickReport> {
  const config = await ports.store.getConfig(guildId);
  if (config.paused) return { skipped: 'paused', outcomes: [] };
  if (!config.signupChannelId) return { skipped: 'no signup channel configured', outcomes: [] };

  await ports.raids.materialize(guildId);
  const state = await ports.source.load(guildId, now);
  const plan = planTick(state, now, (tick) => hashMessage(renderSignupPost(tick, state.members)));
  const outcomes: TickOutcome[] = [];
  // In order: a raid's post goes out before its reminders, the lock before the final roster.
  for (const action of plan) {
    outcomes.push(
      action.kind === 'refresh'
        ? await refresh(action, state, ports)
        : await execute(action, state, ports, now),
    );
  }
  return { outcomes };
}
