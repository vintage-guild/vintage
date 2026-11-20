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
  /**
   * The talent tree with the most points in the active group (Forever's profile has no
   * `active_spec`; `/specializations` has the trees). The registered spec stays the source for
   * raid roles; this is what the armory says.
   */
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
  /** The armory first name when it was linked: the registered name without its last name. */
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

// Guild roster: every character currently in the Forever guild's in-game roster (Blizzard's own
// membership, from `guildRoster()`), independent of any member's link. Replaces the officers'
// Google Sheet (docs/features/active/guild-roster).

export const ROSTER_STATUSES = ['pending', 'found', 'error'] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

/** One profession on a roster character, with its spent and max skill points. */
export interface RosterProfession {
  name: string;
  level: number;
  maxLevel: number | null;
}

/** A recipe a roster character knows, from its profession's `known_recipes`. */
export interface RosterRecipe {
  /** Blizzard's recipe id. */
  id: number;
  name: string;
  profession: string;
}

/** A character in the guild's in-game roster, enriched from the armory in the background. */
export interface RosterEntry {
  id: string;
  guildId: string;
  /** Blizzard's character id; stays the same through a rename. */
  blizzardId: number;
  name: string;
  surname: string;
  /** `{name}-{surname}`, lowercased: unique per guild. */
  slug: string;
  level: number;
  /** Blizzard's native in-game guild rank, 0 = Guild Master. Undocumented: no rank name yet. */
  guildRank: number;
  status: RosterStatus;
  className: string | null;
  raceName: string | null;
  activeSpec: string | null;
  professions: RosterProfession[];
  avatarUrl: string | null;
  /** The character's public armory page. */
  profileUrl: string | null;
  /** Why the last enrichment failed, when it did. */
  error: string | null;
  /** Epoch ms; null until the first enrichment pass. */
  checkedAt: number | null;
}

/**
 * A roster character as `armory-guild-roster` answers it, with the guild member it belongs to:
 * the member who linked it to the armory, else the one whose registered character has its full
 * name. Null when no member claims it. A claim, like a link: never proof of ownership.
 */
export interface RosterListing extends RosterEntry {
  memberId: string | null;
}

/** A roster character who can craft a recipe, with its skill in that profession. */
export interface RecipeCrafter {
  name: string;
  surname: string;
  slug: string;
  level: number;
  className: string | null;
  profileUrl: string | null;
  skill: number;
  maxSkill: number | null;
}

/** One recipe `armory-recipe-search` found, with everyone on the roster who knows it. */
export interface RecipeMatch {
  id: number;
  name: string;
  profession: string;
  crafters: RecipeCrafter[];
}

/** Recipes one search answers at most; a longer list means the query is too broad. */
export const RECIPE_SEARCH_LIMIT = 50;

/**
 * Every recipe one roster character knows, kept apart from its `RosterEntry` (hundreds per
 * character) and read only by `armory-recipe-search`.
 */
export interface RosterRecipes {
  /** The `RosterEntry` it belongs to. */
  entryId: string;
  recipes: RosterRecipe[];
}

/**
 * What one roster character's enrichment found, as `armory-guild-roster-record` takes it. A
 * field left out means its request failed (a 429 or a 5xx, say): the record keeps what it had
 * instead of blanking it until the next pass. `null` and `[]` mean Blizzard answered with none.
 */
export type RosterFetchResult =
  | {
      status: 'found';
      className: string | null;
      raceName: string | null;
      activeSpec?: string | null;
      professions?: RosterProfession[];
      recipes?: RosterRecipe[];
      avatarUrl?: string | null;
      profileUrl: string | null;
    }
  | { status: 'error'; error: string };

/** A roster character one sync asks Blizzard's guild roster endpoint about. */
export interface RosterMember {
  blizzardId: number;
  name: string;
  surname: string;
  slug: string;
  level: number;
  guildRank: number;
}

/** An entry is re-enriched by the sync once its last check is this old. */
export const ROSTER_STALE_MS = 24 * 60 * 60 * 1000;
/**
 * Serialized bytes one `armory-guild-roster-record` call stays under, well inside Convex's
 * argument limit: 60 characters with hundreds of recipes each can outgrow a single call.
 */
export const ROSTER_RECORD_BYTES = 4_000_000;
/** Roster entries one sync enriches, so a run stays well inside Blizzard's rate limit. */
export const ROSTER_SYNC_BATCH = 60;

// The recipe catalog: every recipe each profession has, from Blizzard's game data (not any
// character), so the website can show recipes nobody in the guild knows yet.

/** One of a profession's recipe categories, as Blizzard groups them ("Weapon Stones"). */
export interface CatalogCategory {
  name: string;
  recipes: { id: number; name: string }[];
}

/** One profession's whole recipe catalog. */
export interface ProfessionCatalog {
  id: string;
  guildId: string;
  /** Blizzard's profession name: `Blacksmithing`, `First Aid`. */
  profession: string;
  professionId: number;
  categories: CatalogCategory[];
  /** Epoch ms of the sync that wrote it. */
  syncedAt: number;
}

/** A profession on the overview: its size, the guild's coverage, and its best crafters. */
export interface ProfessionSummary {
  profession: string;
  /** Recipes in Blizzard's catalog; null until the catalog has synced. */
  recipeCount: number | null;
  /** Catalog recipes someone on the roster knows. */
  knownCount: number;
  /** Roster characters (level 10 and up) with the profession, at any skill. */
  crafterCount: number;
  /** The best three by skill. */
  top: RecipeCrafter[];
}

/** A recipe in a profession's catalog, with everyone on the roster who knows it. */
export interface CatalogRecipe {
  id: number;
  name: string;
  /** Best skill first; empty when nobody knows it. */
  crafters: RecipeCrafter[];
}

/** One profession's whole catalog with the guild's knowledge, for its page. */
export interface ProfessionDetail {
  profession: string;
  recipeCount: number;
  knownCount: number;
  categories: { name: string; recipes: CatalogRecipe[] }[];
}

/**
 * Gathering skills: Blizzard lists a few abilities as their "recipes" (Find Herbs), so they have
 * no crafting catalog. Mining stays: it has real smelting recipes.
 */
export const GATHERING_PROFESSIONS: readonly string[] = ['Fishing', 'Herbalism', 'Skinning'];
