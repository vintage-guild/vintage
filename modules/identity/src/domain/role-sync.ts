import type { Member } from '../contract';
import type { DirectoryMember } from '../directory';

/** Input for one `member-sync` call. */
export interface MemberSyncInput {
  discordId: string;
  displayName: string;
  inServer: boolean;
  roleIds: string[];
}

/**
 * Plan a role sync: one `member-sync` input per person. Everyone in the Discord directory is
 * synced as in the server with their current roles (unchanged members too, so `syncedAt`
 * reflects the last check); known members missing from it are synced as gone, which drops them
 * to `public`. Repeated directory entries keep the last one seen; role ids are de-duplicated.
 * Output order: directory order, then departed members in known order.
 */
export function planRoleSync(
  directory: readonly DirectoryMember[],
  known: readonly Pick<Member, 'discordId' | 'displayName'>[],
): MemberSyncInput[] {
  const knownNames = new Map(known.map((m) => [m.discordId, m.displayName]));
  const present = new Map<string, MemberSyncInput>();
  for (const m of directory) {
    present.set(m.discordId, {
      discordId: m.discordId,
      displayName: m.displayName.trim() || knownNames.get(m.discordId) || m.discordId,
      inServer: true,
      roleIds: [...new Set(m.roleIds)],
    });
  }
  const departed = new Map<string, MemberSyncInput>();
  for (const m of known) {
    if (present.has(m.discordId) || departed.has(m.discordId)) continue;
    departed.set(m.discordId, {
      discordId: m.discordId,
      displayName: m.displayName,
      inServer: false,
      roleIds: [],
    });
  }
  return [...present.values(), ...departed.values()];
}
