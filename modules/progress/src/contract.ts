// Public surface of the progress module. Other modules import only this file.
//
// The raids and their bosses are data, not records: Blizzard's launch raids don't change per
// guild. What the guild owns is its kills. The website's ledger and the hero's "bosses down"
// figure read `progress-get` (docs/features/proposed/home-page/home-page.plan.md).

/** Blizzard's item quality scale, in order. The website colors loot with `--color-quality-*`. */
export const ITEM_QUALITIES = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type ItemQuality = (typeof ITEM_QUALITIES)[number];

/** One item that dropped from a kill. */
export interface LootDrop {
  name: string;
  quality: ItemQuality;
}

export interface Boss {
  /** Stable within the raid; kills reference it. */
  id: string;
  name: string;
  /** Position in the raid's achievement order, 1-based. Not a confirmed kill order. */
  order: number;
  /**
   * The name comes from beta-client datamining and Blizzard has not published it. Surfaces
   * say so wherever they show the name.
   */
  datamined: boolean;
  /**
   * The game's encounter id (ENCOUNTER_START), which the addon's export carries. Null until the
   * Forever spike (Nov 4–6) reads them; until then an export's kills match by name.
   */
  encounterId: number | null;
}

export const RAID_IDS = ['barrow-deeps', 'hyjal-summit', 'onyxias-lair'] as const;
export type RaidId = (typeof RAID_IDS)[number];

export interface Raid {
  id: RaidId;
  name: string;
  size: 10 | 20 | 40;
  bosses: readonly Boss[];
}

/** When Forever's raids unlock: 2026-12-09, midnight Eastern (Blizzard's roadmap). */
export const RAIDS_OPEN_AT = Date.UTC(2026, 11, 9, 5);
/** The same day as a calendar date, for labels ("unlocks Dec 9" in every zone). */
export const RAIDS_OPEN_ON = '2026-12-09';

const boss = (
  id: string,
  name: string,
  order: number,
  datamined = true,
  encounterId: number | null = null,
): Boss => ({
  id,
  name,
  order,
  datamined,
  encounterId,
});

/**
 * The three launch raids. Barrow Deeps and Hyjal Summit bosses are datamined from beta client
 * build 1.60.1.70532 (wowforeverbuilds.com, read 2026-10-25), listed in their Legacy
 * achievement's order; Blizzard has confirmed neither the names nor the order. Onyxia is
 * Onyxia.
 */
export const LAUNCH_RAIDS: readonly Raid[] = [
  {
    id: 'barrow-deeps',
    name: 'Barrow Deeps',
    size: 10,
    bosses: [
      boss('chillhowl', 'Chillhowl', 1),
      boss('elder-tangleclaw', 'Elder Tangleclaw', 2),
      boss('khalith', 'Khalith the Dreadspinner', 3),
      boss('well-of-sorrow', 'Well of Sorrow', 4),
      boss('amethrax', 'Amethrax', 5),
      boss('dellynar', "Del'lynar Songwood", 6),
      boss('ravus-and-darlissa', 'Ravus and Darlissa', 7),
      boss('sonya-darkhallow', 'Sonya Darkhallow', 8),
    ],
  },
  {
    id: 'hyjal-summit',
    name: 'Hyjal Summit',
    size: 20,
    bosses: [
      boss('bandalar', 'Bandalar', 1),
      boss('ancient-of-decay', 'Ancient of Decay', 2),
      boss('time-lost-battalion', 'Time-Lost Battalion', 3),
      boss('sylvestris-dusksong', 'Sylvestris Dusksong', 4),
      boss('old-gloomlurker', 'Old Gloomlurker', 5),
      boss('gharalis', 'Gharalis the Abyssal', 6),
      boss('kathris', 'Kathris the Haunted', 7),
      boss('anara-chillwind', 'Anara Chillwind', 8),
      boss('elder-minderel', 'Elder Minderel', 9),
      boss('tracker-stillwind', 'Tracker Stillwind', 10),
      boss('council-of-thorns', 'Council of Thorns', 11),
      boss('nythus', 'Nythus the Dreambound', 12),
      boss('the-wild-king', 'The Wild King', 13),
    ],
  },
  {
    id: 'onyxias-lair',
    name: "Onyxia's Lair",
    size: 40,
    bosses: [boss('onyxia', 'Onyxia', 1, false)],
  },
];

/** Bosses across the launch raids (8 + 13 + 1). */
export const LAUNCH_BOSS_COUNT = LAUNCH_RAIDS.reduce((n, r) => n + r.bosses.length, 0);

/** "Del'lynar Songwood" and "dellynar songwood" are the same boss: letters and digits only. */
const nameKey = (name: string) => name.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]/gu, '');

/**
 * The launch boss a game encounter is, or null. When both the boss and the encounter have an id,
 * the id decides; otherwise (every boss until the Forever spike, or an attempt the game kept
 * secret) the name does, ignoring case and punctuation.
 */
export function findBoss(
  encounter: { encounterId?: number | null; name: string },
  raids: readonly Raid[] = LAUNCH_RAIDS,
): { raid: Raid; boss: Boss } | null {
  const id = encounter.encounterId ?? null;
  const key = nameKey(encounter.name);
  for (const raid of raids) {
    for (const boss of raid.bosses) {
      const same =
        boss.encounterId !== null && id !== null
          ? boss.encounterId === id
          : nameKey(boss.name) === key;
      if (same) return { raid, boss };
    }
  }
  return null;
}

/** One recorded kill. The guild's first kill of a boss is the earliest `killedAt`. */
export interface Kill {
  id: string;
  guildId: string;
  raidId: RaidId;
  bossId: string;
  /** Epoch ms, UTC. */
  killedAt: number;
  loot: LootDrop[];
  note: string | null;
  /** Member who recorded it, or the surface for system jobs. */
  recordedBy: string;
  recordedAt: number;
}

/** What `kill-record` answers. */
export interface KillRecorded {
  kill: Kill;
  /** This kill is now the ledger entry for its boss. */
  first: boolean;
  /** The same raid, boss, and time was already recorded; nothing changed. */
  duplicate: boolean;
}

/** A boss with the guild's first kill, if any. */
export interface BossProgress extends Boss {
  firstKillAt: number | null;
  /** What dropped on the first kill. */
  loot: LootDrop[];
}

export interface RaidProgress {
  id: RaidId;
  name: string;
  size: Raid['size'];
  bosses: BossProgress[];
  killed: number;
  total: number;
  /** The first boss in order without a kill: the next target. Null when the raid is cleared. */
  nextBossId: string | null;
}

/** The latest first kill, for a callout. */
export interface FirstKill {
  raidId: RaidId;
  raidName: string;
  bossId: string;
  bossName: string;
  killedAt: number;
  loot: LootDrop[];
}

/** What `progress-get` answers. */
export interface Progress {
  /** Epoch ms when the raids unlock. */
  opensAt: number;
  /** The unlock day as a calendar date (`YYYY-MM-DD`). */
  opensOn: string;
  /** Whether that time has passed. */
  open: boolean;
  raids: RaidProgress[];
  killed: number;
  total: number;
  latest: FirstKill | null;
}

export const PROGRESS_COMMANDS = ['kill-record', 'progress-get'] as const;
export type ProgressCommandName = (typeof PROGRESS_COMMANDS)[number];
