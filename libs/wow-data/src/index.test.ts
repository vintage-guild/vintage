import { describe, expect, it } from 'vitest';
import {
  CLASS_NAMES,
  CLASSES,
  characterNameSchema,
  classRoles,
  cleanAlsoRoles,
  isWowClass,
  normalizeCharacterName,
  roleFor,
  SPEC_ICONS,
  specIcon,
} from './index';

describe('spec icons', () => {
  it('cover every spec, and fall back to the class icon', () => {
    for (const c of CLASS_NAMES) {
      expect(Object.keys(SPEC_ICONS[c]).sort()).toEqual(Object.keys(CLASSES[c]).sort());
    }
    expect(specIcon('warrior', 'protection')).toBe('ability_warrior_defensivestance');
    expect(specIcon('warrior', 'gladiator')).toBe('classicon_warrior');
    expect(specIcon('monk', 'mistweaver')).toBeNull();
  });
});

describe('wow-data', () => {
  it('maps class + spec to a raid role', () => {
    expect(roleFor('druid', 'restoration')).toBe('healer');
    expect(roleFor('warrior', 'protection')).toBe('tank');
    expect(roleFor('mage', 'frost')).toBe('ranged');
  });

  it('rejects a spec from another class', () => {
    expect(roleFor('mage', 'holy')).toBeUndefined();
    expect(roleFor('rogue', 'constructor')).toBeUndefined();
  });

  it('lists the roles each class can play', () => {
    expect(classRoles('druid')).toEqual(['tank', 'healer', 'melee', 'ranged']);
    expect(classRoles('shaman')).toEqual(['healer', 'melee', 'ranged']);
    expect(classRoles('mage')).toEqual(['ranged']);
    expect(isWowClass('rogue')).toBe(true);
    expect(isWowClass('Rogue')).toBe(false);
  });

  it('cleans the other roles a character plays', () => {
    expect(cleanAlsoRoles('shaman', 'healer', ['ranged', 'healer', 'melee', 'ranged'])).toEqual({
      alsoRoles: ['melee', 'ranged'],
      rejected: [],
    });
    expect(cleanAlsoRoles('mage', 'ranged', ['tank'])).toEqual({
      alsoRoles: [],
      rejected: ['tank'],
    });
  });

  it('lists the nine launch classes', () => {
    expect(CLASS_NAMES).toHaveLength(9);
  });

  it('validates character names', () => {
    expect(characterNameSchema.safeParse('Aeryn').success).toBe(true);
    expect(characterNameSchema.safeParse('Zoë').success).toBe(true);
    expect(characterNameSchema.safeParse('Bloodfen Il').success).toBe(true);
    expect(characterNameSchema.safeParse('A').success).toBe(false);
    expect(characterNameSchema.safeParse('Aeryn2').success).toBe(false);
    expect(characterNameSchema.safeParse('Bloodfen  Il').success).toBe(false);
    expect(characterNameSchema.safeParse('Bloodfen Il Iii').success).toBe(false);
    expect(normalizeCharacterName(' bloodfen   IL ')).toBe('Bloodfen Il');
    expect(normalizeCharacterName('AERYN')).toBe('Aeryn');
  });
});
