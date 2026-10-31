// Pure: what a raid's addon export says, matched against the raid's signups (#29, read-only).
// The export comes from the Vintage addon (libs/bridge-format `raid-export`); nothing here
// records attendance or loot. Names are matched the way the game shows them: `Name` on the
// player's realm, `Name-Realm` otherwise, case-insensitively.
import type { RaidExport } from '@vintage/bridge-format';
import type {
  ExportAttendee,
  ExportBoss,
  ExportCheck,
  ExportLoot,
  ExportSnapshot,
  ExportWarning,
  RaidEvent,
  Signup,
} from '../contract';

const HOUR_MS = 3600 * 1000;
/** A snapshot this long before the raid's start, or this long after, still fits the raid. */
const BEFORE_START_MS = 2 * HOUR_MS;
const AFTER_START_MS = 10 * HOUR_MS;

/**
 * The signups the raid counted on: the roster once a leader has put anyone in a group (as
 * raid-complete does), else everyone going who has a spot (not queued, not benched).
 */
export function expectedSignups(signups: Signup[]): Signup[] {
  const rostered = signups.filter((s) => s.roster === 'rostered');
  if (rostered.length) return rostered;
  return signups.filter(
    (s) => (s.status === 'accepted' || s.status === 'late') && !s.queued && s.roster !== 'benched',
  );
}

const key = (name: string) => name.toLocaleLowerCase('en-US');

/** `Doran-Stonemaul` → `doran`; `Aeryn` → `aeryn`. */
const baseKey = (name: string) => key(name.split('-')[0] ?? name);

interface Match {
  signup: Signup;
  withoutRealm: boolean;
}

/**
 * Finds a signup by the name the game showed. A `Name-Realm` falls back to a signup for `Name`
 * only when the export has no plain `Name` and no other realm's `Name`, since those would be
 * the guild's own player or a second stranger; such matches are flagged.
 */
export function signupMatcher(
  signups: Signup[],
  exportedNames: string[],
): (name: string) => Match | null {
  const byName = new Map<string, Signup>();
  for (const s of signups) {
    if (!byName.has(key(s.characterName))) byName.set(key(s.characterName), s);
  }
  const plain = new Set(exportedNames.filter((n) => !n.includes('-')).map(key));
  const realms = new Map<string, Set<string>>();
  for (const n of exportedNames) {
    if (!n.includes('-')) continue;
    const seen = realms.get(baseKey(n)) ?? new Set<string>();
    seen.add(key(n));
    realms.set(baseKey(n), seen);
  }
  return (name) => {
    const exact = byName.get(key(name));
    if (exact) return { signup: exact, withoutRealm: false };
    const base = baseKey(name);
    if (!name.includes('-') || plain.has(base) || (realms.get(base)?.size ?? 0) > 1) return null;
    const loose = byName.get(base);
    return loose ? { signup: loose, withoutRealm: true } : null;
  };
}

/** "3 hours", "2 days". */
function span(ms: number): string {
  const hours = Math.round(ms / HOUR_MS);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.round(hours / 24)} days`;
}

function warningsFor(
  exported: RaidExport,
  event: RaidEvent | null,
  options: { otherGuild: boolean; eventSource: ExportCheck['eventSource'] },
): ExportWarning[] {
  const warnings: ExportWarning[] = [];
  if (options.otherGuild) {
    warnings.push({
      code: 'OTHER_GUILD',
      message: 'This export names another guild, so the raid it names was ignored.',
    });
  }
  if (!event) return warnings;
  if (
    options.eventSource === 'input' &&
    !options.otherGuild &&
    exported.eventId !== undefined &&
    exported.eventId !== event.id
  ) {
    warnings.push({
      code: 'OTHER_RAID',
      message: `The addon made this export for a different raid than ${event.name}.`,
    });
  }
  const times = exported.attendance.map((s) => s.at * 1000);
  const fits = times.some(
    (t) => t >= event.startsAt - BEFORE_START_MS && t <= event.startsAt + AFTER_START_MS,
  );
  if (times.length && !fits) {
    const first = Math.min(...times);
    const when = first < event.startsAt ? 'before' : 'after';
    warnings.push({
      code: 'TIMES_APART',
      message: `The export’s first snapshot is ${span(Math.abs(first - event.startsAt))} ${when} ${event.name} started.`,
    });
  }
  return warnings;
}

/**
 * The export matched to a raid. `event` is null when there's no raid to match against (a pick-up
 * raid, or an id from another guild); nobody is then reported as unknown or absent.
 */
export function checkExport(
  exported: RaidExport,
  event: RaidEvent | null,
  signups: Signup[],
  options: { guildId: string; eventSource: ExportCheck['eventSource'] },
): ExportCheck {
  const names = [
    ...exported.attendance.flatMap((s) => s.members.map((m) => m.name)),
    ...exported.loot.map((l) => l.looter),
  ];
  const match = signupMatcher(event ? signups : [], names);
  const itemNames = new Map(exported.items.map((i) => [i.itemId, i.name]));

  const attendees = new Map<string, ExportAttendee>();
  const snapshots: ExportSnapshot[] = exported.attendance.map((snapshot) => {
    for (const m of snapshot.members) {
      const seen = attendees.get(key(m.name));
      if (seen) {
        seen.snapshots += 1;
        continue;
      }
      const found = match(m.name);
      attendees.set(key(m.name), {
        name: m.name,
        ...(m.class ? { class: m.class } : {}),
        snapshots: 1,
        characterId: found?.signup.characterId ?? null,
        memberId: found?.signup.memberId ?? null,
        status: found?.signup.status ?? null,
        matchedWithoutRealm: found?.withoutRealm ?? false,
      });
    }
    return {
      at: snapshot.at,
      label: snapshot.label ?? null,
      present: snapshot.members.length,
      online: snapshot.members.filter((m) => m.online).length,
    };
  });

  const loot: ExportLoot[] = exported.loot.map((drop) => ({
    itemId: drop.itemId,
    itemName: itemNames.get(drop.itemId) ?? null,
    looter: drop.looter,
    characterId: match(drop.looter)?.signup.characterId ?? null,
    at: drop.at,
    count: drop.count ?? 1,
    source: drop.source ?? null,
  }));

  const seen = [...attendees.values()];
  const seenCharacters = new Set(
    seen.map((a) => a.characterId).filter((id): id is string => id !== null),
  );
  const absent = event
    ? expectedSignups(signups)
        .filter((s) => !seenCharacters.has(s.characterId))
        .map((s) => ({
          characterId: s.characterId,
          characterName: s.characterName,
          status: s.status,
        }))
    : [];
  const otherGuild = exported.guildId !== undefined && exported.guildId !== options.guildId;

  return {
    event: event
      ? { id: event.id, name: event.name, startsAt: event.startsAt, status: event.status }
      : null,
    eventSource: options.eventSource,
    otherGuild,
    exporter: exported.exporter,
    exportedAt: exported.exportedAt,
    addonVersion: exported.addonVersion,
    snapshots,
    attendees: seen,
    loot,
    itemsSeen: exported.items.length,
    // Without a raid there's no signup list to be missing from.
    unknownNames: event ? seen.filter((a) => a.characterId === null).map((a) => a.name) : [],
    absent,
    declinedButSeen: seen.filter((a) => a.status === 'declined').map((a) => a.name),
    bosses: bossesFrom(exported),
    standby: (exported.standby ?? []).map(({ characterId, name, reason }) => ({
      characterId,
      name,
      reason,
    })),
    warnings: warningsFor(exported, event, { otherGuild, eventSource: options.eventSource }),
  };
}

/** The export's boss attempts grouped by boss (its id, else its name), in the order first pulled. */
export function bossesFrom(exported: RaidExport): ExportBoss[] {
  const byKey = new Map<string, ExportBoss>();
  for (const attempt of exported.encounters ?? []) {
    const key =
      attempt.encounterId === undefined ? `name:${attempt.name}` : `id:${attempt.encounterId}`;
    let boss = byKey.get(key);
    if (!boss) {
      boss = {
        encounterId: attempt.encounterId ?? null,
        name: attempt.name,
        attempts: 0,
        kills: 0,
        wipes: 0,
        firstKilledAt: null,
        seconds: 0,
      };
      byKey.set(key, boss);
    }
    boss.attempts += 1;
    boss.seconds += Math.max(0, attempt.endedAt - attempt.startedAt);
    if (attempt.killed) {
      boss.kills += 1;
      boss.firstKilledAt = Math.min(boss.firstKilledAt ?? attempt.endedAt, attempt.endedAt);
    } else {
      boss.wipes += 1;
    }
  }
  return [...byKey.values()];
}

/** "2 bosses killed, 14 wipes". */
function bossesNote(bosses: ExportBoss[]): string {
  const killed = bosses.filter((b) => b.kills > 0).length;
  const wipes = bosses.reduce((n, b) => n + b.wipes, 0);
  return `${killed} boss${killed === 1 ? '' : 'es'} killed, ${wipes} wipe${wipes === 1 ? '' : 's'}`;
}

/** One line for a person: "Molten Core: 3 people over 3 snapshots, 2 drops; 1 not signed up". */
export function summarize(check: ExportCheck): string {
  const where = check.event ? check.event.name : 'No raid matched';
  const people = `${check.attendees.length} ${check.attendees.length === 1 ? 'person' : 'people'}`;
  const parts = [
    `${where}: ${people} over ${check.snapshots.length} snapshot${check.snapshots.length === 1 ? '' : 's'}`,
    `${check.loot.length} drop${check.loot.length === 1 ? '' : 's'}`,
  ];
  if (check.standby.length) parts.push(`${check.standby.length} stood by`);
  if (check.bosses.length) parts.push(bossesNote(check.bosses));
  const notes: string[] = [];
  if (check.event && check.unknownNames.length)
    notes.push(`${check.unknownNames.length} not signed up`);
  if (check.absent.length) notes.push(`${check.absent.length} expected but not seen`);
  if (check.declinedButSeen.length) notes.push(`${check.declinedButSeen.length} declined but came`);
  if (check.warnings.length)
    notes.push(`${check.warnings.length} warning${check.warnings.length === 1 ? '' : 's'}`);
  return `${parts.join(', ')}${notes.length ? `; ${notes.join(', ')}` : ''}`;
}
