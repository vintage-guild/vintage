// Which character a member is likely bringing (#148, character-choice §1). Pure: the command
// reads the signup, the series history, and the characters, and this picks one with a reason.
import type { Character } from '@vintage/identity/contract';
import { type Role, roleFor } from '@vintage/wow-data';
import type { RaidEvent, Signup } from '../contract';
import { targetsOf } from './kinds';

/** How many of the member's recent raids in the same series the guess looks at. */
export const SERIES_WINDOW = 5;

/** A guess `signup-suggest` returns: the character, the spec it plays, and why. */
export interface SignupGuess {
  characterId: string;
  characterName: string;
  spec: string;
  role: Role;
  /** A short line the member sees, e.g. "your last 3 Molten Core nights" or "your main". */
  reason: string;
}

/** One past signup in the same series, with the raid it was for. */
export interface PastSignup {
  signup: Signup;
  event: RaidEvent;
}

/**
 * Whether `other` is in the same series as `event`: the same schedule, or for a one-off, a raid
 * in the same instance. An event without an instance has no series.
 */
export function sameSeries(event: RaidEvent, other: RaidEvent): boolean {
  if (other.id === event.id) return false;
  if (event.scheduleId) return other.scheduleId === event.scheduleId;
  return event.instance !== '' && other.instance === event.instance;
}

/**
 * The member's last `SERIES_WINDOW` raids in the series, newest raid first. Declined answers
 * say nothing about who they'd bring, so they don't count.
 */
export function seriesWindow(event: RaidEvent, past: PastSignup[]): PastSignup[] {
  return past
    .filter((p) => p.signup.status !== 'declined' && sameSeries(event, p.event))
    .sort((a, b) => b.event.startsAt - a.event.startsAt)
    .slice(0, SERIES_WINDOW);
}

/**
 * The role a character plays in `spec`: its saved role for its saved spec (which may be a role
 * the member picked, like a Fury warrior who tanks), otherwise the spec's own role.
 */
export function roleForSpec(character: Character, spec: string): Role | undefined {
  return spec === character.spec ? character.role : roleFor(character.class, spec);
}

/** The spec to play: `spec` when it belongs to the character's class, else the saved one. */
function specFor(character: Character, spec: string) {
  const role = roleForSpec(character, spec);
  return role ? { spec, role } : { spec: character.spec, role: character.role };
}

const guessOf = (character: Character, spec: string, reason: string): SignupGuess => ({
  characterId: character.id,
  characterName: character.name,
  ...specFor(character, spec),
  reason,
});

function seriesReason(event: RaidEvent, used: number, window: number) {
  const where = event.instance || event.name;
  if (used < window) return `${used} of your last ${window} ${where} nights`;
  return window === 1 ? `your last ${where} night` : `your last ${window} ${where} nights`;
}

/**
 * The character brought most in the window, the spec from its newest night, and how often.
 * Characters deleted since don't count. Map order is first appearance and the window is newest
 * first, so keeping the first character with the top count gives a tie to the most recent.
 */
function mostBrought(window: PastSignup[], byId: Map<string, Character>) {
  const used = new Map<string, { character: Character; spec: string; count: number }>();
  for (const { signup } of window) {
    const character = byId.get(signup.characterId);
    if (!character) continue;
    const seen = used.get(character.id);
    if (seen) seen.count++;
    else used.set(character.id, { character, spec: signup.spec, count: 1 });
  }
  let best: { character: Character; spec: string; count: number } | null = null;
  for (const entry of used.values()) if (!best || entry.count > best.count) best = entry;
  return best;
}

/**
 * The guess, in order: this raid's own signup (its spec and role), the main, then only when
 * there's no main the character used most in the series window (a tie goes to the most
 * recent), then the only character. Null when none of those apply. The main beats history
 * because members set it on purpose on the Characters page (Bloodfen, 2026-10-27, #149).
 */
export function guessCharacter(
  event: RaidEvent,
  existing: Signup | null,
  characters: Character[],
  window: PastSignup[],
): SignupGuess | null {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const signedUp = existing && byId.get(existing.characterId);
  if (existing && signedUp) {
    return {
      characterId: signedUp.id,
      characterName: signedUp.name,
      spec: existing.spec,
      role: existing.role,
      reason: 'your signup for this raid',
    };
  }

  const main = characters.find((c) => c.isMain);
  if (main) return guessOf(main, main.spec, 'your main');

  const best = mostBrought(window, byId);
  if (best) {
    return guessOf(best.character, best.spec, seriesReason(event, best.count, window.length));
  }

  if (characters.length === 1) {
    const only = characters[0]!;
    return guessOf(only, only.spec, 'your only character');
  }
  return null;
}

/** Comp roles the raid counts: melee and ranged are both DPS. */
export type CompRole = 'tank' | 'healer' | 'dps';
export const compRole = (role: Role): CompRole =>
  role === 'melee' || role === 'ranged' ? 'dps' : role;

/**
 * The comp roles the raid is short of: fewer people going (accepted or late, not queued) than
 * its targets, in tank, healer, dps order. Pickers mark characters that fill one.
 */
export function rolesNeeded(event: RaidEvent, signups: Signup[]): CompRole[] {
  const targets = targetsOf(event);
  const going = { tank: 0, healer: 0, dps: 0 };
  for (const s of signups) {
    if ((s.status === 'accepted' || s.status === 'late') && !s.queued) going[compRole(s.role)]++;
  }
  return (['tank', 'healer', 'dps'] as const).filter((r) => going[r] < targets[r]);
}
