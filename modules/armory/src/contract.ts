// Public surface of the armory module. Other modules import only this file.
//
// A member links one of their registered characters (identity) to its WoW: Forever armory
// entry by giving the character's surname: Forever has no realms, and `{name}-{surname}` is how
// Blizzard's profile API finds a character. Vintage then keeps what the armory says about it
// (level, item level, gear, portrait) and refreshes it in the background. The armory is public
// data: a link says which armory character a member says is theirs, not proof that it is.

/** What Vintage last heard from the armory for a link. */
export const ARMORY_STATUSES = ['pending', 'found', 'not-found', 'error'] as const;
export type ArmoryStatus = (typeof ARMORY_STATUSES)[number];

/** The armory's profile of a character, trimmed to what Vintage shows. */
export interface ArmoryProfile {
  /** Blizzard's character id; stays the same through a rename. */
  blizzardId: number;
  name: string;
  surname: string;
  level: number;
  className: string | null;
  raceName: string | null;
  /** `ALLIANCE` or `HORDE`. */
  faction: string | null;
  guildName: string | null;
  guildSlug: string | null;
  /** Absent on Forever for now (Nov 2026); the member's registered spec stays the source. */
  activeSpec: string | null;
  equippedItemLevel: number | null;
  averageItemLevel: number | null;
  /** Epoch ms. */
  lastLoginAt: number | null;
}

/** One equipped item. */
export interface ArmoryItem {
  /** Blizzard's slot type: `HEAD`, `MAIN_HAND`, … */
  slot: string;
  itemId: number;
  name: string | null;
  /** Blizzard's quality type, lowercased: `epic`, `rare`, … */
  quality: string | null;
  itemLevel: number | null;
}

/** A registered character linked to its armory entry. */
export interface ArmoryLink {
  id: string;
  guildId: string;
  /** Identity's character id. */
  characterId: string;
  /** The character's name when it was linked. */
  name: string;
  surname: string;
  /** `{name}-{surname}`, lowercased: unique per guild. */
  slug: string;
  status: ArmoryStatus;
  /** The last profile the armory gave. Kept through later errors and misses. */
  profile: ArmoryProfile | null;
  equipment: ArmoryItem[];
  avatarUrl: string | null;
  /** The armory's class differs from the registered one: likely the wrong surname. */
  classMismatch: boolean;
  /** Why the last check failed, when it did. */
  error: string | null;
  /** Member who linked it, or the surface for system jobs. */
  linkedBy: string;
  linkedAt: number;
  /** When a fetch was last asked for (link, refresh, or the sweep). */
  requestedAt: number;
  /** When the armory last answered, found or not. */
  checkedAt: number | null;
  /** When the armory last found it. */
  fetchedAt: number | null;
}

/** A link with the owner it has now (identity's character, read when asked). */
export interface ArmoryEntry extends ArmoryLink {
  memberId: string;
}

/** What one fetch found, as `armory-record` takes it. */
export type ArmoryFetchResult =
  | { status: 'found'; profile: ArmoryProfile; equipment: ArmoryItem[]; avatarUrl: string | null }
  | { status: 'not-found' }
  | { status: 'error'; error: string };

/** A link is refreshed by the sweep once its last check is this old. */
export const ARMORY_STALE_MS = 12 * 60 * 60 * 1000;
/** A member may ask for a refresh this often per character. */
export const ARMORY_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;
/** Links one sweep asks to refresh, so a run stays well inside Blizzard's rate limit. */
export const ARMORY_SWEEP_BATCH = 25;
