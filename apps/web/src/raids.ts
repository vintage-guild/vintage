// One raid on the site (#17): `/raids/<eventId>` shows a raid from `raid-get`, its signups from
// `signup-list`, and the comp from `comp-suggest`. This turns those answers into what the page
// and `vintage-raid-roster` show; the counts, the queue, and the gaps are the commands'.
import type { CommandResult } from '@vintage/guild-kit';
import { KIND_LABELS, kindOf, type RaidEvent, type Signup } from '@vintage/raids/contract';
import type { RaidRosterComp, RaidRosterCounts } from '@vintage/ui-kit';
import { formatDateTime } from './dates';

/** What `raid-get` answers: the raid, counts by answer, my signup, and (recruits up) the list. */
export interface RaidGet {
  event: RaidEvent;
  counts: RaidRosterCounts;
  mine: Signup | null;
  /** When Random locks signups, epoch ms; absent from a server older than #192. */
  locksAt?: number;
}

/** A `signup-list` row: `queuePosition` (1 is next) is absent from a server older than #192. */
export type SignupRow = Signup & { queuePosition?: number | null };

/** The slice of `comp-suggest`'s answer the page shows: the solver's counts and gaps. */
export interface CompSuggest {
  counts: Omit<RaidRosterComp, 'gaps'>;
  gaps: { reason: string }[];
}

/** The raid id in `/raids/<id>`, or empty. */
export function raidIdFromPath(path: string): string {
  const match = /^\/?raids\/([^/?#]+)\/?$/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

/** The page for one raid. */
export const raidHref = (eventId: string) => `/raids/${encodeURIComponent(eventId)}`;

const STATUS_WORDS: Record<string, string> = {
  open: 'signups open',
  locked: 'locked · roster posted',
  cancelled: 'cancelled',
  completed: 'done',
};

export const statusWords = (status: string) => STATUS_WORDS[status] ?? status;

/** Open and locked raids still take the member's answer (locked ones say so when tried). */
export const takesAnswers = (event: RaidEvent) =>
  event.status === 'open' || event.status === 'locked';

/** "Raid", "Dungeon": the page's eyebrow. */
export const kindLabel = (event: RaidEvent) => KIND_LABELS[kindOf(event)];

/**
 * "Wed, Nov 4, 8:00 PM EST · Molten Core · 40 players · signups lock Tue 8:00 PM EST", in the
 * member's zone. `lock` is `lockLabel`'s line; without one the status says it.
 */
export function raidFacts(event: RaidEvent, timeZone?: string, lock = ''): string {
  const size = event.size === null ? 'open, no cap' : `${event.size} players`;
  const status = lock || statusWords(event.status);
  return [formatDateTime(event.startsAt, timeZone), event.instance, size, status]
    .filter(Boolean)
    .join(' · ');
}

/** The roster element's comp: the solver's counts and its gaps' reasons. */
export function rosterComp(got: CompSuggest): RaidRosterComp {
  const { selected, raidSize, tank, healer, dps } = got.counts;
  return { selected, raidSize, tank, healer, dps, gaps: got.gaps.map((g) => g.reason) };
}

/**
 * What to say in place of a read the member can't make. The server answers a command above the
 * caller's tier as unknown (`COMMAND_NOT_FOUND`), so that is the rank note; anything else is a
 * failure and says what went wrong.
 */
export function refusedNote(
  result: CommandResult<unknown>,
  rankNote: string,
  what: string,
): string {
  if (result.success) return '';
  if (result.error?.code === 'COMMAND_NOT_FOUND') return rankNote;
  return `Couldn’t read ${what}: ${result.error?.message ?? 'no answer'}.`;
}
