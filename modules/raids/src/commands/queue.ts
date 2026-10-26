import type { RaidEvent } from '../contract';
import { GOING, queuePositions } from '../domain/queue';
import type { RaidsDeps } from '../store';

/**
 * Recompute who is queued after a signup changed, and record promotions: a queued member whose
 * turn came up gets `promotedAt` and a `signup-promoted` event (the coordinator tells them).
 */
export async function syncQueue(deps: RaidsDeps, guildId: string, event: RaidEvent, at: number) {
  const signups = await deps.raids.listSignups(guildId, event.id);
  const positions = queuePositions(signups, event.size);
  for (const s of signups) {
    const queued = positions.has(s.id);
    if (queued === s.queued) continue;
    const promoted = s.queued && !queued && GOING.has(s.status);
    await deps.raids.updateSignup(guildId, s.id, {
      queued,
      ...(promoted ? { promotedAt: at } : {}),
    });
    if (promoted) {
      await deps.events.emit(guildId, 'signup-promoted', {
        eventId: event.id,
        memberId: s.memberId,
        characterId: s.characterId,
      });
    }
  }
}
