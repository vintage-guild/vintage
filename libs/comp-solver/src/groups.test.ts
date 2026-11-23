import { describe, expect, it } from 'vitest';
import { type GroupMember, groupDraft } from './groups';

describe('groupDraft', () => {
  it('places 1 tank and 1 healer per group and preserves leader-assigned groups', () => {
    const members: GroupMember[] = [
      { id: 't1', role: 'tank', group: null },
      { id: 't2', role: 'tank', group: 2 },
      { id: 'h1', role: 'healer', group: null },
      { id: 'h2', role: 'healer', group: null },
      { id: 'm1', role: 'melee', group: null },
      { id: 'r1', role: 'ranged', group: null },
    ];
    const draft = groupDraft(members, { raidSize: 10, groupSize: 5 });
    expect(draft.groups).toHaveLength(2);
    expect(draft.assignments.get('t2')).toBe(2);
    expect(draft.assignments.get('t1')).toBe(1);
    expect(draft.outOfRange).toEqual([]);
    expect(draft.overflow).toEqual([]);
  });

  it('preserves leader-assigned groups past groupCount in outOfRange and collects extra players in overflow', () => {
    // 20-player raid (4 groups of 5) with 22 seated players:
    // - 20 fill groups 1..4
    // - 1 is in Group 6 (outOfRange after shrinking 40 -> 20)
    // - 2 unassigned players exceed capacity (overflow)
    const members: GroupMember[] = [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`,
        role: (i < 2 ? 'tank' : i < 6 ? 'healer' : 'melee') as GroupMember['role'],
        group: Math.floor(i / 5) + 1,
      })),
      { id: 'g6-a', role: 'ranged', group: 6 },
      { id: 'g6-b', role: 'healer', group: 6 },
      { id: 'extra-1', role: 'melee', group: null },
      { id: 'extra-2', role: 'ranged', group: null },
    ];
    const draft = groupDraft(members, { raidSize: 20, groupSize: 5 });
    expect(draft.groups).toHaveLength(4);
    expect(draft.groups.every((g) => g.ids.length === 5)).toBe(true);
    expect(draft.outOfRange).toEqual([{ group: 6, ids: ['g6-a', 'g6-b'] }]);
    expect(draft.assignments.get('g6-a')).toBe(6);
    expect(draft.overflow).toEqual(['extra-1', 'extra-2']);
  });
});
