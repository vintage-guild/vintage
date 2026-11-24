// Which character a member is likely bringing (#148, character-choice §1). Pure: the command
// reads the signup, the series history, and the characters, and this picks one with a reason.
import { hasSplitDpsTargets } from '@vintage/comp-solver';
import type { Character } from '@vintage/identity/contract';
import { type Role, roleFor } from '@vintage/wow-data';
import type { RaidAttendance, RaidEvent, Signup } from '../contract';
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

/** One past raid in the same series: recorded addon attendance (#185) or a non-declined signup. */
export interface PastNight {
  event: RaidEvent;
  characterId: string;
  /** Spec from the raid's signup when the character matches; null uses the character's saved spec. */
  spec: string | null;
  /** True when backed by recorded attendance; attended characters count above signups alone. */
  attended: boolean;
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
 * Combines a member's signups and recorded attendance per raid. When attendance names a character
 * for a raid, that's who they actually brought (even if they signed up on another character or
 * didn't sign up); the signup's spec is kept when the character matches.
 */
export function mergeHistory(
  signups: Signup[],
  attendance: RaidAttendance[],
  events: ReadonlyMap<string, RaidEvent | null>,
): PastNight[] {
  const signupByEvent = new Map(signups.map((s) => [s.eventId, s]));
  const byEvent = new Map<string, PastNight>();
  for (const row of attendance) {
    if (!row.characterId || byEvent.has(row.eventId)) continue;
    const pastEvent = events.get(row.eventId);
    if (!pastEvent) continue;
    const signup = signupByEvent.get(row.eventId);
    byEvent.set(row.eventId, {
      event: pastEvent,
      characterId: row.characterId,
      spec: signup?.characterId === row.characterId ? signup.spec : null,
      attended: true,
    });
  }
  for (const signup of signups) {
    if (signup.status === 'declined' || byEvent.has(signup.eventId)) continue;
    const pastEvent = events.get(signup.eventId);
    if (!pastEvent) continue;
    byEvent.set(signup.eventId, {
      event: pastEvent,
      characterId: signup.characterId,
      spec: signup.spec,
      attended: false,
    });
  }
  return [...byEvent.values()];
}

/**
 * The member's last `SERIES_WINDOW` raids in the series, newest raid first.
 */
export function seriesWindow(event: RaidEvent, past: PastNight[]): PastNight[] {
  return past
    .filter((p) => sameSeries(event, p.event))
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

interface BroughtTally {
  character: Character;
  spec: string;
  count: number;
  attended: number;
}

const beats = (a: BroughtTally, b: BroughtTally) =>
  a.attended !== b.attended ? a.attended > b.attended : a.count > b.count;

function recordNight(
  used: Map<string, BroughtTally>,
  night: PastNight,
  character: Character,
): void {
  const seen = used.get(character.id);
  if (seen) {
    seen.count++;
    if (night.attended) seen.attended++;
    return;
  }
  used.set(character.id, {
    character,
    spec: night.spec ?? character.spec,
    count: 1,
    attended: night.attended ? 1 : 0,
  });
}

/**
 * The character brought most in the window, the spec from its newest night, and how often.
 * Attended nights (#185) rank above signed-up-only nights; characters deleted since don't count.
 * Map order is first appearance and the window is newest first, so keeping the first character
 * with the top score gives a tie to the most recent.
 */
function mostBrought(window: PastNight[], byId: Map<string, Character>) {
  const used = new Map<string, BroughtTally>();
  for (const night of window) {
    const character = byId.get(night.characterId);
    if (character) recordNight(used, night, character);
  }
  let best: BroughtTally | null = null;
  for (const entry of used.values()) if (!best || beats(entry, best)) best = entry;
  return best;
}

/**
 * The guess, in order: this raid's own signup (its spec and role), the main, then only when
 * there's no main the character used most in the series window (attended above signed-up-only;
 * a tie goes to the most recent), then the only character. Null when none of those apply. The
 * main beats history because members set it on purpose on the Characters page (Bloodfen,
 * 2026-10-27, #149).
 */
export function guessCharacter(
  event: RaidEvent,
  existing: Signup | null,
  characters: Character[],
  window: PastNight[],
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
  const going = { tank: 0, healer: 0, melee: 0, ranged: 0 };
  for (const s of signups) {
    if ((s.status === 'accepted' || s.status === 'late') && !s.queued) going[s.role]++;
  }
  const needed: CompRole[] = [];
  if (going.tank < targets.tank) needed.push('tank');
  if (going.healer < targets.healer) needed.push('healer');
  const shortDps = hasSplitDpsTargets(targets)
    ? going.melee < targets.melee || going.ranged < targets.ranged
    : going.melee + going.ranged < targets.dps;
  if (shortDps) needed.push('dps');
  return needed;
}
