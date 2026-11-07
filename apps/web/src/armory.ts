// The characters page's armory reads: the member's links by character, and whether a fetch is
// still in flight (the page polls until it lands, since the fetch runs after the command).
import type { ArmoryEntry } from '@vintage/armory/contract';
import { type ArmoryCardEntry, getCommandClient } from '@vintage/ui-kit';

/** Polls after a link or refresh: every 3 s, at most this many times (about half a minute). */
export const ARMORY_POLL_MS = 3000;
export const ARMORY_POLL_TRIES = 10;

export type ArmoryRead =
  | { ok: true; byCharacter: Record<string, ArmoryCardEntry> }
  | { ok: false; message: string };

/** Your armory links (`armory-list`), keyed by character id. */
export async function readArmory(): Promise<ArmoryRead> {
  const result = await getCommandClient().read<ArmoryEntry[]>('armory-list', {});
  if (!result.success || !result.data) {
    return {
      ok: false,
      message: result.success ? 'No armory data' : (result.error?.message ?? 'Could not read'),
    };
  }
  return { ok: true, byCharacter: Object.fromEntries(result.data.map((e) => [e.characterId, e])) };
}

/** A link waiting on the armory: never checked, or asked again since the last check. */
export const inFlight = (e: Pick<ArmoryCardEntry, 'status' | 'requestedAt' | 'checkedAt'>) =>
  e.status === 'pending' || e.checkedAt === null || e.requestedAt > e.checkedAt;
