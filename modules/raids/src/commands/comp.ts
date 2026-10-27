import { type CompSignup, solveComp } from '@vintage/comp-solver';
import { success } from '@vintage/guild-kit';
import type { GuildRank } from '@vintage/identity/contract';
import { z } from 'zod';
import { compSize, eventTemplate, RANK_PRIORITY } from '../contract';
import { command } from '../store';
import { eventNotFound } from './shared';

export const compSuggest = command({
  name: 'comp-suggest',
  description:
    'Suggest a raid comp from the signups: who plays, who sits, and what the raid is missing ' +
    '("need 1 healer", "no Mark of the Wild"), each with a reason.',
  tier: 'raider',
  input: z.object({ eventId: z.string().min(1) }),
  handler: async ({ eventId }, { guildId, deps }) => {
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    const signups = await deps.raids.listSignups(guildId, eventId);
    const ranks = new Map<string, GuildRank | null>();
    for (const memberId of new Set(signups.map((s) => s.memberId))) {
      ranks.set(memberId, (await deps.members.getMember(guildId, memberId))?.rank ?? null);
    }
    const compSignups: CompSignup[] = signups.map((s) => {
      const rank = ranks.get(s.memberId);
      return {
        id: s.id,
        name: s.characterName,
        class: s.class,
        spec: s.spec,
        role: s.role,
        // Queued people only play if nobody ahead of them fits.
        status: s.queued ? 'bench' : s.status,
        priority: rank ? RANK_PRIORITY[rank] : 0,
        signedUpAt: s.signedUpAt,
      };
    });
    // The kind's targets, and raid buffs only for raids.
    const template = eventTemplate(event);
    // An open event plays everyone going: no cap, so nobody sits for size.
    const going = compSignups.filter((s) => s.status !== 'declined').length;
    const raidSize = compSize(event, going);
    const result = solveComp({ raidSize, template, signups: compSignups });
    const of = event.size === null ? '' : `/${event.size}`;
    const reasoning = result.gaps.length
      ? result.gaps.map((g) => g.reason).join(' · ')
      : `${result.counts.selected}${of}, no gaps`;
    return success({ event, ...result }, { reasoning });
  },
});
