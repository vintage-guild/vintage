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
