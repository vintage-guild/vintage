// The words around an event follow its kind (#151): "Dungeon · Cathedral run", "5-person
// dungeon". Raids are the default, so a raid's title stays just its name. Pure.
import { KIND_LABELS, kindNoun, kindOf, type RaidEvent } from '@vintage/raids/contract';

type Kinded = Pick<RaidEvent, 'name' | 'size'> & { kind?: RaidEvent['kind'] };

/** "Dungeon · SM Cathedral" for every kind but raids, which stay "MC nights". */
export function eventTitle(event: Kinded): string {
  const kind = kindOf(event);
  return kind === 'raid' ? event.name : `${KIND_LABELS[kind]} · ${event.name}`;
}

/** "40-person raid", "5-person dungeon", "12-person event". */
export const sizeWords = (event: Kinded): string =>
  `${event.size}-person ${kindNoun(kindOf(event))}`;

/** "raid", "dungeon", "battleground", "event", for sentences. */
export const noun = (event: { kind?: RaidEvent['kind'] }): string => kindNoun(kindOf(event));
