// Who may apply right now (#145). One answer for the website's pre-check (`application-check`),
// `/random apply` before its form, and `application-submit` itself, so nobody fills in a form
// only to be refused. In order: a Discord account, not raiding already, in the Vintage Discord
// server, no open application, not too many this month, and the guild not over its rolling limit.
import { type Caller, tierAllows } from '@vintage/guild-kit';
import { type ApplyBlock, type ApplyCheck, OPEN_STATUSES } from '../contract';
import type { ApplicationsDeps } from '../store';

/** At most this many applications per person per window, so a form can't be used to spam. */
export const SUBMIT_LIMIT = { count: 3, windowMs: 30 * 24 * 60 * 60 * 1000 };

/** What each block tells the applicant, with the error code `application-submit` refuses with. */
export const BLOCKS: Record<ApplyBlock, { code: string; message: string; suggestion: string }> = {
  'sign-in': {
    code: 'DISCORD_REQUIRED',
    message: 'Applications need a Discord account',
    suggestion:
      'Apply with /random apply in the Vintage Discord, or sign in with Discord on the site',
  },
  'already-raiding': {
    code: 'ALREADY_RAIDING',
    message: 'You already raid with Vintage',
    suggestion: 'Ask an officer if you want to change your rank',
  },
  'not-in-server': {
    code: 'JOIN_DISCORD_FIRST',
    message: 'Join the Vintage Discord before you apply',
    suggestion: 'Officers answer applications there; join, then apply again',
  },
  open: {
    code: 'APPLICATION_OPEN',
    message: 'Your application is still with the officers',
    suggestion: 'Check it with application-get; officers reply in Discord',
  },
  'too-many': {
    code: 'TOO_MANY_APPLICATIONS',
    message: 'You have applied too often this month',
    suggestion: 'Talk to an officer in Discord',
  },
  busy: {
    code: 'APPLICATIONS_BUSY',
    message: 'The application limit has been reached',
    suggestion: 'Try again in a few minutes',
  },
};

const minutesUntil = (at: number, now: number) => Math.max(1, Math.ceil((at - now) / 60_000));

function blocked(reason: ApplyBlock, now: number, retryAt: number | null = null): ApplyCheck {
  const block = BLOCKS[reason];
  const suggestion =
    reason === 'busy' && retryAt
      ? `Try again in ${minutesUntil(retryAt, now)} minute${minutesUntil(retryAt, now) === 1 ? '' : 's'}`
      : block.suggestion;
  return { canApply: false, reason, message: block.message, suggestion, retryAt };
}

/**
 * The guild's rolling limit: the newest `limitCount` applications, and whether they all fall in
 * the window. When they do, the oldest of them says when a slot opens again.
 */
export async function guildLimit(
  deps: ApplicationsDeps,
  guildId: string,
  now: number,
): Promise<{ reached: boolean; retryAt: number | null; windowMs: number }> {
  const config = await deps.applications.getConfig(guildId);
  const windowMs = config.limitWindowMinutes * 60_000;
  // `since` is inclusive: at exactly createdAt + window an application has left the window.
  const recent = await deps.applications.list(guildId, {
    since: now - windowMs + 1,
    limit: config.limitCount,
  });
  const oldest = recent[recent.length - 1];
  const reached = recent.length >= config.limitCount && oldest !== undefined;
  return { reached, retryAt: reached && oldest ? oldest.createdAt + windowMs : null, windowMs };
}

/** In the Vintage server: anyone using `/random` there is; on the site, identity knows. */
function inServer(caller: Caller, deps: ApplicationsDeps, guildId: string, discordId: string) {
  if (caller.surface === 'discord') return Promise.resolve(true);
  return deps.applicationMembers.inServer(guildId, discordId);
}

export async function checkApply(
  caller: Caller,
  deps: ApplicationsDeps,
  guildId: string,
  now: number,
): Promise<ApplyCheck> {
  const discordId = caller.discordId;
  if (!discordId) return blocked('sign-in', now);
  if (tierAllows(caller.tier, 'raider')) return blocked('already-raiding', now);
  if (!(await inServer(caller, deps, guildId, discordId))) return blocked('not-in-server', now);
  // Open applications count however old they are; only the per-month cap uses the window.
  const [open] = await deps.applications.list(guildId, {
    discordId,
    statuses: OPEN_STATUSES,
    limit: 1,
  });
  if (open) return blocked('open', now);
  const mine = await deps.applications.list(guildId, {
    discordId,
    since: now - SUBMIT_LIMIT.windowMs,
  });
  if (mine.length >= SUBMIT_LIMIT.count) return blocked('too-many', now);
  const limit = await guildLimit(deps, guildId, now);
  if (limit.reached) return blocked('busy', now, limit.retryAt);
  return { canApply: true, reason: null, message: null, suggestion: null, retryAt: null };
}
