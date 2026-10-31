// Pure: what raid-export-record stores from a checked export (#29). Being in any snapshot counts
// as attending (decided with #29, 2026-10-29), and so does standing by on the bench (full credit,
// decided 2026-10-30, #222); how much of the night someone was there for is kept alongside, so a
// loot method can weigh it.
import type { RaidExport } from '@vintage/bridge-format';
import type { LootDropInput } from '@vintage/loot/contract';
import { findBoss } from '@vintage/progress/contract';
import type {
  ExportCheck,
  ExportKill,
  RaidAttendanceInput,
  RaidEvent,
  RecordBosses,
  Signup,
} from '../contract';

const key = (name: string) => name.toLocaleLowerCase('en-US');

/** Identifies one export: the same export pasted twice has the same key. */
export const exportKey = (exported: RaidExport) => `${exported.exporter}@${exported.exportedAt}`;

type Snapshot = RaidExport['attendance'][number];

/** Counts one more snapshot for someone already seen in an earlier one. */
function seenAgain(person: RaidAttendanceInput, snapshot: Snapshot, cls: string | undefined) {
  person.snapshots += 1;
  person.lastSeenAt = snapshot.at * 1000;
  if (snapshot.label && !person.labels.includes(snapshot.label)) person.labels.push(snapshot.label);
  person.class ??= cls ?? null;
}

/**
 * Everyone in any snapshot, matched as the check matched them, and everyone the leader confirmed
 * stood by (matched to their signup by character), sorted by name.
 */
export function attendanceFrom(
  exported: RaidExport,
  check: ExportCheck,
  signups: Signup[],
): RaidAttendanceInput[] {
  const matched = new Map(check.attendees.map((a) => [key(a.name), a]));
  const people = new Map<string, RaidAttendanceInput>();
  for (const snapshot of [...exported.attendance].sort((a, b) => a.at - b.at)) {
    for (const m of snapshot.members) {
      const seen = people.get(key(m.name));
      if (seen) {
        seenAgain(seen, snapshot, m.class);
        continue;
      }
      const match = matched.get(key(m.name));
      people.set(key(m.name), {
        name: m.name,
        class: m.class ?? null,
        characterId: match?.characterId ?? null,
        memberId: match?.memberId ?? null,
        snapshots: 1,
        labels: snapshot.label ? [snapshot.label] : [],
        firstSeenAt: snapshot.at * 1000,
        lastSeenAt: snapshot.at * 1000,
      });
    }
  }
  creditStandby(people, exported, check, signups);
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds everyone the leader confirmed stood by, unless a snapshot has them already. */
function creditStandby(
  people: Map<string, RaidAttendanceInput>,
  exported: RaidExport,
  check: ExportCheck,
  signups: Signup[],
): void {
  const signupOf = new Map(signups.map((s) => [s.characterId, s]));
  for (const standby of check.standby) {
    // Someone who came in after all is in a snapshot already: they attended.
    if (people.has(key(standby.name))) continue;
    const signup = signupOf.get(standby.characterId);
    people.set(key(standby.name), {
      name: standby.name,
      class: null,
      characterId: signup ? signup.characterId : null,
      memberId: signup ? signup.memberId : null,
      snapshots: 0,
      labels: [],
      firstSeenAt: exported.exportedAt * 1000,
      lastSeenAt: exported.exportedAt * 1000,
      stoodBy: true,
    });
  }
}

/** The export's loot, under the raid's loot method, with the looter's member when matched. */
export function dropsFrom(
  check: ExportCheck,
  event: RaidEvent,
  signups: Signup[],
  recordedAt: number,
): LootDropInput[] {
  const memberOf = new Map(signups.map((s) => [s.characterId, s.memberId]));
  return check.loot.map((drop) => ({
    itemId: drop.itemId,
    itemName: drop.itemName,
    count: drop.count,
    looter: drop.looter,
    characterId: drop.characterId,
    memberId: drop.characterId ? (memberOf.get(drop.characterId) ?? null) : null,
    at: drop.at * 1000,
    source: drop.source,
    lootMethodId: event.lootMethodId,
    recordedAt,
  }));
}

/** Signed-up people seen, once each, for the raid's events. */
export function attendeesOf(
  attendance: RaidAttendanceInput[],
): { memberId: string; characterId: string }[] {
  const seen = new Map<string, { memberId: string; characterId: string }>();
  for (const a of attendance) {
    if (a.memberId && a.characterId && !seen.has(a.characterId)) {
      seen.set(a.characterId, { memberId: a.memberId, characterId: a.characterId });
    }
  }
  return [...seen.values()];
}

/** Each boss the export killed, with the launch boss it matched (by id once known, else name). */
export function killsFrom(check: ExportCheck): ExportKill[] {
  return check.bosses.flatMap((b) => {
    if (b.firstKilledAt === null) return [];
    const match = findBoss(b);
    return [
      {
        name: b.name,
        encounterId: b.encounterId,
        killedAt: b.firstKilledAt * 1000,
        raidId: match?.raid.id ?? null,
        bossId: match?.boss.id ?? null,
      },
    ];
  });
}

/** The night's boss attempts in sum, or null for an export without any. */
export function tallyBosses(exported: RaidExport, check: ExportCheck): RecordBosses | null {
  const attempts = exported.encounters ?? [];
  if (!attempts.length) return null;
  // The raid is whichever launch raid the attempts, kills or wipes, matched first. Against it,
  // only its own bosses count, so an encounter that isn't one of them can't make 9/8.
  const raid = check.bosses.map((b) => findBoss(b)?.raid).find((r) => r !== undefined);
  const counts = (b: ExportCheck['bosses'][number]) => !raid || findBoss(b)?.raid.id === raid.id;
  return {
    killed: check.bosses.filter((b) => b.kills > 0 && counts(b)).length,
    total: raid?.bosses.length ?? null,
    wipes: check.bosses.reduce((n, b) => n + b.wipes, 0),
    firstPullAt: Math.min(...attempts.map((a) => a.startedAt)) * 1000,
    lastEndAt: Math.max(...attempts.map((a) => a.endedAt)) * 1000,
  };
}
