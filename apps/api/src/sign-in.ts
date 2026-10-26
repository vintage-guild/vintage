// What happens right after someone signs in with Discord (#7): read their guild member with the
// bot (the same source as the role-sync cron) and run `member-sync`, so their rank and tier are
// current before the website's first command. Someone not in the server isn't synced: their caller
// stays public until they join and the cron picks them up.
import type { DirectoryMember, MemberSyncInput } from '@vintage/identity/commands';

export interface SignInSyncDeps {
  /** The guild member from Discord, or null when they aren't in the server. */
  fetchMember(discordId: string): Promise<DirectoryMember | null>;
  syncMember(input: MemberSyncInput): Promise<unknown>;
}

export type SignInSync = 'synced' | 'not-in-server';

export async function syncOnSignIn(discordId: string, deps: SignInSyncDeps): Promise<SignInSync> {
  const member = await deps.fetchMember(discordId);
  if (!member) return 'not-in-server';
  await deps.syncMember({ ...member, inServer: true });
  return 'synced';
}
