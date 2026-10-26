import type { Character } from '@vintage/identity/contract';
import { titleCase } from '@vintage/ui-kit';

/** How a raid role reads to a member: Forever's specs are fuzzy, roles aren't. */
const ROLE_WORDS: Record<Character['role'], string> = {
  tank: 'Tank',
  healer: 'Healer',
  melee: 'Melee DPS',
  ranged: 'Ranged DPS',
};

/** "Bloodfen Il · Warrior · Tank": a character by name, class, and raid role. */
export function characterLabel(c: Pick<Character, 'name' | 'class' | 'role'>): string {
  return `${c.name} · ${titleCase(c.class)} · ${ROLE_WORDS[c.role] ?? titleCase(c.role)}`;
}
