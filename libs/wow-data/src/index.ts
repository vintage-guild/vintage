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

/** Character names: 2–12 letters, WoW-style capitalization is normalized by the caller. */
export const characterNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(12)
  .regex(/^\p{L}+$/u, 'letters only');
