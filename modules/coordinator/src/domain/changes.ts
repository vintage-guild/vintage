// Post-digest change feed for `#leads` (signup-improvements §4, J61, J69):
// - Diffs current signups against the last announced state (`announcedState`), seeded at T-24h.
// - Group-only moves are ignored (no change alert).
// - Seated dropouts get a dedicated post with up to 4 Standby-only `[Seat X]` buttons (including
//   Standby who match via `alsoRoles`), plus already-seated flex candidates as plain text.
// - All other seat/Standby/answer/switch/removal/absence changes batch into one post per tick.
// Pure: data in, diff + MessageData out.
import { hasSplitDpsTargets, type RoleTargets, type TargetRole } from '@vintage/comp-solver';
import {
  actionRow,
  ButtonStyle,
  button,
  discordTimestamp,
  type MessageData,
  TimestampStyle,
} from '@vintage/discord-kit';
import type { GuildRank } from '@vintage/identity/contract';
import {
  RANK_PRIORITY,
  type RaidEvent,
  rosteredSignups,
  type Signup,
  targetsOf,
} from '@vintage/raids/contract';
import type { Role } from '@vintage/wow-data';
import type { AnnouncedMemberState } from '../contract';
import type { TickEvent, TickMember } from '../store';
import { cardTitle, eventTitle } from './kind-words';
import { compFor, finalRoster } from './render';

/** Sentinel `memberId` in `announcedState` holding a raid's last announced size & comp targets. */
export const RAID_STATE_MEMBER_ID = '__raid__';

const MAX_SEAT_BUTTONS = 4;

const ROLE_PLURAL: Record<Role, string> = {
  tank: 'Tanks',
  healer: 'Healers',
  melee: 'Melee',
  ranged: 'Ranged',
};

const ROLE_VERB: Record<Role, string> = {
  tank: 'tank',
  healer: 'heal',
  melee: 'melee',
  ranged: 'ranged',
};

const RANK_TAG: Partial<Record<GuildRank, string>> = {
  friend: 'Friend',
  member: 'Member',
  'flex-raider': 'Flex Raider',
  recruit: 'Recruit',
};

const RANK_NOTE: Partial<Record<GuildRank, string>> = {
  'flex-raider': 'flex raider',
  recruit: 'recruit',
  member: 'member',
  friend: 'friend',
};

function titleCase(word: string): string {
  return word
    .split('-')
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : ''))
    .join(' ');
}

function playingWords(s: { spec: string; class: string }): string {
  return `${titleCase(s.spec)} ${titleCase(s.class)}`;
}

function raidMetaRow(guildId: string, tick: TickEvent, now: number): AnnouncedMemberState {
  return {
    guildId,
    eventId: tick.event.id,
    memberId: RAID_STATE_MEMBER_ID,
    signupId: null,
    characterName: tick.event.name,
    class: null,
    spec: null,
    role: null,
    status: null,
    lateMinutes: null,
    note: null,
    seated: false,
    group: null,
    roster: null,
    updatedAt: tick.event.updatedAt ?? 0,
    updatedBy: tick.event.updatedBy ?? null,
    absenceSummary: null,
    eventSize: tick.event.size,
    eventRoleTargets: tick.event.roleTargets,
    announcedAt: now,
  };
}

/** Snapshot every current signup, absence, and raid size/comp metadata into `AnnouncedMemberState` rows. */
export function snapshotForEvent(
  guildId: string,
  tick: TickEvent,
  members: TickMember[],
  now: number,
): AnnouncedMemberState[] {
  const { going } = finalRoster(tick, members);
  const seatedIds = new Set(going.map((s) => s.id));
  const signupRows: AnnouncedMemberState[] = [
    raidMetaRow(guildId, tick, now),
    ...tick.signups.map((s) => ({
      guildId,
      eventId: tick.event.id,
      memberId: s.memberId,
      signupId: s.id,
      characterName: s.characterName,
      class: s.class,
      spec: s.spec,
      role: s.role,
      status: s.status,
      lateMinutes: s.lateMinutes,
      note: s.note,
      seated: seatedIds.has(s.id),
      group: s.group,
      roster: s.roster,
      updatedAt: s.updatedAt,
      updatedBy: s.updatedBy,
      absenceSummary: null,
      announcedAt: now,
    })),
  ];
  const seen = new Set(signupRows.map((r) => r.memberId));
  for (const a of tick.away ?? []) {
    if (seen.has(a.memberId)) continue;
    signupRows.push({
      guildId,
      eventId: tick.event.id,
      memberId: a.memberId,
      signupId: null,
      characterName: a.displayName,
      class: null,
      spec: null,
      role: null,
      status: null,
      lateMinutes: null,
      note: a.reason,
      seated: false,
      group: null,
      roster: null,
      updatedAt: now,
      updatedBy: null,
      absenceSummary: a.summary,
      announcedAt: now,
    });
  }
  return signupRows;
}

export interface DropoutAlert {
  memberId: string;
  characterName: string;
  role: Role;
  group: number | null;
  reason: string | null;
  nextState: AnnouncedMemberState;
}

export interface EventChangeDiff {
  dropouts: DropoutAlert[];
  lines: string[];
  /** Updated rows to persist to `announcedState` once announced. */
  changedRows: AnnouncedMemberState[];
  /** True when an approved raid grew to open seats while Standby players are waiting. */
  openSeatsOpened?: boolean;
}

function isLeaderAction(curr: AnnouncedMemberState): boolean {
  return Boolean(curr.updatedBy && curr.updatedBy !== curr.memberId);
}

function memberDisplayName(
  members: ReadonlyMap<string, TickMember>,
  memberId: string | null,
): string {
  return (memberId && members.get(memberId)?.displayName) || 'A leader';
}

function formatNewSignup(curr: AnnouncedMemberState, member: TickMember | undefined): string {
  const name = curr.characterName ?? member?.displayName ?? 'Someone';
  if (curr.status === 'declined') return `**${name}** marked Absent.`;
  if (curr.status === 'tentative') {
    return `**${name}** signed up Tentative${curr.note ? `: ${curr.note}` : ''}.`;
  }
  const rankTag = member?.rank && RANK_TAG[member.rank] ? ` (${RANK_TAG[member.rank]})` : '';
  const play = curr.spec && curr.class ? playingWords({ spec: curr.spec, class: curr.class }) : '';
  const late = curr.status === 'late' && curr.lateMinutes ? `, ${curr.lateMinutes}m late` : '';
  const seat = curr.seated ? 'seated' : 'on Standby';
  return `**${name}** signed up${rankTag}: ${play}${late}, ${seat}.`;
}

function formatStatusChange(curr: AnnouncedMemberState): string {
  const name = curr.characterName ?? 'Someone';
  switch (curr.status) {
    case 'late':
      return `**${name}** is now Late${curr.lateMinutes ? `, ${curr.lateMinutes} minutes` : ''}.`;
    case 'tentative':
      return `**${name}** is now Tentative${curr.note ? `: ${curr.note}` : ''}.`;
    case 'accepted':
      return `**${name}** is now Going${curr.seated ? '' : ' (on Standby)'}.`;
    case 'bench':
      return `**${name}** is now on Standby.`;
    case 'declined':
      return `**${name}** is now Absent.`;
    default:
      return `**${name}** updated their signup.`;
  }
}

function formatSwitchChange(prev: AnnouncedMemberState, curr: AnnouncedMemberState): string {
  const play = curr.spec && curr.class ? playingWords({ spec: curr.spec, class: curr.class }) : '';
  const rolePart = curr.role ? `, ${curr.role}` : '';
  if (prev.characterName && curr.characterName && prev.characterName !== curr.characterName) {
    return `**${prev.characterName}** switched to ${curr.characterName} (${play}${rolePart}).`;
  }
  return `**${curr.characterName ?? 'Someone'}** switched to ${play}${rolePart}.`;
}

function isSeatedDropout(
  prev: AnnouncedMemberState | undefined,
  curr: AnnouncedMemberState | undefined,
): boolean {
  if (!prev?.seated || !prev.role) return false;
  if (!curr) return true;
  if (curr.seated) return false;
  // Leader benching someone is a leader action, not a dropout.
  if (curr.roster === 'benched' && isLeaderAction(curr)) return false;
  return curr.status === 'declined' || curr.status === 'bench' || curr.status === 'tentative';
}

function diffMemberChange(
  prev: AnnouncedMemberState | undefined,
  curr: AnnouncedMemberState,
  memberById: ReadonlyMap<string, TickMember>,
): string | null {
  if (!curr.signupId && curr.absenceSummary) {
    if (prev?.absenceSummary === curr.absenceSummary) return null;
    const name = memberById.get(curr.memberId)?.displayName ?? curr.characterName ?? 'Someone';
    return `**${name}** marked absent ${curr.absenceSummary}.`;
  }
  if (!prev?.signupId) return formatNewSignup(curr, memberById.get(curr.memberId));
  if (prev.seated !== curr.seated && isLeaderAction(curr)) {
    const leader = memberDisplayName(memberById, curr.updatedBy);
    return curr.seated
      ? `**${leader}** seated ${curr.characterName}.`
      : `**${leader}** moved ${curr.characterName} to Standby.`;
  }
  const statusChanged =
    prev.status !== curr.status ||
    prev.lateMinutes !== curr.lateMinutes ||
    (curr.status === 'tentative' && prev.note !== curr.note);
  if (statusChanged) return formatStatusChange(curr);
  const switched =
    prev.characterName !== curr.characterName || prev.spec !== curr.spec || prev.role !== curr.role;
  if (switched) return formatSwitchChange(prev, curr);
  // Group-only moves or untouched rows produce no alert.
  return null;
}

function clearedState(prev: AnnouncedMemberState, now: number): AnnouncedMemberState {
  return {
    ...prev,
    signupId: null,
    status: null,
    lateMinutes: null,
    note: null,
    seated: false,
    group: null,
    roster: null,
    updatedAt: now,
    updatedBy: null,
    announcedAt: now,
  };
}

function collectRemovedChanges(
  previous: readonly AnnouncedMemberState[],
  currByMember: ReadonlyMap<string, AnnouncedMemberState>,
  now: number,
  out: EventChangeDiff,
): void {
  for (const prev of previous) {
    if (prev.memberId === RAID_STATE_MEMBER_ID || !prev.signupId || currByMember.has(prev.memberId))
      continue;
    const cleared = clearedState(prev, now);
    out.changedRows.push(cleared);
    if (isSeatedDropout(prev, undefined)) {
      out.dropouts.push({
        memberId: prev.memberId,
        characterName: prev.characterName ?? 'Someone',
        role: prev.role!,
        group: prev.group,
        reason: null,
        nextState: cleared,
      });
    } else {
      out.lines.push(`**${prev.characterName ?? 'Someone'}** was removed from the roster.`);
    }
  }
}

function targetDiffParts(
  event: RaidEvent,
  prevSize: number | null,
  prevTargets: RoleTargets | null,
): string[] {
  const before = targetsOf({ kind: event.kind, size: prevSize, roleTargets: prevTargets });
  const after = targetsOf(event);
  const parts: string[] = [];
  if (after.tank !== before.tank) parts.push(`Tanks ${after.tank}`);
  if (after.healer !== before.healer) parts.push(`Healers ${after.healer}`);
  if (hasSplitDpsTargets(after)) {
    const prevMelee = hasSplitDpsTargets(before) ? before.melee : null;
    const prevRanged = hasSplitDpsTargets(before) ? before.ranged : null;
    if (after.melee !== prevMelee) parts.push(`Melee ${after.melee}`);
    if (after.ranged !== prevRanged) parts.push(`Ranged ${after.ranged}`);
  } else if (hasSplitDpsTargets(before) || after.dps !== before.dps) {
    parts.push(`DPS ${after.dps}`);
  }
  return parts;
}

function formatRaidEditParts(
  event: RaidEvent,
  prevSize: number | null,
  prevTargets: RoleTargets | null,
  sizeChanged: boolean,
  targetsChanged: boolean,
): string[] {
  const parts: string[] = [];
  if (sizeChanged) {
    parts.push(event.size === null ? 'open size' : `${event.size} people`);
  }
  if (targetsChanged) {
    const tParts = targetDiffParts(event, prevSize, prevTargets);
    parts.push(...(tParts.length ? tParts : ['default comp']));
  }
  return parts;
}

function recordApprovedSizeEffects(
  tick: TickEvent,
  members: TickMember[],
  prevSize: number | null,
  out: EventChangeDiff,
): void {
  const { going, bench } = finalRoster(tick, members);
  if (tick.event.size !== null && going.length > tick.event.size) {
    const over = going.length - tick.event.size;
    out.lines.push(
      `${tick.event.name} is now ${tick.event.size} people with ${going.length} seated. Move ${over} to Standby.`,
    );
  }
  const grew = prevSize !== null && (tick.event.size === null || tick.event.size > prevSize);
  if (grew && tick.event.size !== null && going.length < tick.event.size && bench.length > 0) {
    out.openSeatsOpened = true;
  }
}

function recordUnapprovedShrinkWarning(tick: TickEvent, out: EventChangeDiff): void {
  if (tick.event.size === null) return;
  const seated = rosteredSignups(tick.signups).length;
  if (seated <= tick.event.size) return;
  const over = seated - tick.event.size;
  out.lines.push(
    `${tick.event.name} is now ${tick.event.size} people with ${seated} seated. Move ${over} to Standby.`,
  );
}

function diffRaidMetaChange(
  tick: TickEvent,
  members: TickMember[],
  memberById: ReadonlyMap<string, TickMember>,
  prevRaid: AnnouncedMemberState | undefined,
  currRaid: AnnouncedMemberState,
  out: EventChangeDiff,
): void {
  if (!prevRaid || prevRaid.eventSize === undefined) return;
  const sizeChanged = prevRaid.eventSize !== tick.event.size;
  const targetsChanged =
    JSON.stringify(prevRaid.eventRoleTargets ?? null) !==
    JSON.stringify(tick.event.roleTargets ?? null);
  if (!sizeChanged && !targetsChanged) return;

  const parts = formatRaidEditParts(
    tick.event,
    prevRaid.eventSize,
    prevRaid.eventRoleTargets ?? null,
    sizeChanged,
    targetsChanged,
  );
  const leader = memberDisplayName(memberById, tick.event.updatedBy ?? null);
  out.lines.push(`**${leader}** set ${tick.event.name} to ${parts.join(', ')}.`);
  out.changedRows.push(currRaid);

  if (!sizeChanged) return;
  if (tick.event.rosterApprovedAt !== null) {
    recordApprovedSizeEffects(tick, members, prevRaid.eventSize, out);
  } else {
    recordUnapprovedShrinkWarning(tick, out);
  }
}

/**
 * Diff a raid's current signups and raid size/comp against its last `announcedState`.
 * Returns seated dropouts (each gets its own post with `[Seat X]` buttons) and general change
 * lines (batched into one post).
 */
export function diffEventChanges(
  guildId: string,
  tick: TickEvent,
  members: TickMember[],
  previous: readonly AnnouncedMemberState[],
  now: number,
): EventChangeDiff {
  const prevByMember = new Map(previous.map((p) => [p.memberId, p]));
  const memberById = new Map(members.map((m) => [m.memberId, m]));
  const currentRows = snapshotForEvent(guildId, tick, members, now);
  const currByMember = new Map(currentRows.map((c) => [c.memberId, c]));
  const out: EventChangeDiff = { dropouts: [], lines: [], changedRows: [] };

  const currRaid = currByMember.get(RAID_STATE_MEMBER_ID);
  if (currRaid) {
    diffRaidMetaChange(
      tick,
      members,
      memberById,
      prevByMember.get(RAID_STATE_MEMBER_ID),
      currRaid,
      out,
    );
  }

  for (const curr of currentRows) {
    if (curr.memberId === RAID_STATE_MEMBER_ID) continue;
    const prev = prevByMember.get(curr.memberId);
    if (isSeatedDropout(prev, curr)) {
      out.dropouts.push({
        memberId: curr.memberId,
        characterName: prev!.characterName ?? curr.characterName ?? 'Someone',
        role: prev!.role!,
        group: curr.group ?? prev!.group,
        reason: curr.note ?? null,
        nextState: curr,
      });
      out.changedRows.push(curr);
      continue;
    }
    const line = diffMemberChange(prev, curr, memberById);
    if (line) {
      out.lines.push(line);
      out.changedRows.push(curr);
    }
  }

  collectRemovedChanges(previous, currByMember, now, out);
  return out;
}

export interface SeatCandidate {
  signup: Signup;
  viaAlsoRole: boolean;
  rank: GuildRank | null;
}

/**
 * Standby candidates who can fill `neededRole` (for `[Seat X]` buttons, up to 4) and already-seated
 * players who can flex to `neededRole` (plain text only so clicking never opens another hole).
 */
export function seatCandidatesFor(
  tick: TickEvent,
  members: TickMember[],
  neededRole: Role,
): { standby: SeatCandidate[]; seatedFlex: Signup[] } {
  const rankById = new Map(members.map((m) => [m.memberId, m.rank]));
  const { going, bench } = finalRoster(tick, members);

  const standby = bench
    .filter((s) => s.role === neededRole || s.alsoRoles.includes(neededRole))
    .map(
      (s): SeatCandidate => ({
        signup: s,
        viaAlsoRole: s.role !== neededRole,
        rank: rankById.get(s.memberId) ?? null,
      }),
    )
    .sort((a, b) => {
      // Direct role matches first, then rank priority (Raider > Recruit > Flex > Member > Friend).
      if (a.viaAlsoRole !== b.viaAlsoRole) return a.viaAlsoRole ? 1 : -1;
      const pa = a.rank ? RANK_PRIORITY[a.rank] : 0;
      const pb = b.rank ? RANK_PRIORITY[b.rank] : 0;
      return pb - pa || a.signup.characterName.localeCompare(b.signup.characterName);
    });

  const seatedFlex = going
    .filter((s) => s.role !== neededRole && s.alsoRoles.includes(neededRole))
    .sort((a, b) => a.characterName.localeCompare(b.characterName));

  return { standby, seatedFlex };
}

function roleCountSummary(event: RaidEvent, going: readonly Signup[], role: Role): string {
  const count = going.filter((s) => s.role === role).length;
  const targets = targetsOf(event);
  let target: number | null = null;
  if (role === 'tank' || role === 'healer') {
    target = targets[role];
  } else if (hasSplitDpsTargets(targets)) {
    target = targets[role];
  }
  return target !== null
    ? `${ROLE_PLURAL[role]} ${count}/${target} now.`
    : `${ROLE_PLURAL[role]} ${count} now.`;
}

function formatCandidate(c: SeatCandidate, neededRole: Role): string {
  if (c.viaAlsoRole) return `${c.signup.characterName} (can also ${ROLE_VERB[neededRole]})`;
  const tag = c.rank ? RANK_NOTE[c.rank] : undefined;
  return tag ? `${c.signup.characterName} (${tag})` : c.signup.characterName;
}

/** Dedicated `#leads` alert when a seated player drops out after T-24h, with up to 4 Seat buttons. */
export function renderDropoutAlert(
  tick: TickEvent,
  dropout: DropoutAlert,
  members: TickMember[],
): MessageData {
  const { going } = finalRoster(tick, members);
  const { standby, seatedFlex } = seatCandidatesFor(tick, members, dropout.role);
  const when = discordTimestamp(tick.event.startsAt, TimestampStyle.SHORT_DATE_TIME);
  const lines = [
    `**${dropout.characterName}** dropped out of ${cardTitle(tick.event)} (${when}). ${roleCountSummary(tick.event, going, dropout.role)}`,
  ];
  if (dropout.reason) lines.push(`-# ${dropout.reason}`);
  if (standby.length) {
    lines.push(
      `Standby who could ${ROLE_VERB[dropout.role]}: ${standby.map((c) => formatCandidate(c, dropout.role)).join(', ')}.`,
    );
  }
  if (seatedFlex.length) {
    lines.push(
      `Already seated who can ${ROLE_VERB[dropout.role]}: ${seatedFlex.map((s) => s.characterName).join(', ')}.`,
    );
  }
  const buttons = standby
    .slice(0, MAX_SEAT_BUTTONS)
    .map((c) =>
      button(
        `seat:${tick.event.id}:${c.signup.id}:${dropout.role}:${dropout.group ?? 0}`,
        `Seat ${c.signup.characterName}`.slice(0, 80),
        ButtonStyle.PRIMARY,
      ),
    );
  return {
    content: lines.join('\n').slice(0, 2000),
    ...(buttons.length ? { components: [actionRow(...buttons)] } : {}),
    allowed_mentions: { parse: [] },
  };
}

/** One batched `#leads` post for all non-dropout changes on a raid in a single tick. */
export function renderChangeBatch(tick: TickEvent, lines: readonly string[]): MessageData {
  const header = `**${eventTitle(tick.event)}**`;
  return {
    content: [header, ...lines].join('\n').slice(0, 2000),
    allowed_mentions: { parse: [] },
  };
}

interface SeatPick {
  signup: Signup;
  role: Role;
  viaAlsoRole: boolean;
  rank: GuildRank | null;
}

const DPS_ROLES: readonly Role[] = ['melee', 'ranged'];

function matchRoleForGap(
  s: Signup,
  target: TargetRole,
): { role: Role; viaAlsoRole: boolean } | null {
  if (target === 'dps') {
    if (DPS_ROLES.includes(s.role)) return { role: s.role, viaAlsoRole: false };
    const flex = DPS_ROLES.find((r) => s.alsoRoles.includes(r));
    return flex ? { role: flex, viaAlsoRole: true } : null;
  }
  if (s.role === target) return { role: target, viaAlsoRole: false };
  return s.alsoRoles.includes(target) ? { role: target, viaAlsoRole: true } : null;
}

function sortPicks(a: SeatPick, b: SeatPick): number {
  if (a.viaAlsoRole !== b.viaAlsoRole) return a.viaAlsoRole ? 1 : -1;
  const pa = a.rank ? RANK_PRIORITY[a.rank] : 0;
  const pb = b.rank ? RANK_PRIORITY[b.rank] : 0;
  return pb - pa || a.signup.characterName.localeCompare(b.signup.characterName);
}

function formatPick(p: SeatPick, verb: string): string {
  if (p.viaAlsoRole) return `${p.signup.characterName} (can also ${verb})`;
  const tag = p.rank ? RANK_NOTE[p.rank] : undefined;
  return tag ? `${p.signup.characterName} (${tag})` : p.signup.characterName;
}

function candidatesForGap(
  going: readonly Signup[],
  bench: readonly Signup[],
  rankById: ReadonlyMap<string, GuildRank | null>,
  target: TargetRole,
): { standby: SeatPick[]; seatedFlex: Signup[] } {
  const standby: SeatPick[] = [];
  for (const s of bench) {
    const match = matchRoleForGap(s, target);
    if (match) standby.push({ signup: s, ...match, rank: rankById.get(s.memberId) ?? null });
  }
  standby.sort(sortPicks);
  const seatedFlex = going
    .filter((s) => {
      const match = matchRoleForGap(s, target);
      return Boolean(match?.viaAlsoRole);
    })
    .sort((a, b) => a.characterName.localeCompare(b.characterName));
  return { standby, seatedFlex };
}

function recordStandbyPicks(
  picks: readonly SeatPick[],
  chosen: Map<string, SeatPick>,
  listedIds: Set<string>,
) {
  for (const p of picks) {
    listedIds.add(p.signup.id);
    if (!chosen.has(p.signup.id)) chosen.set(p.signup.id, p);
  }
}

function collectRoleGapLines(
  tick: TickEvent,
  going: readonly Signup[],
  bench: readonly Signup[],
  rankById: ReadonlyMap<string, GuildRank | null>,
  members: TickMember[],
): { lines: string[]; chosen: Map<string, SeatPick>; listedIds: Set<string> } {
  const lines: string[] = [];
  const chosen = new Map<string, SeatPick>();
  const listedIds = new Set<string>();
  const roleGaps = compFor(tick, members, { goingOnly: true }).gaps.filter(
    (g) => g.kind === 'role',
  );
  for (const gap of roleGaps) {
    const verb = gap.role === 'dps' ? 'dps' : ROLE_VERB[gap.role];
    const { standby, seatedFlex } = candidatesForGap(going, bench, rankById, gap.role);
    if (standby.length) {
      recordStandbyPicks(standby, chosen, listedIds);
      lines.push(
        `Open ${gap.reason.replace(/^need /, '')}: Standby who could ${verb}: ${standby.map((p) => formatPick(p, verb)).join(', ')}.`,
      );
    }
    if (seatedFlex.length) {
      lines.push(
        `Already seated who can ${verb}: ${seatedFlex.map((s) => s.characterName).join(', ')}.`,
      );
    }
  }
  return { lines, chosen, listedIds };
}

/**
 * Lock-time `#leads` alert when a raid locks with open seats and Standby available: lists each
 * open role gap and general Standby candidates with up to 4 Standby-only `[Seat X]` buttons
 * (same pattern as `renderDropoutAlert`).
 */
export function renderLockOpenSeats(
  tick: TickEvent,
  members: TickMember[],
  { reason = 'lock' }: { reason?: 'lock' | 'grew' } = {},
): MessageData {
  const { going, bench } = finalRoster(tick, members);
  const openSeats = tick.event.size !== null ? Math.max(0, tick.event.size - going.length) : 0;
  const when = discordTimestamp(tick.event.startsAt, TimestampStyle.SHORT_DATE_TIME);
  const seatWord = openSeats === 1 ? 'seat' : 'seats';
  const rankById = new Map(members.map((m) => [m.memberId, m.rank]));
  const {
    lines: gapLines,
    chosen,
    listedIds,
  } = collectRoleGapLines(tick, going, bench, rankById, members);
  const headline =
    reason === 'grew'
      ? `**${cardTitle(tick.event)}** (${when}) now has **${openSeats} open ${seatWord}** (${going.length}/${tick.event.size}).`
      : `**${cardTitle(tick.event)}** (${when}) locked with **${openSeats} open ${seatWord}** (${going.length}/${tick.event.size}).`;
  const lines = [headline, ...gapLines];

  const remaining = bench
    .filter((s) => !listedIds.has(s.id))
    .map(
      (s): SeatPick => ({
        signup: s,
        role: s.role,
        viaAlsoRole: false,
        rank: rankById.get(s.memberId) ?? null,
      }),
    )
    .sort(sortPicks);

  if (remaining.length) {
    for (const p of remaining) {
      if (!chosen.has(p.signup.id)) chosen.set(p.signup.id, p);
    }
    lines.push(
      `Standby available: ${remaining.map((p) => formatPick(p, ROLE_VERB[p.role])).join(', ')}.`,
    );
  }

  const buttons = [...chosen.values()]
    .slice(0, MAX_SEAT_BUTTONS)
    .map((p) =>
      button(
        `seat:${tick.event.id}:${p.signup.id}:${p.role}:0`,
        `Seat ${p.signup.characterName}`.slice(0, 80),
        ButtonStyle.PRIMARY,
      ),
    );

  return {
    content: lines.join('\n').slice(0, 2000),
    ...(buttons.length ? { components: [actionRow(...buttons)] } : {}),
    allowed_mentions: { parse: [] },
  };
}
