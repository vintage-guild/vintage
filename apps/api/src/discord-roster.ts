// `/vintage roster audit` Discord flow (#353). Pure over ports so Convex (convex/discord.ts)
// and unit tests run the exact same formatting and permission checks. Every reply is private.
import type { RosterAuditSection, RosterRankAudit } from '@vintage/armory/contract';
import {
  type Interaction,
  type InteractionResponse,
  InteractionType,
  subcommandPath,
} from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import {
  commandOptions,
  discordCaller,
  ephemeral,
  failureText,
  type MemberPorts,
  SLASH_COMMAND,
  titleCase,
} from './discord-common';

export const ROSTER_GROUP = 'roster';
const NEEDS_OFFICER =
  'Roster audit needs the Officer rank in this server. Ask an officer if that seems wrong.';
const MAX_MESSAGE_CHARS = 1950;

export interface RosterAuditPorts extends MemberPorts {
  run(caller: Caller, name: string, input: unknown): Promise<CommandResult<unknown>>;
}

const formatRank = (rank: string | null) => (rank ? titleCase(rank) : 'No guild role');

function appendSection(blocks: string[], heading: string, lines: string[], maxLines: number): void {
  if (lines.length === 0) return;
  const shown = lines.slice(0, maxLines);
  const rest = lines.length - shown.length;
  const body = rest > 0 ? [...shown, `… and ${rest} more`] : shown;
  blocks.push(`**${heading} (${lines.length})**\n${body.join('\n')}`);
}

function fitToDiscord(blocks: string[]): string {
  const joined = blocks.join('\n\n');
  if (joined.length <= MAX_MESSAGE_CHARS) return joined;
  return `${joined.slice(0, MAX_MESSAGE_CHARS - 30).trimEnd()}\n… (truncated; filter with \`section:\`)`;
}

/** Formats `roster-rank-audit` into a concise, readable private Discord message. */
export function formatRosterAudit(report: RosterRankAudit): string {
  const s = report.summary;
  const header = [
    '**Roster rank audit** (Discord roles vs. in-game Blizzard roster)',
    `Checked **${s.discordMembersChecked}** Discord members against **${s.inGameCharacters}** in-game characters (**${s.matchedMembers}** matched).`,
    `Mismatches: **${s.mismatches}** · Discord w/o in-game: **${s.discordWithoutInGame}** · In-game unlinked: **${s.inGameWithoutDiscord}** · Left Discord still in-game: **${s.leftDiscordStillInGame}**`,
  ].join('\n');

  const blocks = [header];
  const perSection = report.section === 'all' ? 12 : 25;

  if (report.section === 'all' || report.section === 'mismatches') {
    if (report.mismatches.length === 0) {
      blocks.push('**Rank mismatches (0)**\nAll matched Discord members match their in-game rank.');
    } else {
      appendSection(
        blocks,
        'Rank mismatches',
        report.mismatches.map(
          (m) =>
            `• **${m.displayName}** — Discord: ${formatRank(m.discordRank)} → In-game: **${m.inGameRankName}** (${m.characterName})`,
        ),
        perSection,
      );
    }
  }

  if (report.section === 'all' || report.section === 'unlinked') {
    appendSection(
      blocks,
      'Discord role, not matched in-game',
      report.discordWithoutInGame.map((d) => {
        const chars = d.registeredCharacters.length
          ? ` (registered: ${d.registeredCharacters.join(', ')})`
          : ' (no character registered)';
        return `• **${d.displayName}** (${formatRank(d.discordRank)})${chars}`;
      }),
      perSection,
    );
    appendSection(
      blocks,
      'In-game characters not linked to Discord',
      report.inGameWithoutDiscord.map(
        (c) =>
          `• **${c.surname ? `${c.name} ${c.surname}` : c.name}** (Lv ${c.level} · ${c.inGameRankName})`,
      ),
      perSection,
    );
  }

  if (report.section === 'all' || report.section === 'departed') {
    appendSection(
      blocks,
      'Left Discord, still in-game',
      report.leftDiscordStillInGame.map(
        (l) => `• **${l.displayName}** — ${l.characters.join(', ')}`,
      ),
      perSection,
    );
  }

  if (
    report.section === 'mismatches' &&
    (s.discordWithoutInGame > 0 || s.inGameWithoutDiscord > 0 || s.leftDiscordStillInGame > 0)
  ) {
    blocks.push(
      '_Tip: run `/vintage roster audit section:unlinked` or `section:departed` to inspect the other buckets._',
    );
  }

  return fitToDiscord(blocks);
}

/** Handles `/vintage roster audit`; returns null for everything else. */
export async function handleRosterInteraction(
  interaction: Interaction,
  ports: RosterAuditPorts,
): Promise<InteractionResponse | null> {
  if (
    interaction.type !== InteractionType.APPLICATION_COMMAND ||
    interaction.data?.name !== SLASH_COMMAND
  ) {
    return null;
  }
  const path = subcommandPath(interaction);
  if (path[0] !== ROSTER_GROUP || path[1] !== 'audit') return null;

  const resolved = await discordCaller(interaction, ports, 'roster audits');
  if ('refusal' in resolved) return resolved.refusal;

  const opts = commandOptions(interaction);
  const section =
    typeof opts.section === 'string' ? (opts.section as RosterAuditSection) : 'mismatches';
  const result = await ports.run(resolved.caller, 'roster-rank-audit', { section });
  if (!result.success) return ephemeral(failureText(result, NEEDS_OFFICER));
  return ephemeral(formatRosterAudit(result.data as RosterRankAudit));
}
