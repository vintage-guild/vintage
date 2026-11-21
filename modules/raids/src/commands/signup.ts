import { SIGNUP_STATUSES, type SignupStatus, signupStatusSchema } from '@vintage/comp-solver';
import { type Caller, error, success, tierAllows } from '@vintage/guild-kit';
import type { Character } from '@vintage/identity/contract';
import { classRoles, cleanAlsoRoles, type Role, roleFor, roleSchema } from '@vintage/wow-data';
import { z } from 'zod';
import { accessOf, type LateMinutes, type RaidEvent, type Signup } from '../contract';
import { guessCharacter, type PastSignup, roleForSpec, seriesWindow } from '../domain/guess';
import { LOSES_PLACE, queuePositions } from '../domain/queue';
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

const cantPlay = (character: Character, rejected: Role[]) =>
  error('INVALID_ROLE', `A ${character.class} can't play ${rejected.join(' or ')}`, {
    suggestion: `alsoRoles takes the roles a ${character.class} can play: ${classRoles(character.class).join(', ')}`,
    retryable: false,
  });

const needsLateMinutes = () =>
  error('LATE_MINUTES_REQUIRED', 'Pick how late you will be: 5, 15, or 30 minutes', {
    suggestion: 'Pass lateMinutes: 5, 15, or 30 (more than 30 minutes is absent)',
    retryable: false,
  });

const lateMinutesSchema = z.union([z.literal(5), z.literal(15), z.literal(30)]);
const alsoRolesSchema = z.array(roleSchema).max(8);

const statusRank = (s: Signup) => SIGNUP_STATUSES.indexOf(s.status);

interface SignupWrite {
  guildId: string;
  eventId: string;
  character: Character;
  status: SignupStatus;
  lateMinutes: LateMinutes | null;
  note: string | null | undefined;
  /** Resolved spec, role, rolePicked, and alsoRoles for this signup. */
  spec: string;
  role: Role;
  rolePicked: boolean;
  alsoRoles: Role[];
  existing: Signup | null;
}

/**
 * The spec and role the signup records. The same character keeps the signup's spec and role
 * (changing status keeps what was chosen for the raid); a new character starts from its saved
 * spec and role (switching character clears both). A spec chosen for this raid re-guesses the
 * role unless a role was picked for it; a picked role wins. The saved character never changes.
 */
function playOf(
  character: Character,
  existing: Signup | null,
  specInput: string | undefined,
  roleInput: Role | null | undefined,
): { spec: string; role: Role; rolePicked: boolean } {
  const same = existing && existing.characterId === character.id ? existing : null;
  let spec = same ? same.spec : character.spec;
  let role = same ? same.role : character.role;
  let rolePicked = same?.rolePicked ?? false;
  if (specInput !== undefined && specInput !== spec) {
    spec = specInput;
    if (!rolePicked) role = roleForSpec(character, spec) ?? role;
  }
  if (roleInput === null) {
    rolePicked = false;
    role = roleForSpec(character, spec) ?? role;
  } else if (roleInput !== undefined) {
    role = roleInput;
    rolePicked = true;
  }
  return { spec, role, rolePicked };
}

/** Resolve alsoRoles for a signup: explicit input wins, else keep same-character or copy character's. */
function resolveAlsoRoles(
  character: Character,
  existing: Signup | null,
  role: Role,
  input: Role[] | undefined,
): { alsoRoles: Role[] } | { rejected: Role[] } {
  if (input !== undefined) {
    const cleaned = cleanAlsoRoles(character.class, role, input);
    if (cleaned.rejected.length > 0) return { rejected: cleaned.rejected };
    return { alsoRoles: cleaned.alsoRoles };
  }
  const same = existing && existing.characterId === character.id ? existing : null;
  const base = same ? same.alsoRoles : character.alsoRoles;
  return { alsoRoles: cleanAlsoRoles(character.class, role, base).alsoRoles };
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
    spec: w.spec,
    role: w.role,
    rolePicked: w.rolePicked,
    alsoRoles: w.alsoRoles,
  };
  if (w.existing) {
    // Swapping characters or declining drops any roster spot; the leader re-places them.
    const keepRoster = w.existing.characterId === w.character.id && w.status !== 'declined';
    const stepsDown = w.status !== w.existing.status && LOSES_PLACE.has(w.status);
    return deps.raids.updateSignup(w.guildId, w.existing.id, {
      ...snapshot,
      status: w.status,
      lateMinutes: w.lateMinutes,
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
    lateMinutes: w.lateMinutes,
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

/** Gate guild raids to `recruit`+ while open raids allow `friend`+ (signup-improvements row 23). */
function accessRefusal(caller: Caller, event: RaidEvent) {
  if (accessOf(event) === 'open') return null;
  if (tierAllows(caller.tier, 'recruit')) return null;
  // Friends don't see guild raids at all; Members see them but can't sign up.
  if (!tierAllows(caller.tier, 'member')) return eventNotFound();
  return error('FORBIDDEN', 'Signing up for a guild raid needs the Recruit rank or higher', {
    suggestion: 'Ask an officer if your Discord rank seems wrong, or join an open raid',
    retryable: false,
  });
}

function resolveLateMinutes(
  status: SignupStatus,
  input: LateMinutes | null | undefined,
  existing: Signup | null,
): { lateMinutes: LateMinutes | null } | { missing: true } {
  if (status !== 'late') return { lateMinutes: null };
  const resolved = input ?? (existing?.status === 'late' ? existing.lateMinutes : null);
  return resolved === null ? { missing: true } : { lateMinutes: resolved };
}

function signupChanged(existing: Signup | null, written: Signup): boolean {
  if (!existing) return true;
  const alsoChanged =
    existing.alsoRoles.length !== written.alsoRoles.length ||
    existing.alsoRoles.some((r, i) => r !== written.alsoRoles[i]);
  return (
    existing.status !== written.status ||
    existing.lateMinutes !== written.lateMinutes ||
    existing.characterId !== written.characterId ||
    existing.spec !== written.spec ||
    existing.role !== written.role ||
    alsoChanged
  );
}

async function loadEventForSignup(
  deps: RaidsDeps,
  guildId: string,
  eventId: string,
  caller: Caller,
  now: number,
): Promise<{ event: RaidEvent; leader: boolean } | { failure: ReturnType<typeof error> }> {
  const leader = isLeader(caller);
  if (!caller.memberId && !leader) return { failure: notSignedIn() };
  const event = await deps.raids.getEvent(guildId, eventId);
  if (!event) return { failure: eventNotFound() };
  const refusal = accessRefusal(caller, event) ?? closedTo(event, leader, now);
  if (refusal) return { failure: refusal };
  return { event, leader };
}

export const signupSet = command({
  name: 'signup-set',
  description:
    'Sign up for a raid with one of your characters, or change your answer (accepted, late, ' +
    'tentative, bench, declined). One signup per member per raid. Guild raids require the Recruit ' +
    'tier; open raids allow Friends and Members too. Raid leaders may sign up ' +
    "anyone's character and may change locked raids. spec plays the character as another of " +
    "its class's specs for this raid only (the role follows); the saved character doesn't " +
    'change. role plays it as tank, healer, melee or ranged for this raid (null follows the ' +
    'spec again); a picked role stays when the spec changes. Switching character clears both; ' +
    'changing your answer keeps them.',
  tier: 'friend',
  mutation: true,
  input: z.object({
    eventId: z.string().min(1),
    characterId: z.string().min(1),
    status: signupStatusSchema,
    /** Required when status is `late`: 5, 15, or 30 minutes (more than 30 is absent). */
    lateMinutes: lateMinutesSchema.nullable().optional(),
    note: z.string().trim().max(200).nullable().optional(),
    /** A spec of the character's class, for this raid only (e.g. a druid's feral-tank). */
    spec: z.string().trim().min(1).max(40).optional(),
    /** A role for this raid only (a Fury warrior tanking); null follows the spec again. */
    role: roleSchema.nullable().optional(),
    /** Other roles the character can flex to for this raid only; defaults to the character's alsoRoles. */
    alsoRoles: alsoRolesSchema.optional(),
  }),
  handler: async (
    { eventId, characterId, status, lateMinutes, note, spec, role, alsoRoles },
    { caller, guildId, deps, now },
  ) => {
    const loaded = await loadEventForSignup(deps, guildId, eventId, caller, now());
    if ('failure' in loaded) return loaded.failure;
    const { event, leader } = loaded;

    const character = await deps.members.getCharacter(guildId, characterId);
    if (!character || (character.memberId !== caller.memberId && !leader)) {
      return characterNotFound();
    }
    if (spec !== undefined && !roleFor(character.class, spec)) return badSpec(character, spec);

    const existing = await deps.raids.getSignupByMember(guildId, eventId, character.memberId);
    const late = resolveLateMinutes(status, lateMinutes, existing);
    if ('missing' in late) return needsLateMinutes();

    const play = playOf(character, existing, spec, role);
    const resolvedAlso = resolveAlsoRoles(character, existing, play.role, alsoRoles);
    if ('rejected' in resolvedAlso) return cantPlay(character, resolvedAlso.rejected);

    const written = await writeSignup(
      deps,
      {
        guildId,
        eventId,
        character,
        status,
        lateMinutes: late.lateMinutes,
        note,
        ...play,
        alsoRoles: resolvedAlso.alsoRoles,
        existing,
      },
      now(),
    );
    if (signupChanged(existing, written)) {
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

/** The member's recent signups in the same series as `event`, with their raids. */
async function seriesOf(
  deps: RaidsDeps,
  guildId: string,
  memberId: string,
  event: RaidEvent,
): Promise<PastSignup[]> {
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
  return seriesWindow(event, past);
}

export const signupSuggest = command({
  name: 'signup-suggest',
  description:
    'Which of your characters you are likely bringing to a raid, with the spec, role and a ' +
    'short reason: this raid’s signup, else your main, else (no main) the one you brought ' +
    'most to your last 5 raids from the same schedule (one-offs: the same instance), else ' +
    'your only character. Null when there is no good guess; pick with character-list then.',
  tier: 'friend',
  input: z.object({ eventId: z.string().min(1) }),
  handler: async ({ eventId }, { caller, guildId, deps }) => {
    const memberId = caller.memberId;
    if (!memberId) return notSignedIn();
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    const denied = accessRefusal(caller, event);
    if (denied) return denied;
    const characters = await deps.members.listCharacters(guildId, memberId);
    const existing = await deps.raids.getSignupByMember(guildId, eventId, memberId);

    // The series only matters when neither this raid's signup (none, or its character was
    // deleted since) nor a main can answer.
    const signedUp = existing && characters.some((c) => c.id === existing.characterId);
    const window =
      signedUp || characters.some((c) => c.isMain)
        ? []
        : await seriesOf(deps, guildId, memberId, event);

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
  tier: 'friend',
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
    const denied = accessRefusal(caller, event);
    if (denied) return denied;
    return success(await deps.raids.getSignupByMember(guildId, eventId, who));
  },
});

export const signupList = command({
  name: 'signup-list',
  description:
    'Everyone signed up for a raid, best answer first (accepted before tentative). A queued ' +
    'signup carries its place in line (queuePosition, 1 is next); everyone else has null.',
  tier: 'friend',
  input: z.object({
    eventId: z.string().min(1),
    statuses: z.array(signupStatusSchema).min(1).optional(),
  }),
  handler: async ({ eventId, statuses }, { caller, guildId, deps }) => {
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    const denied = accessRefusal(caller, event);
    if (denied) return denied;
    const all = await deps.raids.listSignups(guildId, eventId);
    // Positions come from every signup, so a status filter doesn't renumber the line.
    const positions = queuePositions(all, event.size);
    const signups = all
      .filter((s) => !statuses || statuses.includes(s.status))
      .sort((a, b) => statusRank(a) - statusRank(b) || a.signedUpAt - b.signedUpAt)
      .map((s) => ({ ...s, queuePosition: positions.get(s.id) ?? null }));
    return success(signups);
  },
});
