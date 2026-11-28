import { type CompResult, type CompSignup, solveComp } from '@vintage/comp-solver';
import type { GuildRank } from '@vintage/identity/contract';
import type { RaidEvent, Signup } from '../contract';
import { compSize, eventTemplate } from './kinds';

/**
 * Comp and Standby priority by guild rank (signup-improvements §3): raiders and above first,
 * then recruits, then flex raiders, then members, then friends. `GUILD_RANKS` in identity is
 * unchanged.
 */
export const RANK_PRIORITY: Record<GuildRank, number> = {
  officer: 4,
  'raid-leader': 4,
  raider: 4,
  recruit: 3,
  'flex-raider': 2,
  member: 1,
  friend: 0,
};

const GOING = new Set(['accepted', 'late']);

/** Non-declined signups explicitly seated by a leader. */
export function rosteredSignups(signups: readonly Signup[]): Signup[] {
  return signups.filter((s) => s.roster === 'rostered' && s.status !== 'declined');
}

/**
 * Signups competing for a raid seat: leader-rostered non-declined signups, plus pending Going
 * (`accepted` / `late`) signups. Excludes voluntary Standby (`status: 'bench'`), tentative,
 * declined, and leader-benched (`roster: 'benched'`) signups.
 */
export function competingGoingSignups(signups: readonly Signup[]): Signup[] {
  return signups.filter(
    (s) =>
      (s.roster === 'rostered' && s.status !== 'declined') ||
      (s.roster === 'pending' && GOING.has(s.status)),
  );
}

/** True when explicitly rostered signups exceed `event.size`. */
export function isRosterOvercommitted(
  event: Pick<RaidEvent, 'size'>,
  signups: readonly Signup[],
): boolean {
  return event.size !== null && rosteredSignups(signups).length > event.size;
}

/**
 * True when more signups are competing for seats than `event.size` allows, so finalizing without
 * officer approval would force the bot to sit at least one Going signup on its own.
 */
export function isRosterOverCap(
  event: Pick<RaidEvent, 'size'>,
  signups: readonly Signup[],
): boolean {
  return event.size !== null && competingGoingSignups(signups).length > event.size;
}

/**
 * True once an officer's seating decision applies: someone is explicitly rostered, and either the
 * roster is approved, nobody is left waiting on a seat (`roster: 'pending'` and going), or
 * explicit seats already fill the raid. A sign-up has no cap before this: nothing may put a going
 * signup on Standby for capacity alone until an officer reviews and approves the roster, only a
 * member self-selecting it or an explicit leader bench (2026-11-27, reversing signup-improvements
 * row 23's capacity-based card Standby and its live private-reply counterpart, row 38).
 */
export function hasRosterDecision(
  event: Pick<RaidEvent, 'size' | 'rosterApprovedAt'>,
  signups: readonly Signup[],
): boolean {
  const rostered = rosteredSignups(signups);
  if (!rostered.length) return false;
  const pendingGoing = signups.some((s) => s.roster === 'pending' && GOING.has(s.status));
  const approved = event.rosterApprovedAt !== null;
  const fullByRoster = event.size !== null && rostered.length >= event.size;
  return approved || !pendingGoing || fullByRoster;
}

/**
 * Solve a raid's comp from its signups and member ranks (going-only by default):
 * - Leader-rostered signups get top priority (100) and count as accepted unless declined.
 * - Leader-benched signups stay on Standby (`bench`).
 * - Pending going signups fill remaining seats by requirements, role targets, and rank priority.
 */
export function solveEventComp(
  event: Pick<RaidEvent, 'kind' | 'size' | 'roleTargets'>,
  signups: readonly Signup[],
  ranks: ReadonlyMap<string, GuildRank | null>,
  { goingOnly = true }: { goingOnly?: boolean } = {},
): CompResult {
  const compSignups: CompSignup[] = signups.map((s) => {
    const rank = ranks.get(s.memberId);
    return {
      id: s.id,
      name: s.characterName,
      class: s.class,
      spec: s.spec,
      role: s.role,
      status:
        s.roster === 'benched'
          ? 'bench'
          : s.roster === 'rostered' && s.status !== 'declined'
            ? 'accepted'
            : s.status,
      priority: s.roster === 'rostered' ? 100 : rank ? RANK_PRIORITY[rank] : 0,
      signedUpAt: s.signedUpAt,
    };
  });
  const goingCount = compSignups.filter((s) =>
    goingOnly ? GOING.has(s.status) : s.status !== 'declined',
  ).length;
  return solveComp({
    raidSize: compSize(event, goingCount),
    template: eventTemplate(event),
    signups: compSignups,
    goingOnly,
  });
}
