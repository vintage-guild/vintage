import type { Character, Member } from '@vintage/identity/contract';
import { getCommandClient } from '@vintage/ui-kit';

/** What Profile and Characters read: the signed-in member and their characters. */
export interface MemberData {
  member: Member;
  characters: Character[];
}

/**
 * `member-me`, or why it isn't available: `signed-out` with no session, `not-in-guild` when the
 * server refuses (signed in with Discord but not in the guild's server), `error` otherwise.
 */
export type MemberRead =
  | { ok: true; data: MemberData }
  | { ok: false; reason: 'not-in-guild' | 'error'; message: string };

export async function readMember(): Promise<MemberRead> {
  const result = await getCommandClient().read<MemberData>('member-me', {});
  if (result.success && result.data) return { ok: true, data: result.data };
  const code = result.success ? '' : result.error?.code;
  return {
    ok: false,
    reason: code === 'COMMAND_NOT_FOUND' ? 'not-in-guild' : 'error',
    message: result.success ? 'No member data' : (result.error?.message ?? 'Could not read'),
  };
}
