import { z } from 'zod';

/** Raid roles used for comp and signups. */
export const ROLES = ['tank', 'healer', 'melee', 'ranged'] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

/**
 * Playable classes and their specs with the role each spec fills.
 * Starts from the nine launch-era classes; extend when Forever's class list is confirmed.
 */
export const CLASSES = {
  warrior: { arms: 'melee', fury: 'melee', protection: 'tank' },
  paladin: { holy: 'healer', protection: 'tank', retribution: 'melee' },
  hunter: { 'beast-mastery': 'ranged', marksmanship: 'ranged', survival: 'ranged' },
  rogue: { assassination: 'melee', combat: 'melee', subtlety: 'melee' },
  priest: { discipline: 'healer', holy: 'healer', shadow: 'ranged' },
  shaman: { elemental: 'ranged', enhancement: 'melee', restoration: 'healer' },
  mage: { arcane: 'ranged', fire: 'ranged', frost: 'ranged' },
  warlock: { affliction: 'ranged', demonology: 'ranged', destruction: 'ranged' },
  druid: { balance: 'ranged', feral: 'melee', 'feral-tank': 'tank', restoration: 'healer' },
} as const satisfies Record<string, Record<string, Role>>;

export type WowClass = keyof typeof CLASSES;
export type Spec<C extends WowClass = WowClass> = keyof (typeof CLASSES)[C] & string;

export const CLASS_NAMES = Object.keys(CLASSES) as WowClass[];
export const classSchema = z.enum(CLASS_NAMES as [WowClass, ...WowClass[]]);

/** The role a class/spec fills, or undefined when the spec doesn't belong to the class. */
export function roleFor(wowClass: WowClass, spec: string): Role | undefined {
  const specs: Record<string, Role> = CLASSES[wowClass];
  return Object.hasOwn(specs, spec) ? specs[spec] : undefined;
}

/** The raid roles a class can play, in `ROLES` order (one for mage, warlock, rogue, hunter). */
export function classRoles(wowClass: WowClass): Role[] {
  const played = new Set<Role>(Object.values(CLASSES[wowClass]));
  return ROLES.filter((r) => played.has(r));
}

/** Whether `value` is a class name (`warrior`, any case). */
export function isWowClass(value: string): value is WowClass {
  return Object.hasOwn(CLASSES, value);
}

/**
 * The other roles a character also plays, cleaned: roles its class can play, besides its main
 * role, each once, in `ROLES` order. Answers the roles the class can't play in `rejected`.
 */
export function cleanAlsoRoles(
  wowClass: WowClass,
  mainRole: Role,
  roles: readonly Role[],
): { alsoRoles: Role[]; rejected: Role[] } {
  const playable = new Set(classRoles(wowClass));
  const wanted = new Set(roles);
  return {
    alsoRoles: ROLES.filter((r) => wanted.has(r) && playable.has(r) && r !== mainRole),
    rejected: ROLES.filter((r) => wanted.has(r) && !playable.has(r)),
  };
}

/**
 * Character names on WoW: Forever: a first name of 2–12 letters and, since Forever gives
 * characters first and last names, an optional last name of 1–12 letters after one space
 * ("Bloodfen Il"). Capitalization is normalized by `normalizeCharacterName`.
 */
export const characterNameSchema = z
  .string()
  .trim()
  .regex(
    /^\p{L}{2,12}( \p{L}{1,12})?$/u,
    'a first name of 2–12 letters, then an optional last name',
  );

/** "bloodfen IL" → "Bloodfen Il": each part capitalized, the rest lowercase, one space. */
export function normalizeCharacterName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
