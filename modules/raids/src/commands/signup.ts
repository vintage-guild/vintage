import { SIGNUP_STATUSES, type SignupStatus, signupStatusSchema } from '@vintage/comp-solver';
import { error, success } from '@vintage/guild-kit';
import type { Character } from '@vintage/identity/contract';
import { roleFor } from '@vintage/wow-data';
import { z } from 'zod';
import type { RaidEvent, Signup } from '../contract';
import { guessCharacter, type PastSignup, seriesWindow } from '../domain/guess';
import { LOSES_PLACE } from '../domain/queue';
import { command, type RaidsDeps } from '../store';
import { syncQueue } from './queue';
import { eventNotFound, isLeader, notSignedIn, raidClosed } from './shared';

const characterNotFound = () =>
  error('CHARACTER_NOT_FOUND', 'No such character, or it is not yours', {
    suggestion: 'Use character-list to see your characters, or character-add to register one',
    retryable: false,
  });

const badSpec = (character: Character, spec: string) =>
  error('INVALID_SPEC', `"${spec}" is not a ${character.class} spec`, {
    suggestion: `Pick a ${character.class} spec, or leave spec out to keep ${character.name}'s`,
    retryable: false,
  });

const statusRank = (s: Signup) => SIGNUP_STATUSES.indexOf(s.status);

interface SignupWrite {
  guildId: string;
  eventId: string;
  character: Character;
  status: SignupStatus;
  note: string | null | undefined;
  /** A spec for this raid only; undefined keeps the signup's (or the saved one). */
  spec: string | undefined;
  existing: Signup | null;
}

/**
 * The spec and role the signup records. A spec chosen for this raid wins; otherwise the same
 * character keeps the signup's spec (changing status keeps a chosen spec), and a new character
 * starts from its saved spec (switching character clears it). The saved character never changes.
 */
function specOf(w: SignupWrite) {
  const chosen = w.spec === undefined ? undefined : roleFor(w.character.class, w.spec);
  if (w.spec !== undefined && chosen) return { spec: w.spec, role: chosen };
  if (w.existing && w.existing.characterId === w.character.id) {
    return { spec: w.existing.spec, role: w.existing.role };
  }
  return { spec: w.character.spec, role: w.character.role };
}

/**
 * Insert the member's signup, or update it in place. They keep their place in line unless they
 * step down to tentative, bench, or declined, which puts them at the back.
 */
function writeSignup(deps: RaidsDeps, w: SignupWrite, at: number): Promise<Signup> {
  const snapshot = {
    characterId: w.character.id,
    characterName: w.character.name,
    class: w.character.class,
    ...specOf(w),
  };
  if (w.existing) {
    // Swapping characters or declining drops any roster spot; the leader re-places them.
    const keepRoster = w.existing.characterId === w.character.id && w.status !== 'declined';
    const stepsDown = w.status !== w.existing.status && LOSES_PLACE.has(w.status);
    return deps.raids.updateSignup(w.guildId, w.existing.id, {
      ...snapshot,
      status: w.status,
      ...(stepsDown ? { signedUpAt: at } : {}),
      ...(w.note === undefined ? {} : { note: w.note }),
      updatedAt: at,
      ...(keepRoster ? {} : { roster: 'pending' as const, group: null }),
    });
  }
  return deps.raids.insertSignup({
    guildId: w.guildId,
    eventId: w.eventId,
    memberId: w.character.memberId,
    ...snapshot,
    status: w.status,
    note: w.note ?? null,
    signedUpAt: at,
    updatedAt: at,
    roster: 'pending',
    group: null,
    queued: false,
    promotedAt: null,
  });
}

/** Why this caller can't change signups for the raid any more, or null when they can. */
function closedTo(event: RaidEvent, leader: boolean, now: number) {
  if (event.status !== 'open' && !(leader && event.status === 'locked')) return raidClosed(event);
  if (event.startsAt <= now && !leader) {
    return error('RAID_STARTED', `${event.name} has already started`, {
      suggestion: 'Ask a raid leader to update your signup',
      retryable: false,
    });
  }
  return null;
}

export const signupSet = command({
  name: 'signup-set',
  description:
    'Sign up for a raid with one of your characters, or change your answer (accepted, late, ' +
    'tentative, bench, declined). One signup per member per raid. Raid leaders may sign up ' +
    "anyone's character and may change locked raids. spec plays the character as another of " +
    "its class's specs for this raid only (the role follows); the saved character doesn't " +
    'change. Switching character clears it; changing your answer keeps it.',
  tier: 'recruit',
  mutation: true,
  input: z.object({
    eventId: z.string().min(1),
    characterId: z.string().min(1),
    status: signupStatusSchema,
    note: z.string().trim().max(200).nullable().optional(),
    /** A spec of the character's class, for this raid only (e.g. a druid's feral-tank). */
    spec: z.string().trim().min(1).max(40).optional(),
  }),
  handler: async ({ eventId, characterId, status, note, spec }, { caller, guildId, deps, now }) => {
    if (!caller.memberId && !isLeader(caller)) return notSignedIn();
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    const leader = isLeader(caller);
    const closed = closedTo(event, leader, now());
    if (closed) return closed;

    const character = await deps.members.getCharacter(guildId, characterId);
    if (!character || (character.memberId !== caller.memberId && !leader)) {
      return characterNotFound();
    }
    if (spec !== undefined && !roleFor(character.class, spec)) return badSpec(character, spec);

    const existing = await deps.raids.getSignupByMember(guildId, eventId, character.memberId);
    const written = await writeSignup(
      deps,
      { guildId, eventId, character, status, note, spec, existing },
      now(),
    );
    if (
      !existing ||
      existing.status !== status ||
      existing.characterId !== character.id ||
      existing.spec !== written.spec
    ) {
      await deps.events.emit(guildId, 'signup-changed', {
        eventId,
        memberId: character.memberId,
        characterId: character.id,
        from: existing?.status ?? null,
        to: status,
      });
    }
    // After the change is recorded: a drop-out may promote someone from the queue.
    await syncQueue(deps, guildId, event, now());
    const signup = (await deps.raids.getSignup(guildId, written.id)) ?? written;
    const reasoning = signup.queued
      ? `${character.name}: ${status} for ${event.name}, queued (the raid is full)`
      : `${character.name}: ${status} for ${event.name}`;
    return success(signup, { reasoning });
  },
});

/** Enough of the member's recent signups to find SERIES_WINDOW from one series among others. */
const HISTORY_LIMIT = 50;

export const signupSuggest = command({
  name: 'signup-suggest',
  description:
    'Which of your characters you are likely bringing to a raid, with the spec and a short ' +
    'reason: this raid’s signup, else the one you brought most to your last 5 raids from the ' +
    'same schedule (one-offs: the same instance), else your main, else your only character. ' +
    'Null when there is no good guess; pick with character-list then.',
  tier: 'recruit',
  input: z.object({ eventId: z.string().min(1) }),
  handler: async ({ eventId }, { caller, guildId, deps }) => {
    const memberId = caller.memberId;
    if (!memberId) return notSignedIn();
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    const characters = await deps.members.listCharacters(guildId, memberId);
    const existing = await deps.raids.getSignupByMember(guildId, eventId, memberId);

    let window: PastSignup[] = [];
    if (!existing) {
      const recent = await deps.raids.listSignupsByMember(guildId, memberId, HISTORY_LIMIT);
      const events = new Map<string, RaidEvent | null>();
      const past: PastSignup[] = [];
      for (const signup of recent) {
        if (!events.has(signup.eventId)) {
          events.set(signup.eventId, await deps.raids.getEvent(guildId, signup.eventId));
        }
        const pastEvent = events.get(signup.eventId);
        if (pastEvent) past.push({ signup, event: pastEvent });
      }
      window = seriesWindow(event, past);
    }

    const guess = guessCharacter(event, existing, characters, window);
    return success(guess, {
      reasoning: guess
        ? `${guess.characterName} (${guess.spec}): ${guess.reason}`
        : characters.length
          ? 'No good guess: pick one of your characters'
          : 'No characters yet: register one with character-add',
    });
  },
});

export const signupGet = command({
  name: 'signup-get',
  description: "Your signup for a raid. Raid leaders may look up anyone's with memberId.",
  tier: 'recruit',
  input: z.object({ eventId: z.string().min(1), memberId: z.string().min(1).optional() }),
  handler: async ({ eventId, memberId }, { caller, guildId, deps }) => {
    const who = memberId ?? caller.memberId;
    if (!who) return notSignedIn();
    if (who !== caller.memberId && !isLeader(caller)) {
      return error('FORBIDDEN', "Only raid leaders can see someone else's signup detail", {
        suggestion: 'Use signup-list to see who signed up',
        retryable: false,
      });
    }
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    return success(await deps.raids.getSignupByMember(guildId, eventId, who));
  },
});

export const signupList = command({
  name: 'signup-list',
  description: 'Everyone signed up for a raid, best answer first (accepted before tentative).',
  tier: 'recruit',
  input: z.object({
    eventId: z.string().min(1),
    statuses: z.array(signupStatusSchema).min(1).optional(),
  }),
  handler: async ({ eventId, statuses }, { guildId, deps }) => {
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    const signups = (await deps.raids.listSignups(guildId, eventId))
      .filter((s) => !statuses || statuses.includes(s.status))
      .sort((a, b) => statusRank(a) - statusRank(b) || a.signedUpAt - b.signedUpAt);
    return success(signups);
  },
});
