// Pure: what raid-export-record stores from a checked export (#29). Being in any snapshot counts
// as attending (decided with #29, 2026-10-29); how much of the night someone was there for is
// kept alongside, so a loot method can weigh it.
import type { RaidExport } from '@vintage/bridge-format';
import type { LootDropInput } from '@vintage/loot/contract';
import type { ExportCheck, RaidAttendanceInput, RaidEvent, Signup } from '../contract';

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

/** Everyone in any snapshot, matched as the check matched them, sorted by name. */
export function attendanceFrom(exported: RaidExport, check: ExportCheck): RaidAttendanceInput[] {
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
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
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
