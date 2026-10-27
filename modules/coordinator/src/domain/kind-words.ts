// The words around an event follow its kind (#151): "Dungeon · Cathedral run", "5-person
// dungeon". Raids are the default, so a raid's title stays just its name. An `other` event may
// have no size (open) and no instance, so those words drop out instead of reading "/null". Pure.
import { KIND_LABELS, kindNoun, kindOf, type RaidEvent } from '@vintage/raids/contract';

type Kinded = Pick<RaidEvent, 'name' | 'size'> & { kind?: RaidEvent['kind'] };

/** "Dungeon · SM Cathedral" for every kind but raids, which stay "MC nights". */
export function eventTitle(event: Kinded): string {
  const kind = kindOf(event);
  return kind === 'raid' ? event.name : `${KIND_LABELS[kind]} · ${event.name}`;
}

/** The card's title: the event title, then the instance when there is one. */
export const cardTitle = (event: Kinded & Pick<RaidEvent, 'instance'>): string =>
  event.instance ? `${eventTitle(event)} · ${event.instance}` : eventTitle(event);

/** "40-person raid", "5-person dungeon", "12-person event", or "open event" with no size. */
export const sizeWords = (event: Kinded): string =>
  event.size === null
    ? `open ${kindNoun(kindOf(event))}`
    : `${event.size}-person ${kindNoun(kindOf(event))}`;

/** "12/40" against the size, or just "12" for an open event. */
export const countOf = (n: number, event: Pick<RaidEvent, 'size'>): string =>
  event.size === null ? String(n) : `${n}/${event.size}`;

/** "raid", "dungeon", "battleground", "event", for sentences. */
export const noun = (event: { kind?: RaidEvent['kind'] }): string => kindNoun(kindOf(event));
