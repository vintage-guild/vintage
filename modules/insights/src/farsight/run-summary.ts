// Copied from Farsight (github.com/Falkicon/Farsight, private) packages/schemas/src/run-summary.ts
// at 16dd97e6b6d6ace5dbb425474f8ecb96a52dcefa (@farsight/schemas 0.1.0). Do not edit here:
// change it in Farsight and copy it again. Replace with the published package (#138).

import { z } from 'zod';

/**
 * RunSummary v1: one dungeon or raid run reconstructed from a combat log.
 *
 * This is the wire format shared by the analyzer (@farsight/core), the local store, the
 * briefing generator, and uploads. Keys are snake_case to stay byte-compatible with the
 * Python oracle. Times inside a run are seconds relative to the run start.
 */

export const RUN_SUMMARY_VERSION = 1;

const num = z.number();
const nullableNum = z.number().nullable();
const counts = z.record(z.string(), z.number());

export const abilitySchema = z.object({
  npc_id: num,
  npc_name: z.string(),
  spell_id: num,
  spell_name: z.string(),
  casts: num,
  completed: num,
  interrupted: num,
  hits: num,
  total: num,
  max_hit: num,
  intervals: z.array(num),
  cast_times: z.array(num),
  kick_times: z.array(num),
  openers: z.array(num),
  aoe_events: num,
  aoe_victims: num,
  periodic: num,
  crits: num,
  auras: counts,
  school: nullableNum,
  interval: nullableNum,
  cast_time: nullableNum,
  opener: nullableNum,
  targets: nullableNum,
});

export const interruptSchema = z.object({
  t: num,
  by: z.string(),
  spell: z.string().nullable(),
  target: z.string().nullable(),
  npc_id: nullableNum,
  interrupted: z.string().nullable(),
  interrupted_id: nullableNum,
});

export const pullSchema = z.object({
  idx: num,
  start: num,
  end: num,
  duration: num,
  gap_before: nullableNum,
  npcs: z.array(z.object({ npc_id: num, name: z.string(), count: num, killed: num })),
  centroid: z.object({ x: num, y: num, map: nullableNum }).nullable(),
  taken: counts,
  done: counts,
  heal: counts,
  tank: z.string().nullable(),
  peak_intake: z.object({ name: z.string().nullable(), amount: num }),
  deaths: z.array(num),
  interrupts: z.array(interruptSchema),
  casts: counts,
  encounter: z.object({ id: z.string().optional(), name: z.string().optional() }).nullable(),
});

export const deathSchema = z.object({
  t: num,
  player: z.string(),
  pull: nullableNum,
  damage_last_10s: num,
  killing_blow: z.object({ source: z.string(), spell: z.string(), amount: num }).nullable(),
  last_hits: z.array(z.object({ dt: num, source: z.string(), spell: z.string(), amount: num })),
  own_casts_last_8s: z.array(z.string()),
  environment: z.boolean(),
});

export const mobSchema = z.object({
  npc_id: num,
  name: z.string(),
  seen: num,
  level: num,
  hp: num,
  kills: num,
  ttk: z.array(num),
  to_group: num,
  deaths_caused: num,
});

export const runSummarySchema = z.object({
  run_key: z.string(),
  file: z.string(),
  start_ts: num,
  end_ts: num,
  start_offset: num,
  end_offset: num,
  zone_id: num,
  zone_name: z.string(),
  difficulty: num,
  is_instance: z.boolean(),
  map_id: nullableNum,
  map_name: z.string().nullable(),
  map_bounds: z.array(num).nullable(),
  build: z.string(),
  project: z.string(),
  events: num,
  duration: num,
  in_combat: num,
  between_pulls: num,
  avg_gap: nullableNum,
  longest_gap: z.object({ before_pull: num, seconds: num }).nullable(),
  tank: z.string().nullable(),
  roster: z.array(z.object({ name: z.string(), done: num, heal: num, taken: num, deaths: num })),
  pulls: z.array(pullSchema),
  deaths: z.array(deathSchema),
  interrupts: z.array(interruptSchema),
  kicks: z.array(z.object({ player: z.string(), attempts: num, landed: num })),
  abilities: z.array(abilitySchema),
  mobs: z.array(mobSchema),
  encounters: z.array(z.record(z.string(), z.unknown())),
});

export type RunSummaryV1 = z.infer<typeof runSummarySchema>;

/** The upload wrapper: versioned so the server can reject or migrate old clients. */
export const runUploadSchema = z.object({
  schema: z.literal('farsight.run'),
  version: z.literal(RUN_SUMMARY_VERSION),
  parser: z.object({ name: z.string(), version: z.string() }),
  run: runSummarySchema,
});

export type RunUploadV1 = z.infer<typeof runUploadSchema>;
