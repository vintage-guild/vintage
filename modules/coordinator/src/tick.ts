// One coordinator tick (PLAN §6.1): create upcoming raids, read the state, plan, then perform each
// action. Every action is claimed in the store before it is sent, so two overlapping ticks can't
// both send it, and re-running a tick sends nothing twice.
import {
  DiscordRestError,
  type MessageData,
  ScheduledEventStatus,
  UNKNOWN_SCHEDULED_EVENT,
} from '@vintage/discord-kit';
import type { Poll } from '@vintage/polls/contract';
import type { CoordinatorAction, CoordinatorConfig, RaidNight } from './contract';
import {
  assessmentFacts,
  assessmentRule,
  buildAssessment,
  renderAssessment,
  WORDING_INSTRUCTIONS,
} from './domain/assessment';
import { renderFinalRoster, renderSignupPost } from './domain/card';
import { triageNotes } from './domain/notes';
import { type PlannedAction, planTick } from './domain/plan';
import {
  decideRaidNight,
  type RaidNightDecision,
  renderRaidNightUnresolved,
} from './domain/raid-night';
import {
  digestNotes,
  hashMessage,
  renderDigest,
  renderDm,
  renderFailure,
  renderImportString,
  renderPromotion,
  renderReminder,
} from './domain/render';
import { hashServerEvent, renderServerEvent, signupLink } from './domain/server-event';
import { renderRaidSummary } from './domain/summary';
import type { TickEvent, TickPorts, TickState } from './store';

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

/** Planned actions that edit in place and are never logged. */
type Unlogged = { kind: 'refresh' | 'server-event-update' | 'summary-update' };
type Logged = Exclude<PlannedAction, Unlogged>;

/** Discord 50013: the bot lacks a permission. For server events that is CREATE_EVENTS. */
const MISSING_PERMISSIONS = 50013;

/** The server event a raid should have, linking to its signup post. */
function serverEventFor(tick: TickEvent, post: CoordinatorAction, ports: TickPorts) {
  return renderServerEvent(
    tick,
    signupLink(ports.links, { channelId: post.target, messageId: post.discordMessageId }),
  );
}

/** Name the missing permission instead of Discord's bare "Missing Permissions". */
function explainEventError(err: unknown): never {
  if (err instanceof DiscordRestError && err.code === MISSING_PERMISSIONS) {
    throw new Error(
      'the bot lacks the Create Events permission in Discord (see SETUP.md); turn serverEvents off or grant it',
    );
  }
  throw err;
}

/** Set a cancelled raid's server event to CANCELED; one already deleted in Discord is skipped. */
async function cancelServerEvent(
  serverEvent: CoordinatorAction,
  ports: TickPorts,
): Promise<Performed> {
  const id = serverEvent.discordMessageId;
  if (!id) return { status: 'skipped', detail: 'the server event has no Discord id' };
  try {
    await ports.discord.editEvent(id, { status: ScheduledEventStatus.CANCELED });
  } catch (err) {
    if (err instanceof DiscordRestError && err.code === UNKNOWN_SCHEDULED_EVENT) {
      return { status: 'skipped', detail: 'the server event was already deleted in Discord' };
    }
    explainEventError(err);
  }
  return { status: 'sent', messageId: id };
}

async function perform(
  action: Logged,
  state: TickState,
  ports: TickPorts,
  now: number,
  /** The message an earlier attempt of this action sent (a post being reposted). */
  previousMessageId: string | null,
): Promise<Performed> {
  const { tick } = action;
  const send = async (message: MessageData) =>
    ({ status: 'sent', messageId: (await ports.discord.post(action.target, message)).id }) as const;
  switch (action.kind) {
    case 'post': {
      const message = renderSignupPost(tick, state.members);
      const sent = await send(message);
      if (previousMessageId) {
        // A repost: clear the old card so the channel has one live post per raid.
        await ports.discord.remove(action.target, previousMessageId).catch(() => undefined);
      }
      return { ...sent, renderHash: hashMessage(message) };
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
        const link = signupLink(ports.links, {
          channelId: action.post.target,
          messageId: action.post.discordMessageId,
        });
        const { id } = await ports.discord.dm(
          action.member.discordId,
          renderDm(tick, action.member, link),
        );
        return { status: 'sent', messageId: id };
      } catch (err) {
        // 50007: the member doesn't accept DMs from this server. Not worth retrying.
        if (err instanceof DiscordRestError && err.code === 50007) {
          return { status: 'skipped', detail: 'member does not accept DMs' };
        }
        throw err;
      }
    case 'digest': {
      const labels = await triageNotes(ports.decisions, state.guildId, digestNotes(tick));
      return send(renderDigest(tick, state.members, action.waiting, labels));
    }
    case 'lock':
      await ports.raids.lock(state.guildId, tick.event.id);
      return { status: 'sent' };
    case 'final-roster':
      return send(renderFinalRoster(tick, state.members));
    case 'import-string':
      return send(renderImportString(tick, state.members, state.guildId, now));
    case 'server-event': {
      // The Discord event id is stored where posts keep their message id.
      const data = serverEventFor(tick, action.post, ports);
      const { id } = await ports.discord.createEvent(data).catch(explainEventError);
      return { status: 'sent', messageId: id, renderHash: hashServerEvent(data) };
    }
    case 'server-event-cancel':
      return cancelServerEvent(action.serverEvent, ports);
    case 'summary': {
      const message = renderRaidSummary(action.recorded);
      return { ...(await send(message)), renderHash: hashMessage(message) };
    }
    case 'skip':
      return { status: 'skipped', detail: action.reason };
  }
}

/** Edit the signup post in place; failures are retried next tick and never logged as actions. */
function refresh(
  action: Extract<PlannedAction, { kind: 'refresh' }>,
  state: TickState,
  ports: TickPorts,
): Promise<TickOutcome> {
  const { tick, post } = action;
  return editPost('refresh', post, renderSignupPost(tick, state.members), state, ports);
}

/** Edit a raid's summary when a different export replaced its record. */
function updateSummary(
  action: Extract<PlannedAction, { kind: 'summary-update' }>,
  state: TickState,
  ports: TickPorts,
): Promise<TickOutcome> {
  return editPost(
    'summary-update',
    action.summary,
    renderRaidSummary(action.recorded),
    state,
    ports,
  );
}

/**
 * Edit a logged message in place and keep its hash. One deleted in Discord is marked failed, so
 * the next tick posts it again.
 */
async function editPost(
  rule: string,
  post: CoordinatorAction,
  message: MessageData,
  state: TickState,
  ports: TickPorts,
): Promise<TickOutcome> {
  const base = { eventId: post.eventId, rule, target: post.target };
  if (!post.discordMessageId)
    return { ...base, status: 'skipped', detail: 'post has no message id' };
  try {
    await ports.discord.edit(post.target, post.discordMessageId, message);
    await ports.store.setRenderHash(state.guildId, post.id, hashMessage(message));
    return { ...base, status: 'edited' };
  } catch (err) {
    // 10008: someone deleted the post in Discord. Mark it so the next tick posts a fresh one.
    if (err instanceof DiscordRestError && err.code === 10008) {
      await ports.store.completeAction(
        state.guildId,
        post.id,
        { status: 'failed', detail: 'the post was deleted in Discord; reposting' },
        Date.now(),
      );
      return { ...base, status: 'failed', detail: 'post deleted; it will be reposted' };
    }
    return { ...base, status: 'failed', detail: describe(err) };
  }
}

/** Edit a raid's server event when the raid moved or was renamed; retried next tick on failure. */
async function updateServerEvent(
  action: Extract<PlannedAction, { kind: 'server-event-update' }>,
  state: TickState,
  ports: TickPorts,
): Promise<TickOutcome> {
  const { tick, serverEvent, post } = action;
  const base = { eventId: tick.event.id, rule: 'server-event-update', target: serverEvent.target };
  if (!serverEvent.discordMessageId) {
    return { ...base, status: 'skipped', detail: 'server event has no Discord id' };
  }
  const data = serverEventFor(tick, post, ports);
  try {
    await ports.discord.editEvent(serverEvent.discordMessageId, data);
    await ports.store.setRenderHash(state.guildId, serverEvent.id, hashServerEvent(data));
    return { ...base, status: 'edited' };
  } catch (err) {
    // 10070: someone deleted the event in Discord. Mark it so the next tick makes a fresh one.
    if (err instanceof DiscordRestError && err.code === UNKNOWN_SCHEDULED_EVENT) {
      await ports.store.completeAction(
        state.guildId,
        serverEvent.id,
        { status: 'failed', detail: 'the server event was deleted in Discord; recreating' },
        Date.now(),
      );
      return { ...base, status: 'failed', detail: 'server event deleted; it will be recreated' };
    }
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
  if (
    !ops ||
    action.kind === 'refresh' ||
    action.kind === 'server-event-update' ||
    action.kind === 'summary-update' ||
    action.target === ops
  ) {
    return;
  }
  try {
    await ports.discord.post(ops, renderFailure(action.tick, action.rule, error));
  } catch {
    // The ops channel itself is failing; the action log still records the failure.
  }
}

/** Claim, perform, and record one action. */
async function execute(
  action: Logged,
  state: TickState,
  ports: TickPorts,
  now: number,
): Promise<TickOutcome> {
  const { guildId } = state;
  const key = { guildId, eventId: action.tick.event.id, rule: action.rule, target: action.target };
  const claimed = await ports.store.claimAction(key, now, CLAIM_STALE_MS);
  if (!claimed) return { ...key, status: 'busy' };
  try {
    const done = await perform(action, state, ports, now, claimed.action.discordMessageId);
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

type Settled = { status: 'sent' | 'skipped'; detail: string; messageId?: string | null };

/** Act on one closed raid-night poll: make the raid, or tell officers why there isn't one. */
async function settleRaidNight(
  ports: TickPorts,
  config: CoordinatorConfig,
  night: RaidNight,
  poll: Poll | null,
  decision: Extract<RaidNightDecision, { kind: 'create' | 'unresolved' }>,
): Promise<Settled> {
  const { guildId } = config;
  if (decision.kind === 'create') {
    const raid = await ports.raids.createForRaidNight(
      guildId,
      night.id,
      {
        name: night.name,
        instance: night.instance,
        kind: night.kind,
        size: night.size,
        roleTargets: night.roleTargets,
        startsAt: decision.startsAt,
        durationMinutes: night.durationMinutes,
      },
      `created from the poll for ${decision.label}`,
    );
    return { status: 'sent', detail: `created raid ${raid.id} for ${decision.label}` };
  }
  const ops = config.opsChannelId;
  const message = ops
    ? await ports.discord.post(ops, renderRaidNightUnresolved(night, poll, decision.reason))
    : null;
  await ports.store.updateRaidNight(guildId, night.id, {
    outcome: 'unresolved',
    detail: decision.reason,
  });
  return message
    ? { status: 'sent', detail: decision.reason, messageId: message.id }
    : { status: 'skipped', detail: `${decision.reason}; no ops channel to tell` };
}

/**
 * Settle raid-night polls that have closed: the winner becomes a raid, anything else is reported
 * to the ops channel. Claimed per poll like every action, so a raid is never created twice.
 */
async function resolveRaidNights(
  ports: TickPorts,
  config: CoordinatorConfig,
  now: number,
): Promise<TickOutcome[]> {
  const { guildId } = config;
  const outcomes: TickOutcome[] = [];
  for (const night of await ports.store.listRaidNights(guildId, { outcome: 'pending' })) {
    const poll = await ports.polls.get(guildId, night.pollId);
    const decision = decideRaidNight(poll, now);
    if (decision.kind === 'wait') continue;
    if (decision.kind === 'cancelled') {
      await ports.store.updateRaidNight(guildId, night.id, {
        outcome: 'cancelled',
        detail: 'the poll was cancelled',
      });
      continue;
    }
    const key = { guildId, eventId: night.pollId, rule: 'raid-night', target: night.pollId };
    const claimed = await ports.store.claimAction(key, now, CLAIM_STALE_MS);
    if (!claimed) {
      outcomes.push({ ...key, status: 'busy' });
      continue;
    }
    try {
      const done = await settleRaidNight(ports, config, night, poll, decision);
      await ports.store.completeAction(
        guildId,
        claimed.action.id,
        { status: done.status, discordMessageId: done.messageId ?? null, detail: done.detail },
        now,
      );
      outcomes.push({ ...key, status: done.status, detail: done.detail });
    } catch (err) {
      const detail = describe(err);
      await ports.store.completeAction(
        guildId,
        claimed.action.id,
        { status: 'failed', detail },
        now,
      );
      outcomes.push({ ...key, status: 'failed', detail });
    }
  }
  return outcomes;
}

export async function runTick(ports: TickPorts, guildId: string, now: number): Promise<TickReport> {
  const config = await ports.store.getConfig(guildId);
  if (config.paused) return { skipped: 'paused', outcomes: [] };
  if (!config.signupChannelId) return { skipped: 'no signup channel configured', outcomes: [] };

  // Raid nights first, so a raid made from a poll gets its signup post in this same tick.
  const settled = await resolveRaidNights(ports, config, now);
  await ports.raids.materialize(guildId);
  const state = await ports.source.load(guildId, now);
  const plan = planTick(
    state,
    now,
    (tick) => hashMessage(renderSignupPost(tick, state.members)),
    (tick, post) => hashServerEvent(serverEventFor(tick, post, ports)),
    (recorded) => hashMessage(renderRaidSummary(recorded)),
  );
  const outcomes: TickOutcome[] = [...settled];
  // In order: a raid's post goes out before its reminders, the lock before the final roster.
  for (const action of plan) {
    outcomes.push(
      action.kind === 'refresh'
        ? await refresh(action, state, ports)
        : action.kind === 'server-event-update'
          ? await updateServerEvent(action, state, ports)
          : action.kind === 'summary-update'
            ? await updateSummary(action, state, ports)
            : await execute(action, state, ports, now),
    );
  }
  outcomes.push(...(await runAssessment(ports, state, config, now)));
  return { outcomes };
}

/** The weekly roster and recruitment check (#130), claimed once per week like any action. */
async function runAssessment(
  ports: TickPorts,
  state: TickState,
  config: CoordinatorConfig,
  now: number,
): Promise<TickOutcome[]> {
  const rule = assessmentRule(now);
  const ops = config.opsChannelId;
  if (!config.weeklyAssessment || !ops || !rule) return [];
  const key = { guildId: state.guildId, eventId: 'assessment', rule, target: ops };
  const claimed = await ports.store.claimAction(key, now, CLAIM_STALE_MS);
  if (!claimed) return [];
  try {
    const needs = (await ports.recruiting?.needs(state.guildId)) ?? [];
    const assessment = buildAssessment(state.events, state.members, needs);
    const wording = await (
      ports.wording?.write(WORDING_INSTRUCTIONS, assessmentFacts(assessment)) ??
      Promise.resolve(null)
    ).catch(() => null);
    const sent = await ports.discord.post(ops, renderAssessment(assessment, wording));
    const detail = `${assessment.gaps.length} gaps, ${assessment.suggestions.length} suggestions${wording ? ', worded' : ''}`;
    await ports.store.completeAction(
      state.guildId,
      claimed.action.id,
      { status: 'sent', discordMessageId: sent.id, detail },
      now,
    );
    return [{ ...key, status: 'sent', detail }];
  } catch (err) {
    const detail = describe(err);
    await ports.store.completeAction(
      state.guildId,
      claimed.action.id,
      { status: 'failed', detail },
      now,
    );
    return [{ ...key, status: 'failed', detail }];
  }
}
