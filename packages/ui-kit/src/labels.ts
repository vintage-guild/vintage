import { CLASS_NAMES, ROLES, type Role, type WowClass } from '@vintage/wow-data';

/** `beast-mastery` → `Beast Mastery`: display text for wow-data's kebab-case ids. */
export function titleCase(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const isWowClass = (value: string): value is WowClass =>
  (CLASS_NAMES as string[]).includes(value);

export const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

/** How a raid role reads to a member. Forever's specs are fuzzy; class and role aren't. */
const ROLE_WORDS: Record<string, string> = {
  tank: 'Tank',
  healer: 'Healer',
  melee: 'Melee DPS',
  ranged: 'Ranged DPS',
};

/** `melee` → `Melee DPS`; an unknown role falls back to title case. */
export function roleLabel(role: string): string {
  return ROLE_WORDS[role] ?? titleCase(role);
}
