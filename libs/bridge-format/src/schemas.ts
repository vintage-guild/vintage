// Payload schemas, version 1 (PLAN §3.5). Rules both sides rely on:
// - Every payload carries `v` (schema version) and `kind`.
// - Times are unix seconds (Lua's `time()`), not milliseconds.
// - Only strings, integers, booleans, arrays, and string-keyed objects. No null: Lua tables
//   can't hold nil, so an absent field is simply missing.
// - Every object has at least one required field: LibSerialize writes `{}` as an empty
//   array, so an object that could be empty would not round-trip.
// - Characters are referred to by `characterId` inside an import; the roster maps ids to names.
import { classSchema, roleSchema } from '@vintage/wow-data';
import { z } from 'zod';

/** Bump when a payload changes incompatibly; the addon and web refuse newer versions. */
export const BRIDGE_SCHEMA_VERSION = 1;

const unixSeconds = z.number().int().nonnegative();
const id = z.string().min(1).max(64);
const itemId = z.number().int().positive();
/** A character as the game shows it: `Name`, or `Name-Realm` for another realm. */
const unitName = z.string().min(2).max(48);
const raidGroup = z.number().int().min(1).max(8);

export const rosterEntrySchema = z.object({
  characterId: id,
  name: unitName,
  class: classSchema,
  spec: z.string().min(1).max(32).optional(),
  role: roleSchema,
});

/**
 * Why a bench character isn't on the roster: they answered Standby, they wait in the queue past
 * the raid size, or the leader or the comp benched them.
 */
export const BENCH_REASONS = ['standby', 'queued', 'benched'] as const;
export type BenchReason = (typeof BENCH_REASONS)[number];
/** The most bench entries an import carries. */
export const BENCH_MAX = 80;

/** Someone who could fill in: a roster entry for a character who isn't rostered, and why. */
export const benchEntrySchema = rosterEntrySchema.extend({ reason: z.enum(BENCH_REASONS) });

export const raidGroupSchema = z.object({
  group: raidGroup,
  characterIds: z.array(id).max(5),
});

export const lootSettingsSchema = z.object({
  /** The `LootMethod` id from `libs/loot-core` (softres, council, …). */
  methodId: z.string().min(1).max(32),
  methodVersion: z.number().int().positive(),
  configVersion: z.number().int().nonnegative(),
  /** The game's loot mode the addon sets with `SetLootMethod`. */
  mode: z.enum(['master', 'group']),
  /** Item quality from which the mode applies (2 uncommon … 5 legendary). */
  threshold: z.number().int().min(0).max(7).optional(),
});

export const rankedCandidateSchema = z.object({
  characterId: id,
  /** Human-readable reason from the loot method, shown in the loot popup. */
  reason: z.string().max(200),
});

export const itemCandidatesSchema = z.object({
  itemId,
  /** Best first. */
  ranked: z.array(rankedCandidateSchema).max(80),
});

const raidImportV1Object = z.object({
  v: z.literal(1),
  kind: z.literal('raid-import'),
  guildId: id,
  generatedAt: unixSeconds,
  raid: z.object({ eventId: id, title: z.string().min(1).max(100), startsAt: unixSeconds }),
  roster: z.array(rosterEntrySchema).max(80),
  /** Optional, so imports from before the bench still decode. */
  bench: z.array(benchEntrySchema).max(BENCH_MAX).optional(),
  groups: z.array(raidGroupSchema).max(8),
  loot: lootSettingsSchema,
  candidates: z.array(itemCandidatesSchema).max(1000),
});

type RaidImportShape = z.output<typeof raidImportV1Object>;

type Issue = (path: (string | number)[], message: string) => void;

/** Reports every value already seen earlier in the list. */
function checkUnique<T>(values: T[], path: (i: number) => (string | number)[], issue: Issue) {
  const seen = new Set<T>();
  values.forEach((v, i) => {
    if (seen.has(v)) issue(path(i), 'duplicate');
    seen.add(v);
  });
}

/**
 * Ids, groups, and items are unique; groups and candidates only name rostered characters;
 * no one sits in two groups; no one is both rostered and on the bench.
 */
function checkImportReferences(value: RaidImportShape, ctx: z.RefinementCtx): void {
  const issue: Issue = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  const rostered = new Set(value.roster.map((r) => r.characterId));
  const onRoster = (cid: string, path: (string | number)[]) => {
    if (!rostered.has(cid)) issue(path, 'not on the roster');
  };

  checkUnique(
    value.roster.map((r) => r.characterId),
    (i) => ['roster', i, 'characterId'],
    issue,
  );
  const bench = value.bench ?? [];
  checkUnique(
    bench.map((b) => b.characterId),
    (i) => ['bench', i, 'characterId'],
    issue,
  );
  bench.forEach((b, i) => {
    if (rostered.has(b.characterId)) issue(['bench', i, 'characterId'], 'also on the roster');
  });
  checkUnique(
    value.groups.map((g) => g.group),
    (i) => ['groups', i, 'group'],
    issue,
  );
  const placed = value.groups.flatMap((g, gi) =>
    g.characterIds.map((cid, ci) => ({ cid, path: ['groups', gi, 'characterIds', ci] })),
  );
  for (const { cid, path } of placed) onRoster(cid, path);
  checkUnique(
    placed.map((p) => p.cid),
    (i) => placed[i]?.path ?? ['groups'],
    issue,
  );

  checkUnique(
    value.candidates.map((c) => c.itemId),
    (i) => ['candidates', i, 'itemId'],
    issue,
  );
  value.candidates.forEach((item, ii) => {
    const path = (ci: number) => ['candidates', ii, 'ranked', ci, 'characterId'];
    item.ranked.forEach((c, ci) => {
      onRoster(c.characterId, path(ci));
    });
    checkUnique(
      item.ranked.map((c) => c.characterId),
      path,
      issue,
    );
  });
}

/** Web → game: who is coming, how to arrange them, and how loot is run. */
export const raidImportV1Schema = raidImportV1Object.superRefine(checkImportReferences);

export const attendanceSnapshotSchema = z.object({
  at: unixSeconds,
  /** What prompted the snapshot: `start`, `end`, a boss name, or `manual`. */
  label: z.string().min(1).max(64).optional(),
  members: z
    .array(
      z.object({
        name: unitName,
        /**
         * The game's class token, lowercased (`warrior`). Left open: game data is not rejected
         * for a class `libs/wow-data` doesn't list yet.
         */
        class: z.string().min(1).max(32).optional(),
        group: raidGroup,
        online: z.boolean(),
      }),
    )
    .max(40),
});

export const lootReceivedSchema = z.object({
  itemId,
  looter: unitName,
  at: unixSeconds,
  count: z.number().int().positive().optional(),
  /** Encounter the item dropped from, when known. */
  source: z.string().min(1).max(100).optional(),
});

/** Item info the client revealed (`C_Item.GetItemInfo`); Forever hides undiscovered items. */
export const itemSeenSchema = z.object({
  itemId,
  name: z.string().min(1).max(100),
  quality: z.number().int().min(0).max(8),
  itemLevel: z.number().int().nonnegative().optional(),
  equipLoc: z.string().max(40).optional(),
  classId: z.number().int().nonnegative().optional(),
  subclassId: z.number().int().nonnegative().optional(),
  icon: z.number().int().nonnegative().optional(),
});

/** Game → web: what happened in the raid, plus item data seen along the way. */
export const raidExportV1Schema = z.object({
  v: z.literal(1),
  kind: z.literal('raid-export'),
  exportedAt: unixSeconds,
  addonVersion: z.string().min(1).max(32),
  exporter: unitName,
  /** Echoed from the import when the raid was imported, so the web can match the event. */
  guildId: id.optional(),
  eventId: id.optional(),
  attendance: z.array(attendanceSnapshotSchema).max(100),
  loot: z.array(lootReceivedSchema).max(1000),
  items: z.array(itemSeenSchema).max(5000),
});

export type RaidImport = z.output<typeof raidImportV1Schema>;
export type RaidExport = z.output<typeof raidExportV1Schema>;
export type BridgePayload = RaidImport | RaidExport;
export type BridgeKind = BridgePayload['kind'];

/** Schema per kind at the current version. Older versions get their own entries when v2 lands. */
export const PAYLOAD_SCHEMAS = {
  'raid-import': raidImportV1Schema,
  'raid-export': raidExportV1Schema,
} as const satisfies Record<BridgeKind, z.ZodType>;
