import { describe, expect, it } from 'vitest';
import { CLASS_NAMES, characterNameSchema, normalizeCharacterName, roleFor } from './index';

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
