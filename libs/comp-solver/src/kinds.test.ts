import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defaultTemplate } from './catalog';
import {
  AKind,
  compSize,
  defaultRoleTargets,
  EVENT_KINDS,
  eventTemplate,
  KIND_SIZES,
  kindRules,
  sizeFits,
  sizeLabel,
  sizesText,
} from './kinds';
import { solveComp } from './solve';

describe('event kinds', () => {
  it('allows each kind its own sizes', () => {
    expect(KIND_SIZES).toEqual({ raid: [10, 20, 40], dungeon: [5], battleground: [10, 15, 40] });
    expect(sizeFits('raid', 15)).toBe(false);
    expect(sizeFits('battleground', 15)).toBe(true);
    expect(sizeFits('other', 1)).toBe(true);
    expect(sizeFits('other', 41)).toBe(false);
    expect(sizeFits('other', 2.5)).toBe(false);
    expect(sizesText('battleground')).toBe('10, 15 or 40');
    expect(sizesText('dungeon')).toBe('5');
    expect(AKind('other')).toBe('An event');
  });

  it('defaults the comp by kind, and every default fits its size', () => {
    expect(defaultRoleTargets('raid', 40)).toEqual(defaultTemplate(40).targets);
    expect(defaultRoleTargets('dungeon', 5)).toEqual({ tank: 1, healer: 1, dps: 3 });
    expect(defaultRoleTargets('battleground', 15)).toEqual({ tank: 0, healer: 3, dps: 12 });
    expect(defaultRoleTargets('other', 12)).toEqual({ tank: 0, healer: 0, dps: 0 });
    for (const kind of EVENT_KINDS) {
      const sizes = kind === 'other' ? [1, 7, 40] : KIND_SIZES[kind];
      for (const size of sizes) {
        const t = defaultRoleTargets(kind, size);
        expect(t.tank + t.healer + t.dps, `${kind} ${size}`).toBeLessThanOrEqual(size);
      }
    }
  });

  it('counts raid buffs only for raids', () => {
    expect(eventTemplate({ size: 10, roleTargets: null }).requirements?.length).toBeGreaterThan(0);
    const bg = eventTemplate({ kind: 'battleground', size: 10, roleTargets: null });
    expect(bg.requirements).toEqual([]);
    const result = solveComp({ raidSize: 10, template: bg, signups: [] });
    expect(result.gaps.some((g) => g.kind === 'requirement')).toBe(false);
  });

  it('solves a five-player dungeon', () => {
    const template = eventTemplate({ kind: 'dungeon', size: 5, roleTargets: null });
    const pick = {
      tank: ['warrior', 'protection'],
      healer: ['priest', 'holy'],
      ranged: ['mage', 'frost'],
      melee: ['rogue', 'combat'],
    } as const;
    const roles = ['tank', 'healer', 'ranged', 'ranged', 'melee', 'melee'] as const;
    const signups = roles.map((role, i) => ({
      id: `s${i}`,
      name: `P${i}`,
      class: pick[role][0],
      spec: pick[role][1],
      status: 'accepted' as const,
      signedUpAt: i,
    }));
    const result = solveComp({ raidSize: 5, template, signups });
    expect(result.selected).toHaveLength(5);
    expect(result.bench).toHaveLength(1);
    expect(result.gaps).toEqual([]);
  });

  it('lets only an "other" event be open, and solves an open one with everyone going', () => {
    expect(sizeFits('other', null)).toBe(true);
    expect(sizeFits('raid', null)).toBe(false);
    expect(sizeFits('dungeon', null)).toBe(false);
    expect(sizeLabel('other', null)).toBe('open event');
    expect(sizeLabel('dungeon', 5)).toBe('5-player dungeon');
    const open = { kind: 'other' as const, size: null, roleTargets: null };
    expect(compSize(open, 7)).toBe(7);
    expect(compSize(open, 0)).toBe(0);
    // Targets above the people going: solve at the targets, so the role gaps show.
    const tuned = { ...open, roleTargets: { tank: 1, healer: 1, dps: 3 } };
    expect(compSize(tuned, 2)).toBe(5);
    const result = solveComp({
      raidSize: compSize(tuned, 0),
      template: eventTemplate(tuned),
      signups: [],
    });
    expect(result.gaps.map((g) => g.reason)).toEqual([
      'need 1 tank',
      'need 1 healer',
      'need 3 dps',
    ]);
    // A sized event keeps its size whoever turns up.
    expect(compSize({ kind: 'dungeon', size: 5, roleTargets: null }, 9)).toBe(5);
  });

  it('kindRules asks every kind but other for a size and an instance', () => {
    const schema = z
      .object({
        kind: z.enum(EVENT_KINDS),
        size: z.number().nullable(),
        instance: z.string(),
      })
      .superRefine(kindRules);
    const paths = (input: unknown) => {
      const parsed = schema.safeParse(input);
      return parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'));
    };
    expect(paths({ kind: 'other', size: null, instance: '' })).toEqual([]);
    expect(paths({ kind: 'raid', size: null, instance: '' })).toEqual(['size', 'instance']);
    expect(paths({ kind: 'dungeon', size: 5, instance: 'SM' })).toEqual([]);
  });
});
