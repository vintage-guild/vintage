import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { ROSTER_AUDIT_SECTIONS } from '../contract';
import { auditRosterRanks } from '../domain/audit';
import { command } from '../store';

export const rosterRankAudit = command({
  name: 'roster-rank-audit',
  description:
    'Compare synced Discord guild roles against the synced Blizzard in-game guild roster. ' +
    'Officer-only, read-only. Reports rank mismatches (highest in-game rank wins across alts; ' +
    'Raid Leader matches in-game Raider/Officer), active Discord members without a matched ' +
    'in-game character, unlinked in-game characters, and departed Discord members still in-game.',
  tier: 'officer',
  input: z.object({
    section: z.enum(ROSTER_AUDIT_SECTIONS).optional(),
  }),
  handler: async ({ section }, { guildId, deps }) => {
    if (!deps.armoryMembers) {
      return error('NOT_AVAILABLE', 'Roster rank audit isn’t wired on this host', {
        retryable: false,
      });
    }
    const [members, entries, links, characters] = await Promise.all([
      deps.armoryMembers.listMembers(guildId),
      deps.armoryRoster.listEntries(guildId),
      deps.armory.listLinks(guildId),
      deps.armoryCharacters.listCharacters(guildId),
    ]);
    const report = auditRosterRanks(members, entries, links, characters, section ?? 'all');
    const { mismatches, discordWithoutInGame, leftDiscordStillInGame } = report.summary;
    const reasoning =
      mismatches === 0 && leftDiscordStillInGame === 0
        ? `No rank mismatches (${report.summary.matchedMembers} matched, ${discordWithoutInGame} unmatched on Discord)`
        : `${mismatches} rank mismatch${mismatches === 1 ? '' : 'es'}, ${leftDiscordStillInGame} left Discord still in-game`;
    return success(report, { reasoning });
  },
});
