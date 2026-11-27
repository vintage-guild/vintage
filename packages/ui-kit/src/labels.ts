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
  [
    'tentative-check',
    'Asked Tentative signups if they can make it',
    'Ask Tentative signups if they can make it',
  ],
  [
    'tentative-answer',
    'Got an answer to the Tentative check',
    'Get an answer to the Tentative check',
  ],
  ['lock', 'Locked the roster', 'Lock the roster'],
  ['final', 'Posted the final roster', 'Post the final roster'],
  [
    'overcap-approval',
    'Asked officers to approve an over-cap roster',
    'Ask officers to approve an over-cap roster',
  ],
  [
    'overcommitted-notice',
    'Warned officers the roster is over size',
    'Warn officers the roster is over size',
  ],
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

/**
 * "Posted the signups, Reminded the people who haven’t answered (72 and 24 hours before), Sent
 * reminder DMs ×3 (24 hours before)": each kind once, in order, with its lead times, and a
 * count where one lead time covers several sends (a DM per member).
 */
export function summarizeRules(rules: string[], form: 'done' | 'todo' = 'done'): string {
  const kinds = new Map<string, { n: number; hours: number[] }>();
  for (const rule of rules) {
    const words = ruleWords(rule, form);
    const kind = kinds.get(words) ?? { n: 0, hours: [] };
    kind.n += 1;
    const hours = ruleHours(rule);
    if (hours !== null && !kind.hours.includes(hours)) kind.hours.push(hours);
    kinds.set(words, kind);
  }
  return [...kinds]
    .map(([words, { n, hours }]) => {
      const count = n > Math.max(hours.length, 1) ? ` ×${n}` : '';
      const lead = hours.length
        ? ` (${hours.join(' and ')} hour${hours.length === 1 && hours[0] === 1 ? '' : 's'} before)`
        : '';
      return `${words}${count}${lead}`;
    })
    .join(', ');
}
