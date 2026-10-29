// Golden fixtures shared with the addon's Lua codec (`addon/Vintage/Core/BridgeFormat`). Each
// file holds the decoded value and its encoded string; both sides must decode `encoded` to
// `payload`, or to the listed error. `wow-data.json` carries the class and role lists the Lua
// schema copies. `pnpm fixtures:bridge` writes them; tests fail if they're stale.
import { CLASS_NAMES, ROLES } from '@vintage/wow-data';
import { encodeValue } from './envelope';
import type { BridgeErrorCode } from './errors';
import type { LuaValue } from './libserialize';
import type { RaidExport, RaidImport } from './schemas';

interface Fixture {
  description: string;
  /** The decoded value. For error fixtures, the raw value that was encoded. */
  payload: LuaValue;
  /** Set for fixtures that must fail to decode. */
  error?: BridgeErrorCode;
}

const raidImport: RaidImport = {
  v: 1,
  kind: 'raid-import',
  guildId: 'g_vintage',
  generatedAt: 1_793_000_000,
  raid: { eventId: 'evt_mc_0001', title: 'Molten Core — week 1', startsAt: 1_793_052_000 },
  roster: [
    { characterId: 'c_aeryn', name: 'Aeryn', class: 'warrior', spec: 'protection', role: 'tank' },
    { characterId: 'c_brann', name: 'Brann', class: 'priest', spec: 'holy', role: 'healer' },
    { characterId: 'c_cyra', name: 'Cyra', class: 'mage', role: 'ranged' },
    { characterId: 'c_doran', name: 'Doran-Stonemaul', class: 'rogue', role: 'melee' },
    {
      characterId: 'c_elowen',
      name: 'Élowen',
      class: 'druid',
      spec: 'restoration',
      role: 'healer',
    },
  ],
  groups: [
    { group: 1, characterIds: ['c_aeryn', 'c_brann', 'c_doran'] },
    { group: 2, characterIds: ['c_cyra', 'c_elowen'] },
  ],
  loot: { methodId: 'softres', methodVersion: 1, configVersion: 3, mode: 'master', threshold: 4 },
  candidates: [
    {
      itemId: 16_800,
      ranked: [
        { characterId: 'c_doran', reason: 'Soft-reserved (1 of 2)' },
        { characterId: 'c_aeryn', reason: 'Soft-reserved (2 of 2)' },
      ],
    },
    { itemId: 17_076, ranked: [] },
  ],
};

/**
 * The same raid with a bench: one per reason. Kept apart from `raidImport`, whose committed
 * strings carry no bench and so keep proving that older imports decode.
 */
const raidImportWithBench: RaidImport = {
  ...raidImport,
  bench: [
    {
      characterId: 'c_fenna',
      name: 'Fenna',
      class: 'paladin',
      spec: 'holy',
      role: 'healer',
      reason: 'standby',
    },
    {
      characterId: 'c_garrick',
      name: 'Garrick',
      class: 'hunter',
      role: 'ranged',
      reason: 'queued',
    },
    {
      characterId: 'c_hollis',
      name: 'Hollis-Stonemaul',
      class: 'warlock',
      spec: 'affliction',
      role: 'ranged',
      reason: 'benched',
    },
  ],
};

const raidExport: RaidExport = {
  v: 1,
  kind: 'raid-export',
  exportedAt: 1_793_066_400,
  addonVersion: '0.1.0',
  exporter: 'Aeryn',
  guildId: 'g_vintage',
  eventId: 'evt_mc_0001',
  attendance: [
    {
      at: 1_793_052_300,
      label: 'start',
      members: [
        { name: 'Aeryn', class: 'warrior', group: 1, online: true },
        { name: 'Brann', class: 'priest', group: 1, online: true },
        { name: 'Cyra', class: 'mage', group: 2, online: false },
      ],
    },
    {
      at: 1_793_055_900,
      label: 'Lucifron',
      members: [{ name: 'Aeryn', class: 'warrior', group: 1, online: true }],
    },
  ],
  loot: [
    { itemId: 16_800, looter: 'Doran-Stonemaul', at: 1_793_056_000, source: 'Lucifron' },
    { itemId: 17_011, looter: 'Brann', at: 1_793_056_100, count: 2 },
  ],
  items: [
    {
      itemId: 16_800,
      name: 'Arcanist Boots',
      quality: 4,
      itemLevel: 66,
      equipLoc: 'INVTYPE_FEET',
      classId: 4,
      subclassId: 1,
      icon: 132_539,
    },
    { itemId: 17_011, name: 'Lava Core', quality: 3 },
  ],
};

/** The smallest valid export: an attendance-less export still carries its required fields. */
const emptyExport: RaidExport = {
  v: 1,
  kind: 'raid-export',
  exportedAt: 1_793_066_400,
  addonVersion: '0.1.0',
  exporter: 'Aeryn',
  attendance: [],
  loot: [],
  items: [],
};

/**
 * A raid night as the addon exports it, for the JTBD host's guild (apps/api/tests/jtbd): Aeryn and
 * Bramble attend, Cadence signed up but never shows, and a pick-up from another realm takes loot.
 * No guild or event id, as after a raid the addon didn't import, so a check names the raid. The
 * jobs suite uses the Lua-made string (lua-made.json), which the addon's codec writes. Times are
 * the night of that guild's Wednesday raid (2026-10-29 00:00 UTC), so a check finds them close.
 */
const raidNightExport: RaidExport = {
  v: 1,
  kind: 'raid-export',
  exportedAt: 1_793_242_800,
  addonVersion: '0.1.0',
  exporter: 'Aeryn',
  attendance: [
    {
      at: 1_793_232_100,
      label: 'start',
      members: [
        { name: 'Aeryn', class: 'warrior', group: 1, online: true },
        { name: 'Bramble', class: 'priest', group: 1, online: true },
        { name: 'Doran-Stonemaul', class: 'rogue', group: 2, online: true },
      ],
    },
    {
      at: 1_793_235_700,
      label: 'Lucifron',
      members: [
        { name: 'Aeryn', class: 'warrior', group: 1, online: true },
        { name: 'Bramble', class: 'priest', group: 1, online: false },
        { name: 'Doran-Stonemaul', class: 'rogue', group: 2, online: true },
      ],
    },
    {
      at: 1_793_239_300,
      label: 'end',
      members: [
        { name: 'Aeryn', class: 'warrior', group: 1, online: true },
        { name: 'Bramble', class: 'priest', group: 1, online: true },
      ],
    },
  ],
  loot: [
    { itemId: 16_800, looter: 'Bramble', at: 1_793_235_800, source: 'Lucifron' },
    { itemId: 17_011, looter: 'Doran-Stonemaul', at: 1_793_235_900, count: 2 },
  ],
  items: [
    {
      itemId: 16_800,
      name: 'Arcanist Boots',
      quality: 4,
      itemLevel: 66,
      equipLoc: 'INVTYPE_FEET',
      classId: 4,
      subclassId: 1,
      icon: 132_539,
    },
    { itemId: 17_011, name: 'Lava Core', quality: 3 },
  ],
};

/** The fixture the jobs suite checks on every surface (raid-export-check). */
export const RAID_NIGHT_EXPORT_FIXTURE = 'raid-export-night.v1';

export const FIXTURES: Record<string, Fixture> = {
  'raid-import.v1': {
    description: 'Web → game import: roster, groups, loot settings, ranked candidates',
    payload: raidImport,
  },
  'raid-import-bench.v1': {
    description: 'An import with a bench: standby, queued, and benched characters off the roster',
    payload: raidImportWithBench,
  },
  'raid-export.v1': {
    description: 'Game → web export: attendance snapshots, loot received, item data seen',
    payload: raidExport,
  },
  [RAID_NIGHT_EXPORT_FIXTURE]: {
    description: 'A raid night with no event id: two signed-up raiders, one no-show, a pick-up',
    payload: raidNightExport,
  },
  'raid-export-empty.v1': {
    description: 'An export with nothing recorded; empty lists must round-trip',
    payload: emptyExport,
  },
  'error-newer-version': {
    description: 'A payload from a newer schema version is refused, not misread',
    payload: { ...raidExport, v: 2 },
    error: 'UNSUPPORTED_VERSION',
  },
  'error-unknown-kind': {
    description: 'An unknown kind at the current version is refused',
    payload: { v: 1, kind: 'raid-teleport', at: 1_793_000_000 },
    error: 'UNKNOWN_KIND',
  },
  'error-invalid-payload': {
    description: 'A known kind that breaks its schema (group 9 does not exist)',
    payload: { ...raidImport, groups: [{ group: 9, characterIds: ['c_aeryn'] }] },
    error: 'INVALID_PAYLOAD',
  },
};

/** Fixture files keyed by their path inside `fixtures/`. */
export function buildFixtures(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    const file = { ...fixture, encoded: encodeValue(fixture.payload) };
    files[`${name}.json`] = `${JSON.stringify(file, null, 2)}\n`;
  }
  const wowData = {
    description: 'The class and role lists from @vintage/wow-data that the addon schema checks',
    classes: CLASS_NAMES,
    roles: ROLES,
  };
  files['wow-data.json'] = `${JSON.stringify(wowData, null, 2)}\n`;
  return files;
}
