// Decides what the coordinator should do right now (PLAN §6.1). Pure: given the state and the
// clock it lists actions; the executor (tick.ts) performs and logs them. Rules per raid:
//   post           once, as soon as the raid exists (events exist only inside the lead window)
//   refresh        edit the post when what it would show has changed (not logged as an action)
//   promoted-…     when someone moves up from the queue, tell them in the signup channel
//   remind-<h>h    at each reminder offset before lock, ping only the non-responders
//   dm-<h>h        at the last reminder, DM non-responders who haven't opted out (if enabled)
//   digest         at the last reminder, comp gaps and non-responders to the officer channel
//   lock           at the lock offset: signups lock
//   final-roster   after lock, the roster to the signup channel
//   import-string  after lock, the addon import string to the officer channel
//   server-event   if `serverEvents`, once the post is up: a Discord server event for the raid;
//                  edited when the raid moves or is renamed (not logged, like refresh)
//   server-event-cancel  the raid was cancelled: its server event is set to CANCELED. A finished
//                  raid's event is left alone; Discord completes EXTERNAL events at their end time.
//   raid-summary   once an officer records the addon's export: how the bosses went, who came, and
//                  what dropped, to the signup channel; edited when a different export replaces
//                  it (not logged, like refresh)
import {
  accessOf,
  isRosterOverCap,
  isRosterOvercommitted,
  kindOf,
  type RaidEvent,
  type Signup,
} from '@vintage/raids/contract';
import type { AnnouncedMemberState, CoordinatorAction, CoordinatorConfig } from '../contract';
import type { TickEvent, TickMember, TickRecorded, TickState } from '../store';
import { type DropoutAlert, diffEventChanges } from './changes';
import { finalRoster, hashJson } from './render';
import { MAX_SERVER_EVENTS } from './server-event';

const HOUR = 60 * 60 * 1000;

/** Channel for a raid's signup post, party post, final roster, mentions, and summary. */
export function signupChannelFor(
  config: CoordinatorConfig,
  event: Pick<RaidEvent, 'access'>,
): string | null {
  return accessOf(event) === 'open'
    ? (config.openSignupChannelId ?? config.signupChannelId)
    : config.signupChannelId;
}

/** Channel for raid-lead messages (digest, party draft, change alerts, import string). */
export function leadsChannelFor(config: CoordinatorConfig): string | null {
  return config.leadsChannelId ?? config.opsChannelId;
}

export type PlannedAction =
  | { kind: 'post'; tick: TickEvent; rule: 'post'; target: string }
  | { kind: 'refresh'; tick: TickEvent; post: CoordinatorAction }
  | { kind: 'promote'; tick: TickEvent; rule: string; target: string; signup: Signup }
  | {
      kind: 'remind';
      tick: TickEvent;
      rule: string;
      target: string;
      waiting: TickMember[];
      /** Roles to ping instead of the non-responders; empty pings the people. */
      roleIds: string[];
    }
  | {
      kind: 'dm';
      tick: TickEvent;
      rule: string;
      target: string;
      member: TickMember;
      /** The signup post, so the DM can link straight to it. */
      post: CoordinatorAction;
    }
  | { kind: 'digest'; tick: TickEvent; rule: 'digest'; target: string; waiting: TickMember[] }
  | {
      kind: 'dropout';
      tick: TickEvent;
      rule: string;
      target: string;
      dropout: DropoutAlert;
    }
  | {
      kind: 'change-feed';
      tick: TickEvent;
      rule: string;
      target: string;
      lines: string[];
      changedRows: AnnouncedMemberState[];
    }
  | { kind: 'party-draft'; tick: TickEvent; rule: 'party-draft'; target: string; locked: boolean }
  | { kind: 'party-draft-update'; tick: TickEvent; draft: CoordinatorAction; locked: boolean }
  | { kind: 'party-post'; tick: TickEvent; rule: 'party-post'; target: string; locked: boolean }
  | {
      kind: 'party-post-update';
      tick: TickEvent;
      partyPost: CoordinatorAction;
      locked: boolean;
    }
  | { kind: 'unapproved-notice'; tick: TickEvent; rule: 'unapproved-notice'; target: string }
  | { kind: 'overcap-approval'; tick: TickEvent; rule: 'overcap-approval'; target: string }
  | { kind: 'overcommitted-notice'; tick: TickEvent; rule: 'overcommitted-notice'; target: string }
  | {
      kind: 'open-seats';
      tick: TickEvent;
      rule: string;
      target: string;
      reason?: 'lock' | 'grew';
    }
  | { kind: 'lock'; tick: TickEvent; rule: 'lock'; target: string }
  | { kind: 'final-roster'; tick: TickEvent; rule: 'final-roster'; target: string }
  | { kind: 'import-string'; tick: TickEvent; rule: 'import-string'; target: string }
  | {
      kind: 'server-event';
      tick: TickEvent;
      rule: 'server-event';
      target: string;
      post: CoordinatorAction;
    }
  /** Edit the server event in place; like refresh, not logged as an action. */
  | {
      kind: 'server-event-update';
      tick: TickEvent;
      serverEvent: CoordinatorAction;
      post: CoordinatorAction;
    }
  | {
      kind: 'server-event-cancel';
      tick: TickEvent;
      rule: 'server-event-cancel';
      target: string;
      serverEvent: CoordinatorAction;
    }
  | {
      kind: 'summary';
      tick: TickEvent;
      rule: 'raid-summary';
      target: string;
      recorded: TickRecorded;
    }
  /** Redraw a cancelled raid's signup post as cancelled (no buttons); like refresh, not logged. */
  | { kind: 'cancelled-card'; tick: TickEvent; post: CoordinatorAction }
  /** Edit the summary in place when the record changed; like refresh, not logged. */
  | { kind: 'summary-update'; tick: TickEvent; summary: CoordinatorAction; recorded: TickRecorded }
  /** Logged without sending: a reminder overtaken by a later one, or nothing to say. */
  | { kind: 'skip'; tick: TickEvent; rule: string; target: string; reason: string };

/** Actions already settled (sent or skipped) for an event, keyed `rule|target`. */
function settled(actions: CoordinatorAction[], eventId: string): Set<string> {
  return new Set(
    actions
      .filter((a) => a.eventId === eventId && (a.status === 'sent' || a.status === 'skipped'))
      .map((a) => `${a.rule}|${a.target}`),
  );
}

/** Expected members with no signup (and not covered as away by an absence) for the raid. */
export function nonResponders(state: TickState, tick: TickEvent): TickMember[] {
  const answered = new Set(tick.signups.map((s) => s.memberId));
  const away = new Set((tick.away ?? []).map((a) => a.memberId));
  const expected = new Set(state.config.expectedRanks);
  return state.members
    .filter(
      (m) =>
        m.rank !== null &&
        expected.has(m.rank) &&
        !answered.has(m.memberId) &&
        !away.has(m.memberId),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** The smallest reminder offset; digests and DMs go out then. Defaults to 24h. */
const lastReminderHours = (tick: TickEvent) =>
  tick.timings.reminderHours.length ? Math.min(...tick.timings.reminderHours) : 24;

function planReminders(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  now: number,
  post: CoordinatorAction,
): PlannedAction[] {
  // Open raids expect nobody and send no reminders or DMs (signup-improvements row 26).
  if (accessOf(tick.event) === 'open') return [];
  const channel = signupChannelFor(state.config, tick.event);
  if (!channel) return [];
  const { startsAt } = tick.event;
  const lockAt = startsAt - tick.timings.lockHours * HOUR;
  if (now >= lockAt) return [];
  const due = tick.timings.reminderHours
    .filter((h) => now >= startsAt - h * HOUR && !done.has(`remind-${h}h|${channel}`))
    .sort((a, b) => a - b);
  if (!due.length) return [];

  // Only the most recent due reminder goes out; earlier ones it overtook are logged as skipped.
  const [current, ...overtaken] = due as [number, ...number[]];
  const waiting = nonResponders(state, tick);
  const out: PlannedAction[] = overtaken.map((h) => ({
    kind: 'skip',
    tick,
    rule: `remind-${h}h`,
    target: channel,
    reason: `overtaken by the ${current}h reminder`,
  }));
  out.push(
    waiting.length
      ? {
          kind: 'remind',
          tick,
          rule: `remind-${current}h`,
          target: channel,
          waiting,
          roleIds: state.config.reminderRoleIds,
        }
      : {
          kind: 'skip',
          tick,
          rule: `remind-${current}h`,
          target: channel,
          reason: 'everyone answered',
        },
  );
  if (state.config.dmReminders && current === lastReminderHours(tick)) {
    out.push(...planDms(state, tick, done, current, waiting, post));
  }
  return out;
}

/** Reminder DMs at the last reminder: non-responders who allow DMs and pass the rank filter. */
function planDms(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  hours: number,
  waiting: TickMember[],
  post: CoordinatorAction,
): PlannedAction[] {
  // A DM rank filter (e.g. officers only while testing) leaves everyone else un-DMed.
  const ranks = state.config.dmRanks ? new Set(state.config.dmRanks) : null;
  return waiting
    .filter(
      (m) =>
        !m.dmOptOut &&
        !done.has(`dm-${hours}h|${m.memberId}`) &&
        (!ranks || (m.rank !== null && ranks.has(m.rank))),
    )
    .map((member) => ({
      kind: 'dm',
      tick,
      rule: `dm-${hours}h`,
      target: member.memberId,
      member,
      post,
    }));
}

/** Queue auto-promotion was retired in favor of comp-based seating and leader Standby picks. */
function planPromotions(_state: TickState, _tick: TickEvent, _done: Set<string>): PlannedAction[] {
  return [];
}

function planDigest(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  now: number,
): PlannedAction[] {
  const leads = leadsChannelFor(state.config);
  const digestHours = tick.timings.digestHours ?? 24;
  const dueAt = tick.event.startsAt - digestHours * HOUR;
  if (!leads || now < dueAt || done.has(`digest|${leads}`)) return [];
  return [
    { kind: 'digest', tick, rule: 'digest', target: leads, waiting: nonResponders(state, tick) },
  ];
}

function planChanges(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  now: number,
): PlannedAction[] {
  // Change feed runs only for raids, after the T-24h digest has posted (signup-improvements §4).
  if (kindOf(tick.event) !== 'raid' || state.announced === undefined) return [];
  const leads = leadsChannelFor(state.config);
  if (!leads || !sentAction(state, tick.event.id, 'digest')) return [];
  const previous = state.announced.filter((r) => r.eventId === tick.event.id);
  const diff = diffEventChanges(state.guildId, tick, state.members, previous, now);
  const out: PlannedAction[] = [];
  const dropoutMembers = new Set<string>();
  for (const dropout of diff.dropouts) {
    dropoutMembers.add(dropout.memberId);
    const key = hashJson({
      m: dropout.memberId,
      r: dropout.role,
      s: dropout.nextState.status,
      u: dropout.nextState.updatedAt,
    });
    const rule = `dropout-${dropout.memberId}-${key}`;
    if (!done.has(`${rule}|${leads}`)) {
      out.push({ kind: 'dropout', tick, rule, target: leads, dropout });
    }
  }
  if (diff.lines.length > 0) {
    const rule = `changes-${hashJson(diff.lines)}`;
    if (!done.has(`${rule}|${leads}`)) {
      out.push({
        kind: 'change-feed',
        tick,
        rule,
        target: leads,
        lines: diff.lines,
        changedRows: diff.changedRows.filter((r) => !dropoutMembers.has(r.memberId)),
      });
    }
  }
  if (diff.openSeatsOpened) {
    const rule = `open-seats-${hashJson({ size: tick.event.size, u: tick.event.updatedAt ?? 0 })}`;
    if (!done.has(`${rule}|${leads}`)) {
      out.push({ kind: 'open-seats', tick, rule, target: leads, reason: 'grew' });
    }
  }
  return out;
}

/** True when explicitly rostered players or `finalRoster` going count exceed `event.size`. */
function isOvercommitted(state: TickState, tick: TickEvent): boolean {
  if (tick.event.size === null) return false;
  if (isRosterOvercommitted(tick.event, tick.signups)) return true;
  return finalRoster(tick, state.members).going.length > tick.event.size;
}

/**
 * True when an unapproved event has more Going signups competing for seats than `event.size`,
 * so posting automatically at lock would force the bot to sit someone without officer approval.
 */
function needsApprovalAtLock(tick: TickEvent): boolean {
  return tick.event.rosterApprovedAt === null && isRosterOverCap(tick.event, tick.signups);
}

function planPartyDraft(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  now: number,
  locked: boolean,
  partyDraftHash?: (tick: TickEvent, locked: boolean) => string,
): PlannedAction[] {
  const leads = leadsChannelFor(state.config);
  if (!leads) return [];
  const draft = sentAction(state, tick.event.id, 'party-draft');
  const isRaid = kindOf(tick.event) === 'raid';
  const heldForApproval =
    locked &&
    tick.event.rosterApprovedAt === null &&
    (needsApprovalAtLock(tick) || isOvercommitted(state, tick));
  if (!draft) {
    if (done.has(`party-draft|${leads}`) || tick.event.rosterApprovedAt !== null) {
      return [];
    }
    const dueAt = tick.event.startsAt - (tick.timings.digestHours ?? 24) * HOUR;
    const dueForRaid = isRaid && now >= dueAt && !locked;
    if (!dueForRaid && !heldForApproval) return [];
    return [{ kind: 'party-draft', tick, rule: 'party-draft', target: leads, locked }];
  }
  if (partyDraftHash && draft.renderHash !== partyDraftHash(tick, locked)) {
    return [{ kind: 'party-draft-update', tick, draft, locked }];
  }
  return [];
}

function planPartyPost(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  locked: boolean,
  partyPostHash?: (tick: TickEvent, locked: boolean) => string,
): PlannedAction[] {
  if (kindOf(tick.event) !== 'raid') return [];
  const channel = signupChannelFor(state.config, tick.event);
  if (!channel || tick.event.rosterApprovedAt === null) return [];
  // Never post or promote a public party post while seated count exceeds event.size.
  if (isOvercommitted(state, tick)) return [];
  const partyPost = sentAction(state, tick.event.id, 'party-post');
  if (!partyPost) {
    return done.has(`party-post|${channel}`)
      ? []
      : [{ kind: 'party-post', tick, rule: 'party-post', target: channel, locked }];
  }
  if (partyPostHash && partyPost.renderHash !== partyPostHash(tick, locked)) {
    return [{ kind: 'party-post-update', tick, partyPost, locked }];
  }
  return [];
}

function planParties(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  now: number,
  partyDraftHash?: (tick: TickEvent, locked: boolean) => string,
  partyPostHash?: (tick: TickEvent, locked: boolean) => string,
): PlannedAction[] {
  const lockAt = tick.event.startsAt - tick.timings.lockHours * HOUR;
  const locked = now >= lockAt || tick.event.status === 'locked';
  return [
    ...planPartyDraft(state, tick, done, now, locked, partyDraftHash),
    ...planPartyPost(state, tick, done, locked, partyPostHash),
  ];
}

function planLockHold(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  leads: string | null,
): PlannedAction[] | null {
  if (isOvercommitted(state, tick)) {
    return leads && !done.has(`overcommitted-notice|${leads}`)
      ? [{ kind: 'overcommitted-notice', tick, rule: 'overcommitted-notice', target: leads }]
      : [];
  }
  if (needsApprovalAtLock(tick)) {
    return leads && !done.has(`overcap-approval|${leads}`)
      ? [{ kind: 'overcap-approval', tick, rule: 'overcap-approval', target: leads }]
      : [];
  }
  return null;
}

function planLockLeadsFollowups(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  leads: string,
): PlannedAction[] {
  const { event } = tick;
  const out: PlannedAction[] = [];
  if (
    kindOf(event) === 'raid' &&
    event.rosterApprovedAt === null &&
    !done.has(`unapproved-notice|${leads}`)
  ) {
    out.push({ kind: 'unapproved-notice', tick, rule: 'unapproved-notice', target: leads });
  }
  if (event.size !== null && !done.has(`lock-open-seats|${leads}`)) {
    const { going, bench } = finalRoster(tick, state.members);
    if (going.length < event.size && bench.length > 0) {
      out.push({ kind: 'open-seats', tick, rule: 'lock-open-seats', target: leads });
    }
  }
  if (!done.has(`import-string|${leads}`)) {
    out.push({ kind: 'import-string', tick, rule: 'import-string', target: leads });
  }
  return out;
}

function planLock(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  now: number,
): PlannedAction[] {
  const { event, timings } = tick;
  if (now < event.startsAt - timings.lockHours * HOUR) return [];
  const out: PlannedAction[] = [];
  if (!done.has(`lock|${event.id}`)) {
    out.push({ kind: 'lock', tick, rule: 'lock', target: event.id });
  }
  const leads = leadsChannelFor(state.config);
  const held = planLockHold(state, tick, done, leads);
  if (held !== null) {
    out.push(...held);
    return out;
  }
  const channel = signupChannelFor(state.config, event);
  const approvedRaid = kindOf(event) === 'raid' && event.rosterApprovedAt !== null;
  // An approved raid's party post becomes the final roster in place; otherwise post 4-column roster.
  if (channel && !approvedRaid && !done.has(`final-roster|${channel}`)) {
    out.push({ kind: 'final-roster', tick, rule: 'final-roster', target: channel });
  }
  if (leads) out.push(...planLockLeadsFollowups(state, tick, done, leads));
  return out;
}

const sentAction = (state: TickState, eventId: string, rule: string) =>
  state.actions.find((a) => a.eventId === eventId && a.rule === rule && a.status === 'sent');

/**
 * Server events (`serverEvents`): create one per posted raid, edit it when the raid changes, and
 * cancel it when the raid is cancelled. At most MAX_SERVER_EVENTS exist at once, well under
 * Discord's 100; raids past the cap get theirs as earlier ones finish.
 */
function planServerEvents(
  state: TickState,
  now: number,
  serverEventHash: (tick: TickEvent, post: CoordinatorAction) => string,
): PlannedAction[] {
  const out: PlannedAction[] = [];
  const live = state.events.filter(
    (t) => now < t.event.startsAt && (t.event.status === 'open' || t.event.status === 'locked'),
  );
  let held = live.filter((t) => sentAction(state, t.event.id, 'server-event')).length;
  for (const tick of live) {
    const post = sentAction(state, tick.event.id, 'post');
    if (!post) continue; // the event links to the post; it follows on the next tick
    const serverEvent = sentAction(state, tick.event.id, 'server-event');
    if (!serverEvent) {
      if (held >= MAX_SERVER_EVENTS) continue;
      held++;
      out.push({ kind: 'server-event', tick, rule: 'server-event', target: tick.event.id, post });
    } else if (serverEvent.renderHash !== serverEventHash(tick, post)) {
      out.push({ kind: 'server-event-update', tick, serverEvent, post });
    }
  }
  for (const tick of state.cancelled ?? []) {
    const serverEvent = sentAction(state, tick.event.id, 'server-event');
    if (
      !serverEvent ||
      settled(state.actions, tick.event.id).has(`server-event-cancel|${tick.event.id}`)
    ) {
      continue;
    }
    out.push({
      kind: 'server-event-cancel',
      tick,
      rule: 'server-event-cancel',
      target: tick.event.id,
      serverEvent,
    });
  }
  return out;
}

/** A summary per recorded raid, posted once and edited when what it would show changes. */
function planSummaries(
  state: TickState,
  summaryHash: (recorded: TickRecorded) => string,
): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const recorded of state.recorded ?? []) {
    const { tick } = recorded;
    const channel = signupChannelFor(state.config, tick.event);
    if (!channel) continue;
    const summary = sentAction(state, tick.event.id, 'raid-summary');
    if (!summary) {
      out.push({ kind: 'summary', tick, rule: 'raid-summary', target: channel, recorded });
    } else if (summary.renderHash !== summaryHash(recorded)) {
      out.push({ kind: 'summary-update', tick, summary, recorded });
    }
  }
  return out;
}

function planEvent(
  state: TickState,
  tick: TickEvent,
  now: number,
  renderHash: (tick: TickEvent) => string,
  partyDraftHash?: (tick: TickEvent, locked: boolean) => string,
  partyPostHash?: (tick: TickEvent, locked: boolean) => string,
): PlannedAction[] {
  if (
    now >= tick.event.startsAt ||
    (tick.event.status !== 'open' && tick.event.status !== 'locked')
  ) {
    return [];
  }
  const channel = signupChannelFor(state.config, tick.event);
  if (!channel) return [];
  const post = sentAction(state, tick.event.id, 'post');
  if (!post) {
    return [{ kind: 'post', tick, rule: 'post', target: channel }]; // reminders reference the post; they wait for the next tick
  }
  const done = settled(state.actions, tick.event.id);
  const out: PlannedAction[] = [];
  if (post.renderHash !== renderHash(tick)) out.push({ kind: 'refresh', tick, post });
  out.push(
    ...planPromotions(state, tick, done),
    ...planReminders(state, tick, done, now, post),
    ...planDigest(state, tick, done, now),
    ...planChanges(state, tick, done, now),
    ...planParties(state, tick, done, now, partyDraftHash, partyPostHash),
    ...planLock(state, tick, done, now),
  );
  return out;
}

/** Every action due now, in the order they should happen. Nothing for a paused or unconfigured guild. */
export function planTick(
  state: TickState,
  now: number,
  renderHash: (tick: TickEvent) => string,
  /** Hash of the server event a raid should have; needed only when `serverEvents` is on. */
  serverEventHash?: (tick: TickEvent, post: CoordinatorAction) => string,
  /** Hash of the summary a recorded raid should have; needed only when `recorded` has raids. */
  summaryHash?: (recorded: TickRecorded) => string,
  partyDraftHash?: (tick: TickEvent, locked: boolean) => string,
  partyPostHash?: (tick: TickEvent, locked: boolean) => string,
  /** Hash of a cancelled raid's post; needed only when `cancelled` has raids. */
  cancelledHash?: (tick: TickEvent) => string,
): PlannedAction[] {
  if (state.config.paused || !state.config.signupChannelId) return [];
  const out: PlannedAction[] = [];
  for (const tick of state.events) {
    out.push(...planEvent(state, tick, now, renderHash, partyDraftHash, partyPostHash));
  }
  if (state.config.serverEvents && serverEventHash) {
    out.push(...planServerEvents(state, now, serverEventHash));
  }
  if (summaryHash) out.push(...planSummaries(state, summaryHash));
  if (cancelledHash) out.push(...planCancelledCards(state, cancelledHash));
  return out;
}

/** A cancelled raid's signup post loses its buttons and says so, once (its hash then matches). */
function planCancelledCards(
  state: TickState,
  cancelledHash: (tick: TickEvent) => string,
): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const tick of state.cancelled ?? []) {
    const post = sentAction(state, tick.event.id, 'post');
    if (post && post.renderHash !== cancelledHash(tick)) {
      out.push({ kind: 'cancelled-card', tick, post });
    }
  }
  return out;
}
