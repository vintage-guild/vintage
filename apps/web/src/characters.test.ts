import { describe, expect, it } from 'vitest';
import { characterLabel } from './characters';

describe('characterLabel', () => {
  it('reads name, class, and raid role', () => {
    expect(characterLabel({ name: 'Bloodfen Il', class: 'warrior', role: 'tank' })).toBe(
      'Bloodfen Il · Warrior · Tank',
    );
    expect(characterLabel({ name: 'Aeryn', class: 'priest', role: 'healer' })).toBe(
      'Aeryn · Priest · Healer',
    );
    expect(characterLabel({ name: 'Alaric', class: 'rogue', role: 'melee' })).toBe(
      'Alaric · Rogue · Melee DPS',
    );
    expect(characterLabel({ name: 'Morwenna', class: 'mage', role: 'ranged' })).toBe(
      'Morwenna · Mage · Ranged DPS',
    );
  });
});
