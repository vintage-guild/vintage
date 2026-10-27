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

/** The coordinator's rule names (modules/coordinator plan.ts), by prefix: done, and to do. */
const RULE_WORDS: [prefix: string, done: string, todo: string][] = [
  ['post', 'Posted the signups', 'Post the signups'],
  ['refresh', 'Updated the signup post', 'Update the signup post'],
  ['remind', 'Reminded the people who haven’t answered', 'Remind the people who haven’t answered'],
  ['dm', 'Sent reminder DMs', 'Send reminder DMs'],
  ['digest', 'Sent officers the comp digest', 'Send officers the comp digest'],
  ['lock', 'Locked the roster', 'Lock the roster'],
  ['final', 'Posted the final roster', 'Post the final roster'],
  ['import', 'Sent officers the addon import string', 'Send officers the addon import string'],
  ['promote', 'Told the next in line a spot opened', 'Tell the next in line a spot opened'],
];

/**
 * `remind-72h` → "Reminded the people who haven’t answered", or "Remind …" for something
 * still to do; an unknown rule, title-cased.
 */
export function ruleWords(rule: string, form: 'done' | 'todo' = 'done'): string {
  const words = RULE_WORDS.find(([prefix]) => rule.startsWith(prefix));
  if (!words) return titleCase(rule);
  return form === 'done' ? words[1] : words[2];
}

/** The hours before the raid in `remind-72h` or `dm-24h`; null for a rule with no lead time. */
export function ruleHours(rule: string): number | null {
  const hours = /^(?:remind|dm)-(\d+)h$/.exec(rule)?.[1];
  return hours ? Number(hours) : null;
}

/** `remind-72h` → "72 hours before"; empty for a rule with no lead time. */
export function ruleLead(rule: string): string {
  const hours = ruleHours(rule);
  return hours === null ? '' : `${hours} hour${hours === 1 ? '' : 's'} before`;
}
