// The signup queue (inspired by Raid-Helper's queue-and-promote): when more people say they're
// going than the raid holds, the earliest answers are in and the rest wait in line. Pure.
import type { SignupStatus } from '@vintage/comp-solver';
import type { Signup } from '../contract';

/** Answers that take a raid spot. */
export const GOING: ReadonlySet<SignupStatus> = new Set(['accepted', 'late']);

/**
 * Moving to one of these from a different answer gives up your place in line (you keep it when
 * you only change character, or switch between accepted and late).
 */
export const LOSES_PLACE: ReadonlySet<SignupStatus> = new Set(['tentative', 'bench', 'declined']);

/** Queue position (1-based) for each going signup past the raid size; absent means in or not going. */
export function queuePositions(signups: Signup[], size: number): Map<string, number> {
  const going = signups
    .filter((s) => GOING.has(s.status))
    .sort((a, b) => a.signedUpAt - b.signedUpAt || a.id.localeCompare(b.id));
  return new Map(going.slice(size).map((s, i) => [s.id, i + 1]));
}
