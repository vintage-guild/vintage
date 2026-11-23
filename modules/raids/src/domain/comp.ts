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
