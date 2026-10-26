import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import type { RaidEvent, Signup } from '../contract';
import { command, type RaidsDeps } from '../store';
import { syncQueue } from './queue';
import { eventNotFound, isLive, raidClosed, signupNotFound } from './shared';

const GROUP_SIZE = 5;

/** The signup and its raid, when both exist and the raid can still change. */
async function liveSignup(deps: RaidsDeps, guildId: string, signupId: string) {
  const signup = await deps.raids.getSignup(guildId, signupId);
  if (!signup) return { failure: signupNotFound() };
  const event = await deps.raids.getEvent(guildId, signup.eventId);
  if (!event) return { failure: eventNotFound() };
  if (!isLive(event)) return { failure: raidClosed(event) };
  return { signup, event };
}

const declined = (signup: Signup) =>
  error('SIGNUP_DECLINED', `${signup.characterName} declined this raid`, {
    suggestion: 'They need to change their answer (or a raid leader can with signup-set) first',
    retryable: false,
  });

type CommandCtx = { guildId: string; deps: RaidsDeps };

/** Handler for roster-lock / roster-unlock. */
function setStatus(status: 'open' | 'locked') {
  return async ({ eventId }: { eventId: string }, { guildId, deps }: CommandCtx) => {
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    if (!isLive(event)) return raidClosed(event);
    if (event.status === status) {
      return success(event, { reasoning: `${event.name} is already ${status}` });
    }
    const updated = await deps.raids.updateEvent(guildId, eventId, { status });
    return success(updated, {
      reasoning:
        status === 'locked'
          ? `${event.name} is locked; only raid leaders can change signups`
          : `${event.name} is open for signups again`,
    });
  };
}

export const rosterLock = command({
  name: 'roster-lock',
  description: 'Lock signups for a raid; after this only raid leaders can change them.',
  tier: 'leader',
  mutation: true,
  input: z.object({ eventId: z.string().min(1) }),
  handler: setStatus('locked'),
});

export const rosterUnlock = command({
  name: 'roster-unlock',
  description: 'Reopen signups for a locked raid.',
  tier: 'leader',
  mutation: true,
  input: z.object({ eventId: z.string().min(1) }),
  handler: setStatus('open'),
});

export const rosterBench = command({
  name: 'roster-bench',
  description: 'Bench a signed-up character for this raid (they keep their signup).',
  tier: 'leader',
  mutation: true,
  input: z.object({ signupId: z.string().min(1) }),
  handler: async ({ signupId }, { guildId, deps }) => {
    const found = await liveSignup(deps, guildId, signupId);
    if (found.failure) return found.failure;
    const { signup } = found;
    if (signup.status === 'declined') return declined(signup);
    const updated = await deps.raids.updateSignup(guildId, signupId, {
      roster: 'benched',
      group: null,
    });
    return success(updated, { reasoning: `${signup.characterName} benched` });
  },
});

/** Raid groups available for a raid size: 8 for 40, 4 for 20, 2 for 10. */
const groupCount = (event: RaidEvent) => event.size / GROUP_SIZE;

export const rosterMove = command({
  name: 'roster-move',
  description: 'Put a signed-up character in a raid group (1–8 for 40s; 5 per group).',
  tier: 'leader',
  mutation: true,
  input: z.object({ signupId: z.string().min(1), group: z.number().int().min(1).max(8) }),
  handler: async ({ signupId, group }, { guildId, deps }) => {
    const found = await liveSignup(deps, guildId, signupId);
    if (found.failure) return found.failure;
    const { signup, event } = found;
    if (signup.status === 'declined') return declined(signup);
    if (group > groupCount(event)) {
      return error(
        'GROUP_OUT_OF_RANGE',
        `A ${event.size}-person raid has ${groupCount(event)} groups`,
        {
          suggestion: `Pick a group from 1 to ${groupCount(event)}`,
          retryable: false,
        },
      );
    }
    const inGroup = (await deps.raids.listSignups(guildId, event.id)).filter(
      (s) => s.roster === 'rostered' && s.group === group && s.id !== signupId,
    );
    if (inGroup.length >= GROUP_SIZE) {
      return error('GROUP_FULL', `Group ${group} already has ${GROUP_SIZE}`, {
        suggestion: 'Move or bench someone in that group first, or pick another group',
        retryable: false,
      });
    }
    const updated = await deps.raids.updateSignup(guildId, signupId, {
      roster: 'rostered',
      group,
    });
    return success(updated, { reasoning: `${signup.characterName} → group ${group}` });
  },
});

export const rosterRemove = command({
  name: 'roster-remove',
  description:
    "Remove someone's signup from a raid entirely. Shows a preview first; confirm to remove.",
  tier: 'leader',
  destructive: true,
  input: z.object({ signupId: z.string().min(1) }),
  handler: async ({ signupId }, { guildId, deps, dryRun, now }) => {
    const found = await liveSignup(deps, guildId, signupId);
    if (found.failure) return found.failure;
    const { signup, event } = found;
    if (dryRun) {
      return success(
        { willRemove: signup },
        { reasoning: `Removes ${signup.characterName} from ${event.name}` },
      );
    }
    await deps.raids.deleteSignup(guildId, signupId);
    await deps.events.emit(guildId, 'signup-changed', {
      eventId: event.id,
      memberId: signup.memberId,
      characterId: signup.characterId,
      from: signup.status,
      to: null,
    });
    await syncQueue(deps, guildId, event, now());
    return success({ removed: signup });
  },
});
