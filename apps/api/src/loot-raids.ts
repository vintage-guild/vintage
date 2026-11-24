// Adapts raids + identity stores to loot's read-only LootRaidReader port.
// Pure over ports so Convex (stores.ts) and the JTBD host resolve raid attendees identically.
import type { IdentityStore } from '@vintage/identity/commands';
import type { LootRaidContext, LootRaidReader } from '@vintage/loot/commands';
import type { RaidAttendee } from '@vintage/loot/contract';
import type { RaidsStore } from '@vintage/raids/commands';
import type { RaidAttendance, Signup } from '@vintage/raids/contract';

function attendeeFromSignup(
  signup: Signup,
  rankByMember: ReadonlyMap<string, string | null>,
): RaidAttendee {
  return {
    characterId: signup.characterId,
    characterName: signup.characterName,
    memberId: signup.memberId,
    class: signup.class,
    spec: signup.spec,
    role: signup.role,
    alsoRoles: signup.alsoRoles,
    rank: rankByMember.get(signup.memberId) ?? null,
  };
}

function attendeeFromAttendance(
  row: RaidAttendance,
  signupByChar: ReadonlyMap<string, Signup>,
  rankByMember: ReadonlyMap<string, string | null>,
): RaidAttendee {
  const signup = row.characterId ? signupByChar.get(row.characterId) : undefined;
  const memberId = row.memberId ?? signup?.memberId ?? null;
  return {
    characterId: row.characterId ?? row.name,
    characterName: signup?.characterName ?? row.name,
    memberId,
    class: signup?.class ?? null,
    spec: signup?.spec ?? null,
    role: signup?.role ?? null,
    alsoRoles: signup?.alsoRoles ?? [],
    rank: memberId ? (rankByMember.get(memberId) ?? null) : null,
  };
}

export function createLootRaidReader(stores: {
  raids: Pick<RaidsStore, 'getEvent' | 'listSignups' | 'listAttendance'>;
  identity: Pick<IdentityStore, 'listMembers'>;
}): LootRaidReader {
  const { raids, identity } = stores;
  return {
    async getRaidContext(guildId, eventId): Promise<LootRaidContext | null> {
      const event = await raids.getEvent(guildId, eventId);
      if (!event) return null;
      const [signups, attendance, members] = await Promise.all([
        raids.listSignups(guildId, eventId),
        raids.listAttendance(guildId, eventId),
        identity.listMembers(guildId),
      ]);
      const rankByMember = new Map(members.map((m) => [m.id, m.rank]));
      const signupByChar = new Map(signups.map((s) => [s.characterId, s]));

      let attendees: RaidAttendee[];
      if (attendance.length > 0) {
        attendees = attendance.map((row) =>
          attendeeFromAttendance(row, signupByChar, rankByMember),
        );
      } else {
        const rostered = signups.filter((s) => s.roster === 'rostered');
        const active = rostered.length ? rostered : signups.filter((s) => s.status !== 'declined');
        attendees = active.map((s) => attendeeFromSignup(s, rankByMember));
      }

      return {
        eventId: event.id,
        name: event.name,
        lootMethodId: event.lootMethodId,
        attendees,
      };
    },
  };
}
