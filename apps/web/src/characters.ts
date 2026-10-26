import type { Character } from '@vintage/identity/contract';
import { roleLabel, titleCase } from '@vintage/ui-kit';

/** "Bloodfen Il · Warrior · Tank": a character by name, class, and raid role. */
export function characterLabel(c: Pick<Character, 'name' | 'class' | 'role'>): string {
  return `${c.name} · ${titleCase(c.class)} · ${roleLabel(c.role)}`;
}
