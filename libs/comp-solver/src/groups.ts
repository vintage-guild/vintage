// Placeholder party draft (signup-improvements §1a): places 1 tank and 1 healer per group where
// available, fills the rest by role, and preserves any group a leader already set with roster-move.
// Pure and deterministic.
import type { Role } from '@vintage/wow-data';

export interface GroupMember {
  id: string;
  role: Role;
  /** Existing leader-assigned group (1..groupCount), or null if unassigned. */
  group: number | null;
}

export interface PartyGroup {
  group: number;
  ids: string[];
}

export interface GroupDraftResult {
  /** Map of signup id -> assigned group number (1..groupCount, or > groupCount for preserved out-of-range groups). */
  assignments: Map<string, number>;
  /** Groups 1..groupCount in order, each with up to `groupSize` member ids. */
  groups: PartyGroup[];
  /** Leader-assigned groups past `groupCount` (e.g., Group 6 after shrinking 40 -> 20), preserved instead of dropped. */
  outOfRange: PartyGroup[];
  /** Seated member ids that did not fit into any group 1..groupCount (past raid capacity). */
  overflow: string[];
}

const ROLE_ORDER: readonly Role[] = ['tank', 'healer', 'melee', 'ranged'];

function keepPresetGroups(
  members: readonly GroupMember[],
  buckets: GroupMember[][],
  outOfRangeBuckets: Map<number, GroupMember[]>,
  assignments: Map<string, number>,
  groupSize: number,
): GroupMember[] {
  const unassigned: GroupMember[] = [];
  for (const m of members) {
    if (m.group !== null && Number.isInteger(m.group) && m.group > buckets.length) {
      const list = outOfRangeBuckets.get(m.group) ?? [];
      list.push(m);
      outOfRangeBuckets.set(m.group, list);
      assignments.set(m.id, m.group);
      continue;
    }
    const valid =
      m.group !== null &&
      Number.isInteger(m.group) &&
      m.group >= 1 &&
      m.group <= buckets.length &&
      buckets[m.group - 1]!.length < groupSize;
    if (valid && m.group !== null) {
      buckets[m.group - 1]!.push(m);
      assignments.set(m.id, m.group);
    } else {
      unassigned.push(m);
    }
  }
  return unassigned;
}

function seedRolePerGroup(
  unassigned: readonly GroupMember[],
  seedRole: 'tank' | 'healer',
  buckets: GroupMember[][],
  assignments: Map<string, number>,
  groupSize: number,
): void {
  for (const m of unassigned) {
    if (m.role !== seedRole || assignments.has(m.id)) continue;
    const idx = buckets.findIndex(
      (b) => b.length < groupSize && !b.some((x) => x.role === seedRole),
    );
    if (idx >= 0) {
      buckets[idx]!.push(m);
      assignments.set(m.id, idx + 1);
    }
  }
}

/**
 * Draft raid parties (groups 1..N, 5 per group by default).
 * 1. Keeps leader-set groups (when in range and the group has room).
 * 2. Places 1 tank per group without a tank.
 * 3. Places 1 healer per group without a healer.
 * 4. Fills remaining seats by role (tank, healer, melee, ranged) into the first group with room.
 */
export function groupDraft(
  members: readonly GroupMember[],
  options: { raidSize: number; groupSize?: number },
): GroupDraftResult {
  const groupSize = options.groupSize ?? 5;
  const groupCount = Math.max(1, Math.ceil(options.raidSize / groupSize));
  const buckets: GroupMember[][] = Array.from({ length: groupCount }, () => []);
  const outOfRangeBuckets = new Map<number, GroupMember[]>();
  const assignments = new Map<string, number>();

  const unassigned = keepPresetGroups(members, buckets, outOfRangeBuckets, assignments, groupSize);
  seedRolePerGroup(unassigned, 'tank', buckets, assignments, groupSize);
  seedRolePerGroup(unassigned, 'healer', buckets, assignments, groupSize);

  const remaining = unassigned
    .filter((m) => !assignments.has(m.id))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  const overflow: string[] = [];
  for (const m of remaining) {
    const idx = buckets.findIndex((b) => b.length < groupSize);
    if (idx >= 0) {
      buckets[idx]!.push(m);
      assignments.set(m.id, idx + 1);
    } else {
      overflow.push(m.id);
    }
  }

  const outOfRange: PartyGroup[] = [...outOfRangeBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([group, list]) => ({ group, ids: list.map((m) => m.id) }));

  return {
    assignments,
    groups: buckets.map((b, i) => ({ group: i + 1, ids: b.map((m) => m.id) })),
    outOfRange,
    overflow,
  };
}
