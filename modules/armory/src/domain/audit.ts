// Pure Discord-role vs. in-game guild-roster rank audit (#353).
import {
  type ArmoryLink,
  IN_GAME_RANK_NAMES,
  type RosterAuditLeftDiscord,
  type RosterAuditMismatch,
  type RosterAuditMissingInGame,
  type RosterAuditSection,
  type RosterAuditUnlinkedCharacter,
  type RosterEntry,
  type RosterRankAudit,
} from '../contract';
import type { ArmoryCharacter, ArmoryMember } from '../store';

/**
 * Standing order for in-game guild ranks (lower index = higher standing).
 * Recruit (6) stands above Members & Alts (5) so a recruit with a social alt is audited as Recruit.
 */
const STANDING_ORDER: readonly number[] = [0, 1, 2, 3, 4, 6, 5];

/** Expected Discord guild rank for each Blizzard in-game guildRank index. */
const IN_GAME_TO_DISCORD: Readonly<Record<number, string>> = {
  0: 'officer',
  1: 'officer',
  2: 'officer',
  3: 'raider',
  4: 'flex-raider',
  5: 'member',
  6: 'recruit',
};

export function inGameRankName(guildRank: number): string {
  return IN_GAME_RANK_NAMES[guildRank] ?? `Rank ${guildRank + 1}`;
}

export function expectedDiscordRank(guildRank: number): string {
  return IN_GAME_TO_DISCORD[guildRank] ?? 'member';
}

/**
 * Whether a member's Discord rank is compatible with their highest-standing in-game rank.
 * Raid Leader has no separate in-game rank, so it matches both in-game Raider (3) and Officer (0/1).
 */
export function ranksCompatible(discordRank: string | null, inGameRank: number): boolean {
  const expected = expectedDiscordRank(inGameRank);
  if (discordRank === expected) return true;
  if (discordRank === 'raid-leader' && (inGameRank === 0 || inGameRank === 1 || inGameRank === 3)) {
    return true;
  }
  return false;
}

function standingIndex(guildRank: number): number {
  const idx = STANDING_ORDER.indexOf(guildRank);
  return idx < 0 ? STANDING_ORDER.length + guildRank : idx;
}

function buildCharBySlug(
  links: readonly ArmoryLink[],
  characters: readonly ArmoryCharacter[],
): Map<string, ArmoryCharacter> {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const charBySlug = new Map<string, ArmoryCharacter>();
  for (const link of links) {
    const char = charById.get(link.characterId);
    if (char) charBySlug.set(link.slug, char);
  }
  for (const c of characters) {
    const slug = c.name.trim().toLowerCase().split(/\s+/).join('-');
    if (!charBySlug.has(slug)) charBySlug.set(slug, c);
  }
  return charBySlug;
}

function fullName(entry: Pick<RosterEntry, 'name' | 'surname'>): string {
  return entry.surname ? `${entry.name} ${entry.surname}` : entry.name;
}

function highestStandingEntry(entries: readonly RosterEntry[]): RosterEntry {
  return [...entries].sort(
    (a, b) =>
      standingIndex(a.guildRank) - standingIndex(b.guildRank) || a.name.localeCompare(b.name),
  )[0]!;
}

function partitionEntries(
  entries: readonly RosterEntry[],
  charBySlug: ReadonlyMap<string, ArmoryCharacter>,
): {
  entriesByMember: Map<string, RosterEntry[]>;
  inGameWithoutDiscord: RosterAuditUnlinkedCharacter[];
} {
  const entriesByMember = new Map<string, RosterEntry[]>();
  const inGameWithoutDiscord: RosterAuditUnlinkedCharacter[] = [];

  for (const entry of entries) {
    const matched = charBySlug.get(entry.slug);
    if (!matched) {
      inGameWithoutDiscord.push({
        name: entry.name,
        surname: entry.surname,
        slug: entry.slug,
        level: entry.level,
        inGameRank: entry.guildRank,
        inGameRankName: inGameRankName(entry.guildRank),
      });
      continue;
    }
    const list = entriesByMember.get(matched.memberId) ?? [];
    list.push(entry);
    entriesByMember.set(matched.memberId, list);
  }
  return { entriesByMember, inGameWithoutDiscord };
}

function groupCharacterNames(characters: readonly ArmoryCharacter[]): Map<string, string[]> {
  const charsByMember = new Map<string, string[]>();
  for (const c of characters) {
    const list = charsByMember.get(c.memberId) ?? [];
    list.push(c.name);
    charsByMember.set(c.memberId, list);
  }
  return charsByMember;
}

interface AuditBuckets {
  mismatches: RosterAuditMismatch[];
  discordWithoutInGame: RosterAuditMissingInGame[];
  leftDiscordStillInGame: RosterAuditLeftDiscord[];
  discordMembersChecked: number;
  matchedMembers: number;
}

function classifyMember(
  member: ArmoryMember,
  ownedEntries: readonly RosterEntry[],
  registeredChars: readonly string[],
  buckets: AuditBuckets,
): void {
  if (!member.inServer) {
    if (ownedEntries.length > 0) {
      buckets.leftDiscordStillInGame.push({
        memberId: member.id,
        discordId: member.discordId,
        displayName: member.displayName,
        characters: ownedEntries.map(fullName).sort((a, b) => a.localeCompare(b)),
      });
    }
    return;
  }

  const hasGuildRole = member.rank !== null && member.rank !== 'friend';
  if (hasGuildRole || ownedEntries.length > 0) buckets.discordMembersChecked++;

  if (ownedEntries.length > 0) {
    buckets.matchedMembers++;
    const top = highestStandingEntry(ownedEntries);
    if (!ranksCompatible(member.rank, top.guildRank)) {
      buckets.mismatches.push({
        memberId: member.id,
        discordId: member.discordId,
        displayName: member.displayName,
        discordRank: member.rank,
        expectedRank: expectedDiscordRank(top.guildRank),
        characterName: fullName(top),
        inGameRank: top.guildRank,
        inGameRankName: inGameRankName(top.guildRank),
      });
    }
    return;
  }

  if (hasGuildRole && member.rank) {
    buckets.discordWithoutInGame.push({
      memberId: member.id,
      discordId: member.discordId,
      displayName: member.displayName,
      discordRank: member.rank,
      registeredCharacters: [...registeredChars].sort((a, b) => a.localeCompare(b)),
    });
  }
}

/**
 * Compare synced Discord members against the synced Blizzard in-game guild roster.
 * Pure: no I/O, deterministic sorting across every bucket.
 */
export function auditRosterRanks(
  members: readonly ArmoryMember[],
  entries: readonly RosterEntry[],
  links: readonly ArmoryLink[],
  characters: readonly ArmoryCharacter[],
  section: RosterAuditSection = 'all',
): RosterRankAudit {
  const charBySlug = buildCharBySlug(links, characters);
  const charsByMember = groupCharacterNames(characters);
  const { entriesByMember, inGameWithoutDiscord } = partitionEntries(entries, charBySlug);

  const buckets: AuditBuckets = {
    mismatches: [],
    discordWithoutInGame: [],
    leftDiscordStillInGame: [],
    discordMembersChecked: 0,
    matchedMembers: 0,
  };
  for (const member of members) {
    classifyMember(
      member,
      entriesByMember.get(member.id) ?? [],
      charsByMember.get(member.id) ?? [],
      buckets,
    );
  }

  buckets.mismatches.sort(
    (a, b) =>
      standingIndex(a.inGameRank) - standingIndex(b.inGameRank) ||
      a.displayName.localeCompare(b.displayName),
  );
  buckets.discordWithoutInGame.sort((a, b) => a.displayName.localeCompare(b.displayName));
  inGameWithoutDiscord.sort(
    (a, b) =>
      standingIndex(a.inGameRank) - standingIndex(b.inGameRank) || a.name.localeCompare(b.name),
  );
  buckets.leftDiscordStillInGame.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    section,
    summary: {
      discordMembersChecked: buckets.discordMembersChecked,
      inGameCharacters: entries.length,
      matchedMembers: buckets.matchedMembers,
      mismatches: buckets.mismatches.length,
      discordWithoutInGame: buckets.discordWithoutInGame.length,
      inGameWithoutDiscord: inGameWithoutDiscord.length,
      leftDiscordStillInGame: buckets.leftDiscordStillInGame.length,
    },
    mismatches: section === 'all' || section === 'mismatches' ? buckets.mismatches : [],
    discordWithoutInGame:
      section === 'all' || section === 'unlinked' ? buckets.discordWithoutInGame : [],
    inGameWithoutDiscord: section === 'all' || section === 'unlinked' ? inGameWithoutDiscord : [],
    leftDiscordStillInGame:
      section === 'all' || section === 'departed' ? buckets.leftDiscordStillInGame : [],
  };
}
