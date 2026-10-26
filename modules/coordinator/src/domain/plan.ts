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
import type { Signup } from '@vintage/raids/contract';
import type { CoordinatorAction } from '../contract';
import type { TickEvent, TickMember, TickState } from '../store';

const HOUR = 60 * 60 * 1000;

export type PlannedAction =
  | { kind: 'post'; tick: TickEvent; rule: 'post'; target: string }
  | { kind: 'refresh'; tick: TickEvent; post: CoordinatorAction }
  | { kind: 'promote'; tick: TickEvent; rule: string; target: string; signup: Signup }
  | { kind: 'remind'; tick: TickEvent; rule: string; target: string; waiting: TickMember[] }
  | { kind: 'dm'; tick: TickEvent; rule: string; target: string; member: TickMember }
  | { kind: 'digest'; tick: TickEvent; rule: 'digest'; target: string; waiting: TickMember[] }
  | { kind: 'lock'; tick: TickEvent; rule: 'lock'; target: string }
  | { kind: 'final-roster'; tick: TickEvent; rule: 'final-roster'; target: string }
  | { kind: 'import-string'; tick: TickEvent; rule: 'import-string'; target: string }
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

/** Expected members with no signup for the raid. */
export function nonResponders(state: TickState, tick: TickEvent): TickMember[] {
  const answered = new Set(tick.signups.map((s) => s.memberId));
  const expected = new Set(state.config.expectedRanks);
  return state.members
    .filter((m) => m.rank !== null && expected.has(m.rank) && !answered.has(m.memberId))
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
): PlannedAction[] {
  const channel = state.config.signupChannelId!;
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
      ? { kind: 'remind', tick, rule: `remind-${current}h`, target: channel, waiting }
      : {
          kind: 'skip',
          tick,
          rule: `remind-${current}h`,
          target: channel,
          reason: 'everyone answered',
        },
  );
  if (state.config.dmReminders && current === lastReminderHours(tick)) {
    for (const member of waiting) {
      if (member.dmOptOut || done.has(`dm-${current}h|${member.memberId}`)) continue;
      out.push({ kind: 'dm', tick, rule: `dm-${current}h`, target: member.memberId, member });
    }
  }
  return out;
}

/** One notice per promotion: the rule names the signup and when it was promoted. */
function planPromotions(state: TickState, tick: TickEvent, done: Set<string>): PlannedAction[] {
  const channel = state.config.signupChannelId!;
  return tick.signups
    .filter(
      (s) => s.promotedAt !== null && !s.queued && (s.status === 'accepted' || s.status === 'late'),
    )
    .map((s) => ({ s, rule: `promoted-${s.id}-${s.promotedAt}` }))
    .filter(({ rule }) => !done.has(`${rule}|${channel}`))
    .map(({ s, rule }) => ({ kind: 'promote' as const, tick, rule, target: channel, signup: s }));
}

function planDigest(
  state: TickState,
  tick: TickEvent,
  done: Set<string>,
  now: number,
): PlannedAction[] {
  const ops = state.config.opsChannelId;
  const dueAt = tick.event.startsAt - lastReminderHours(tick) * HOUR;
  if (!ops || now < dueAt || done.has(`digest|${ops}`)) return [];
  return [
    { kind: 'digest', tick, rule: 'digest', target: ops, waiting: nonResponders(state, tick) },
  ];
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
  if (!done.has(`lock|${event.id}`))
    out.push({ kind: 'lock', tick, rule: 'lock', target: event.id });
  const channel = state.config.signupChannelId!;
  if (!done.has(`final-roster|${channel}`)) {
    out.push({ kind: 'final-roster', tick, rule: 'final-roster', target: channel });
  }
  const ops = state.config.opsChannelId;
  if (ops && !done.has(`import-string|${ops}`)) {
    out.push({ kind: 'import-string', tick, rule: 'import-string', target: ops });
  }
  return out;
}

/** Every action due now, in the order they should happen. Nothing for a paused or unconfigured guild. */
export function planTick(
  state: TickState,
  now: number,
  renderHash: (tick: TickEvent) => string,
): PlannedAction[] {
  const channel = state.config.signupChannelId;
  if (state.config.paused || !channel) return [];
  const out: PlannedAction[] = [];
  for (const tick of state.events) {
    if (
      now >= tick.event.startsAt ||
      (tick.event.status !== 'open' && tick.event.status !== 'locked')
    ) {
      continue;
    }
    const done = settled(state.actions, tick.event.id);
    const post = state.actions.find(
      (a) => a.eventId === tick.event.id && a.rule === 'post' && a.status === 'sent',
    );
    if (!post) {
      out.push({ kind: 'post', tick, rule: 'post', target: channel });
      continue; // reminders reference the post; they wait for the next tick
    }
    if (post.renderHash !== renderHash(tick)) out.push({ kind: 'refresh', tick, post });
    out.push(
      ...planPromotions(state, tick, done),
      ...planReminders(state, tick, done, now),
      ...planDigest(state, tick, done, now),
      ...planLock(state, tick, done, now),
    );
  }
  return out;
}
