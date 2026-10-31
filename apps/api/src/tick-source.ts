// The coordinator's read path over the module stores. Pure over ports, so Convex (stores.ts) and
// the in-memory JTBD host read the same way.
import type {
  CoordinatorStore,
  TickMember,
  TickRecorded,
  TickSource,
} from '@vintage/coordinator/commands';
import { SUMMARY_WINDOW_MS } from '@vintage/coordinator/contract';
import type { IdentityStore } from '@vintage/identity/commands';
import type { LootStore } from '@vintage/loot/commands';
import type { RaidsStore } from '@vintage/raids/commands';
import { DEFAULT_TIMINGS, type RaidAttendance, type RaidEvent } from '@vintage/raids/contract';

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
      const toTick = async (event: RaidEvent) => {
        const schedule = event.scheduleId
          ? await raids.getSchedule(guildId, event.scheduleId)
          : null;
        return {
          event,
          timings: schedule?.timings ?? DEFAULT_TIMINGS,
          signups: await raids.listSignups(guildId, event.id),
        };
      };
      const ticks = await Promise.all(events.map(toTick));
      const members: TickMember[] = (await identity.listMembers(guildId)).map((m) => ({
        memberId: m.id,
        discordId: m.discordId,
        displayName: m.displayName,
        rank: m.rank,
        dmOptOut: m.prefs.dmOptOut,
      }));
      const recorded = await recordedRaids(guildId, now);
      const eventIds = [...events, ...cancelled, ...recorded.map((r) => r.tick.event)].map(
        (e) => e.id,
      );
      return {
        guildId,
        config,
        events: ticks,
        // A cancelled raid needs no signups or timings, only its id for the action log.
        cancelled: cancelled.map((event) => ({ event, timings: DEFAULT_TIMINGS, signups: [] })),
        recorded,
        members,
        actions: eventIds.length ? await coordinator.listActions(guildId, { eventIds }) : [],
      };
    },
  };
}
