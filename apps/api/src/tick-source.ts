// The coordinator's read path over the module stores. Pure over ports, so Convex (stores.ts) and
// the in-memory JTBD host read the same way.
import type {
  CoordinatorStore,
  TickAway,
  TickMember,
  TickRecorded,
  TickSource,
  TickUsuallyLate,
} from '@vintage/coordinator/commands';
import { SUMMARY_WINDOW_MS } from '@vintage/coordinator/contract';
import type { IdentityStore } from '@vintage/identity/commands';
import type { LootStore } from '@vintage/loot/commands';
import type { RaidsStore } from '@vintage/raids/commands';
import {
  type Absence,
  accessOf,
  DEFAULT_TIMINGS,
  type RaidAttendance,
  type RaidEvent,
  resolveAbsenceCoverage,
  type Signup,
  type Weekday,
} from '@vintage/raids/contract';

/** How far ahead the coordinator looks; longer than any schedule's lead window (28 days max). */
export const LOOKAHEAD_MS = 29 * 24 * 60 * 60 * 1000;

/**
 * A recorded raid's attendance for its summary post: who came, and who stood by and was credited
 * for it (#222), apart.
 */
export function cameAndStoodBy(attendance: Pick<RaidAttendance, 'name' | 'stoodBy'>[]): {
  attended: string[];
  stoodBy: string[];
} {
  return {
    attended: attendance.filter((a) => !a.stoodBy).map((a) => a.name),
    stoodBy: attendance.filter((a) => a.stoodBy).map((a) => a.name),
  };
}

const WEEKDAY_PLURAL: Record<Weekday, string> = {
  sun: 'Sundays',
  mon: 'Mondays',
  tue: 'Tuesdays',
  wed: 'Wednesdays',
  thu: 'Thursdays',
  fri: 'Fridays',
  sat: 'Saturdays',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}`;
}

function absenceSummary(absence: Absence): string {
  if (absence.kind === 'dates' && absence.from && absence.to) {
    return absence.from === absence.to
      ? shortDate(absence.from)
      : `${shortDate(absence.from)} to ${shortDate(absence.to)}`;
  }
  const days = (absence.nights ?? [])
    .filter((n) => n.type === 'away')
    .map((n) => WEEKDAY_PLURAL[n.day]);
  return days.length ? days.join(', ') : 'weekly';
}

function eventAbsences(
  event: RaidEvent,
  signups: readonly Signup[],
  members: readonly TickMember[],
  absencesByMember: ReadonlyMap<string, Absence[]>,
): { away: TickAway[]; usuallyLate: TickUsuallyLate[] } {
  // Absences apply to guild raids only (absences.plan.md §4).
  if (accessOf(event) !== 'guild') return { away: [], usuallyLate: [] };
  const answered = new Set(signups.map((s) => s.memberId));
  const away: TickAway[] = [];
  const usuallyLate: TickUsuallyLate[] = [];
  for (const m of members) {
    if (answered.has(m.memberId)) continue;
    const list = absencesByMember.get(m.memberId);
    if (!list?.length) continue;
    const { coverage, absence } = resolveAbsenceCoverage(list, event.startsAt);
    if (coverage === 'away' && absence) {
      away.push({
        memberId: m.memberId,
        displayName: m.displayName,
        reason: absence.reason,
        summary: absenceSummary(absence),
      });
    } else if (coverage && coverage !== 'away') {
      usuallyLate.push({
        memberId: m.memberId,
        displayName: m.displayName,
        lateMinutes: coverage.lateMinutes,
      });
    }
  }
  away.sort((a, b) => a.displayName.localeCompare(b.displayName));
  usuallyLate.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { away, usuallyLate };
}

export function createTickSource(stores: {
  raids: RaidsStore;
  identity: IdentityStore;
  coordinator: CoordinatorStore;
  loot: Pick<LootStore, 'listDrops'>;
}): TickSource {
  const { raids, identity, coordinator, loot } = stores;
  /** Raids that started in the summary window and have a recorded export (#221). */
  const recordedRaids = async (guildId: string, now: number): Promise<TickRecorded[]> => {
    const done = await raids.listEvents(guildId, {
      from: now - SUMMARY_WINDOW_MS,
      to: now,
      statuses: ['completed'],
    });
    const out: TickRecorded[] = [];
    for (const event of done) {
      const record = await raids.getRecord(guildId, event.id);
      if (!record) continue;
      const [attendance, drops] = await Promise.all([
        raids.listAttendance(guildId, event.id),
        loot.listDrops(guildId, event.id),
      ]);
      out.push({
        tick: { event, timings: DEFAULT_TIMINGS, signups: [] },
        record,
        ...cameAndStoodBy(attendance),
        drops: drops.map(({ itemId, itemName, count, looter }) => ({
          itemId,
          itemName,
          count,
          looter,
        })),
      });
    }
    return out;
  };
  return {
    load: async (guildId, now) => {
      const config = await coordinator.getConfig(guildId);
      const window = { from: now, to: now + LOOKAHEAD_MS };
      const events = await raids.listEvents(guildId, { ...window, statuses: ['open', 'locked'] });
      // Cancelled raids matter only for server events, which get cancelled with them.
      const cancelled = config.serverEvents
        ? await raids.listEvents(guildId, { ...window, statuses: ['cancelled'] })
        : [];
      const [membersRaw, activeAbsences] = await Promise.all([
        identity.listMembers(guildId),
        raids.listAbsences(guildId, { activeOnly: true }),
      ]);
      const members: TickMember[] = membersRaw.map((m) => ({
        memberId: m.id,
        discordId: m.discordId,
        displayName: m.displayName,
        rank: m.rank,
        dmOptOut: m.prefs.dmOptOut,
      }));
      const absencesByMember = new Map<string, Absence[]>();
      for (const a of activeAbsences) {
        const list = absencesByMember.get(a.memberId) ?? [];
        list.push(a);
        absencesByMember.set(a.memberId, list);
      }
      const toTick = async (event: RaidEvent) => {
        const [schedule, signups] = await Promise.all([
          event.scheduleId ? raids.getSchedule(guildId, event.scheduleId) : Promise.resolve(null),
          raids.listSignups(guildId, event.id),
        ]);
        return {
          event,
          timings: schedule?.timings ?? DEFAULT_TIMINGS,
          signups,
          ...eventAbsences(event, signups, members, absencesByMember),
        };
      };
      const ticks = await Promise.all(events.map(toTick));
      const recorded = await recordedRaids(guildId, now);
      const eventIds = [...events, ...cancelled, ...recorded.map((r) => r.tick.event)].map(
        (e) => e.id,
      );
      const liveEventIds = events.map((e) => e.id);
      const [actions, announced] = await Promise.all([
        eventIds.length ? coordinator.listActions(guildId, { eventIds }) : Promise.resolve([]),
        liveEventIds.length && coordinator.listAnnouncedState
          ? coordinator.listAnnouncedState(guildId, liveEventIds)
          : Promise.resolve([]),
      ]);
      return {
        guildId,
        config,
        events: ticks,
        // A cancelled raid needs no signups or timings, only its id for the action log.
        cancelled: cancelled.map((event) => ({ event, timings: DEFAULT_TIMINGS, signups: [] })),
        recorded,
        members,
        actions,
        announced,
      };
    },
  };
}
