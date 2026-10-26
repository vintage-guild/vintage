// Raid-night polls (#64): a raid leader offers a few start times, members vote, and the winning
// time becomes a raid. Pure: what a poll's result means for the raid, and the words around it.
import { discordTimestamp, type MessageData, TimestampStyle } from '@vintage/discord-kit';
import type { Poll } from '@vintage/polls/contract';
import type { RaidNight } from '../contract';

/** "Tue 10 Nov, 8:00 PM EST": short enough for a poll button, in the guild's time zone. */
export function startLabel(startsAt: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(new Date(startsAt));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')}`.trim();
}

/** The poll description: each candidate in every reader's own local time. */
export function candidateLines(name: string, startTimes: number[]): string {
  const lines = startTimes.map(
    (t, i) =>
      `${i + 1}. ${discordTimestamp(t, TimestampStyle.LONG_DATE_TIME)} (${discordTimestamp(t, TimestampStyle.RELATIVE)})`,
  );
  return [`Vote for when **${name}** happens. The winning time becomes the raid.`, ...lines].join(
    '\n',
  );
}

export type RaidNightDecision =
  | { kind: 'wait' }
  | { kind: 'cancelled' }
  | { kind: 'create'; startsAt: number; label: string }
  | { kind: 'unresolved'; reason: string };

/** What a raid-night poll's state means: keep waiting, make the raid, or tell officers why not. */
export function decideRaidNight(poll: Poll | null, now: number): RaidNightDecision {
  if (!poll) return { kind: 'unresolved', reason: 'its poll no longer exists' };
  if (poll.status === 'cancelled') return { kind: 'cancelled' };
  if (poll.status !== 'closed' || !poll.results) return { kind: 'wait' };
  const { results } = poll;
  if (results.ballots === 0) return { kind: 'unresolved', reason: 'nobody voted' };
  if (!results.quorumMet) {
    return {
      kind: 'unresolved',
      reason: `only ${results.ballots} voted, short of the quorum of ${poll.quorum}`,
    };
  }
  const label = (id: string) => poll.options.find((o) => o.id === id)?.label ?? id;
  if (results.winners.length !== 1) {
    return {
      kind: 'unresolved',
      reason: `it tied between ${results.winners.map(label).join(' and ')}`,
    };
  }
  const winner = poll.options.find((o) => o.id === results.winners[0]);
  const startsAt = Number(winner?.value);
  if (!winner || !Number.isFinite(startsAt)) {
    return { kind: 'unresolved', reason: 'the winning option has no start time' };
  }
  if (startsAt <= now) {
    return { kind: 'unresolved', reason: `the winning time, ${winner.label}, has already passed` };
  }
  return { kind: 'create', startsAt, label: winner.label };
}

/** For the ops channel: the poll closed but no raid was made, and what to do about it. */
export function renderRaidNightUnresolved(
  raidNight: RaidNight,
  poll: Poll | null,
  reason: string,
): MessageData {
  const question = poll ? `“${poll.question}”` : 'A raid-night poll';
  return {
    content:
      `${question} closed without a raid for **${raidNight.name}**: ${reason}. ` +
      'Pick a time and run `raid-create`, or start another poll with `raid-night-poll`.',
    allowed_mentions: { parse: [] },
  };
}
