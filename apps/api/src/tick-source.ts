// The coordinator's read path over the module stores. Pure over ports, so Convex (stores.ts) and
// the in-memory JTBD host read the same way.
import type { CoordinatorStore, TickMember, TickSource } from '@vintage/coordinator/commands';
import type { IdentityStore } from '@vintage/identity/commands';
import type { RaidsStore } from '@vintage/raids/commands';
import { DEFAULT_TIMINGS, type RaidEvent } from '@vintage/raids/contract';

/** How far ahead the coordinator looks; longer than any schedule's lead window (28 days max). */
export const LOOKAHEAD_MS = 29 * 24 * 60 * 60 * 1000;

export function createTickSource(stores: {
  raids: RaidsStore;
  identity: IdentityStore;
  coordinator: CoordinatorStore;
}): TickSource {
  const { raids, identity, coordinator } = stores;
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
      const eventIds = [...events, ...cancelled].map((e) => e.id);
      return {
        guildId,
        config,
        events: ticks,
        // A cancelled raid needs no signups or timings, only its id for the action log.
        cancelled: cancelled.map((event) => ({ event, timings: DEFAULT_TIMINGS, signups: [] })),
        members,
        actions: eventIds.length ? await coordinator.listActions(guildId, { eventIds }) : [],
      };
    },
  };
}
