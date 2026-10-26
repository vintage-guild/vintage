// Pure: the launch raids plus the guild's kills → the progress view. No store, no clock.
import {
  type FirstKill,
  type Kill,
  LAUNCH_RAIDS,
  type Progress,
  RAIDS_OPEN_AT,
  RAIDS_OPEN_ON,
  type Raid,
  type RaidProgress,
} from '../contract';

/** The earliest kill per boss, keyed `raidId/bossId`. */
export function firstKills(kills: readonly Kill[]): Map<string, Kill> {
  const first = new Map<string, Kill>();
  for (const kill of kills) {
    const key = `${kill.raidId}/${kill.bossId}`;
    const seen = first.get(key);
    if (!seen || kill.killedAt < seen.killedAt) first.set(key, kill);
  }
  return first;
}

function raidProgress(raid: Raid, first: Map<string, Kill>): RaidProgress {
  const bosses = raid.bosses.map((boss) => {
    const kill = first.get(`${raid.id}/${boss.id}`);
    return { ...boss, firstKillAt: kill?.killedAt ?? null, loot: kill?.loot ?? [] };
  });
  return {
    id: raid.id,
    name: raid.name,
    size: raid.size,
    bosses,
    killed: bosses.filter((b) => b.firstKillAt !== null).length,
    total: bosses.length,
    nextBossId: bosses.find((b) => b.firstKillAt === null)?.id ?? null,
  };
}

/** Build the ledger. `now` decides `open`; `raids` defaults to the launch raids. */
export function buildProgress(
  kills: readonly Kill[],
  now: number,
  raids: readonly Raid[] = LAUNCH_RAIDS,
  opensAt = RAIDS_OPEN_AT,
  opensOn = RAIDS_OPEN_ON,
): Progress {
  const first = firstKills(kills);
  const rows = raids.map((raid) => raidProgress(raid, first));
  let latest: FirstKill | null = null;
  for (const raid of rows) {
    for (const boss of raid.bosses) {
      if (boss.firstKillAt !== null && (!latest || boss.firstKillAt > latest.killedAt)) {
        latest = {
          raidId: raid.id,
          raidName: raid.name,
          bossId: boss.id,
          bossName: boss.name,
          killedAt: boss.firstKillAt,
          loot: boss.loot,
        };
      }
    }
  }
  return {
    opensAt,
    opensOn,
    open: now >= opensAt,
    raids: rows,
    killed: rows.reduce((n, r) => n + r.killed, 0),
    total: rows.reduce((n, r) => n + r.total, 0),
    latest,
  };
}
