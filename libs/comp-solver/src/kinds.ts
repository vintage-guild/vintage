// Event kinds (#151): raids, dungeons, battlegrounds, and anything else, planned by one solver.
// The kind sets which sizes are allowed, the default role targets, whether raid buffs count as
// gaps, and the word people see. Here, not in the raids module, so the raids commands, the
// coordinator card, and the site forms share one set of rules. Pure.
import { defaultTemplate } from './catalog';
import {
  type CompTemplate,
  MAX_GROUP_SIZE,
  RAID_SIZES,
  type RaidSize,
  type RoleTargets,
} from './types';

export const EVENT_KINDS = ['raid', 'dungeon', 'battleground', 'other'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** The largest group any kind allows. */
export const MAX_EVENT_SIZE = MAX_GROUP_SIZE;

/** Allowed sizes per kind; `other` takes any size from 1 to {@link MAX_EVENT_SIZE}. */
export const KIND_SIZES: Record<Exclude<EventKind, 'other'>, readonly number[]> = {
  raid: RAID_SIZES,
  dungeon: [5],
  battleground: [10, 15, 40],
};

/** The word people see for a kind: "Raid", "Dungeon", "Battleground", or "Event". */
export const KIND_LABELS: Record<EventKind, string> = {
  raid: 'Raid',
  dungeon: 'Dungeon',
  battleground: 'Battleground',
  other: 'Event',
};

/** The kind of a stored row; rows written before kinds existed are raids. */
export const kindOf = (row: { kind?: EventKind | null }): EventKind => row.kind ?? 'raid';

/** Lowercase noun for sentences: "raid", "dungeon", "battleground", "event". */
export const kindNoun = (kind: EventKind) => KIND_LABELS[kind].toLowerCase();

/** The noun with its article: "a raid", "a dungeon", "an event". */
export const aKind = (kind: EventKind) => `${kind === 'other' ? 'an' : 'a'} ${kindNoun(kind)}`;

/** The same, capitalized for the start of a sentence: "A dungeon", "An event". */
export const AKind = (kind: EventKind) => aKind(kind).replace(/^a/, 'A');

/** Whether `size` is allowed for `kind`. */
export function sizeFits(kind: EventKind, size: number): boolean {
  if (!Number.isInteger(size)) return false;
  if (kind === 'other') return size >= 1 && size <= MAX_EVENT_SIZE;
  return KIND_SIZES[kind].includes(size);
}

/** "10, 20 or 40" for errors and help text. */
export function sizesText(kind: EventKind): string {
  if (kind === 'other') return `1 to ${MAX_EVENT_SIZE}`;
  const sizes = KIND_SIZES[kind].map(String);
  return sizes.length === 1 ? sizes[0]! : `${sizes.slice(0, -1).join(', ')} or ${sizes.at(-1)}`;
}

/** Healers per battleground size; the rest are dps, and there's no tank target. */
const BG_HEALERS: Record<number, number> = { 10: 2, 15: 3, 40: 8 };

/**
 * Role targets when the event sets none. Raids use the comp-solver defaults by size, dungeons
 * 1 tank, 1 healer and 3 dps, battlegrounds healers and dps with no tank, and `other` none
 * (all zero: anyone fills any slot).
 */
export function defaultRoleTargets(kind: EventKind, size: number): RoleTargets {
  switch (kind) {
    case 'raid':
      return (RAID_SIZES as readonly number[]).includes(size)
        ? { ...defaultTemplate(size as RaidSize).targets }
        : { tank: 0, healer: 0, dps: 0 };
    case 'dungeon':
      return { tank: 1, healer: 1, dps: 3 };
    case 'battleground': {
      const healer = BG_HEALERS[size] ?? Math.round(size / 5);
      return { tank: 0, healer, dps: size - healer };
    }
    case 'other':
      return { tank: 0, healer: 0, dps: 0 };
  }
}

/** The targets an event plays to: its own, or the kind's default. */
export const targetsOf = (event: {
  kind?: EventKind | null;
  size: number;
  roleTargets: RoleTargets | null;
}): RoleTargets => event.roleTargets ?? defaultRoleTargets(kindOf(event), event.size);

/** Whether an event has any role target at all (an `other` event without targets has none). */
export const hasRoleTargets = (targets: RoleTargets) =>
  targets.tank + targets.healer + targets.dps > 0;

/**
 * The comp template for an event: its targets, and the raid buffs only for raids (a dungeon
 * missing Arcane Intellect isn't a gap).
 */
export function eventTemplate(event: {
  kind?: EventKind | null;
  size: number;
  roleTargets: RoleTargets | null;
}): CompTemplate {
  const kind = kindOf(event);
  const targets = targetsOf(event);
  if (kind !== 'raid' || !(RAID_SIZES as readonly number[]).includes(event.size)) {
    return { targets, requirements: [] };
  }
  return { ...defaultTemplate(event.size as RaidSize), targets };
}
