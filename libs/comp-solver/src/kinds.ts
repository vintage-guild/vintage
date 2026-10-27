// Event kinds (#151): raids, dungeons, battlegrounds, and anything else, planned by one solver.
// The kind sets which sizes are allowed, the default role targets, whether raid buffs count as
// gaps, and the word people see. Here, not in the raids module, so the raids commands, the
// coordinator card, and the site forms share one set of rules. Pure.
//
// `other` is the catch-all (a levelling group anyone can join): its size and instance are
// optional. No size means open: no cap and no queue.
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

/** Allowed sizes per kind; `other` takes any size from 1 to {@link MAX_EVENT_SIZE}, or none. */
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

/** Only `other` events may leave out their size (open: no cap, no queue) and instance. */
export const sizeOptional = (kind: EventKind) => kind === 'other';
export const instanceOptional = (kind: EventKind) => kind === 'other';

/** Whether `size` is allowed for `kind`; null (open) only for `other`. */
export function sizeFits(kind: EventKind, size: number | null): boolean {
  if (size === null) return sizeOptional(kind);
  if (!Number.isInteger(size)) return false;
  if (kind === 'other') return size >= 1 && size <= MAX_EVENT_SIZE;
  return KIND_SIZES[kind].includes(size);
}

/** "5-player dungeon", or "open event" when an `other` event has no size. */
export const sizeLabel = (kind: EventKind, size: number | null) =>
  size === null ? `open ${kindNoun(kind)}` : `${size}-player ${kindNoun(kind)}`;

/** "10, 20 or 40" for errors and help text. */
export function sizesText(kind: EventKind): string {
  if (kind === 'other') return `1 to ${MAX_EVENT_SIZE}, or none for an open event`;
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
export function defaultRoleTargets(kind: EventKind, size: number | null): RoleTargets {
  switch (kind) {
    case 'raid':
      return size !== null && (RAID_SIZES as readonly number[]).includes(size)
        ? { ...defaultTemplate(size as RaidSize).targets }
        : { tank: 0, healer: 0, dps: 0 };
    case 'dungeon':
      return { tank: 1, healer: 1, dps: 3 };
    case 'battleground': {
      if (size === null) return { tank: 0, healer: 0, dps: 0 };
      const healer = BG_HEALERS[size] ?? Math.round(size / 5);
      return { tank: 0, healer, dps: size - healer };
    }
    case 'other':
      return { tank: 0, healer: 0, dps: 0 };
  }
}

interface Sized {
  kind?: EventKind | null;
  /** Players; null is an open `other` event. */
  size: number | null;
  roleTargets: RoleTargets | null;
}

/** The targets an event plays to: its own, or the kind's default. */
export const targetsOf = (event: Sized): RoleTargets =>
  event.roleTargets ?? defaultRoleTargets(kindOf(event), event.size);

/** Whether an event has any role target at all (an `other` event without targets has none). */
export const hasRoleTargets = (targets: RoleTargets) =>
  targets.tank + targets.healer + targets.dps > 0;

/**
 * The size to solve a comp with. An open event has no cap, so it plays everyone going (at least
 * enough to meet its targets): nobody is benched for size and no "need N more players" gap shows.
 */
export function compSize(event: Sized, going: number): number {
  if (event.size !== null) return event.size;
  const t = targetsOf(event);
  return Math.max(t.tank + t.healer + t.dps, going);
}

/**
 * The comp template for an event: its targets, and the raid buffs only for raids (a dungeon
 * missing Arcane Intellect isn't a gap).
 */
export function eventTemplate(event: Sized): CompTemplate {
  const kind = kindOf(event);
  const targets = targetsOf(event);
  if (
    kind !== 'raid' ||
    event.size === null ||
    !(RAID_SIZES as readonly number[]).includes(event.size)
  ) {
    return { targets, requirements: [] };
  }
  return { ...defaultTemplate(event.size as RaidSize), targets };
}
