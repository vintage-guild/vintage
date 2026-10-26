/** The signed-in member, once Discord sign-in (#7) exists. */
export interface Session {
  memberId: string;
  displayName: string;
  tier: string;
}

/** Always signed out until Better Auth + Discord sign-in lands (#7). */
export function currentSession(): Session | null {
  return null;
}

/** Where the sign-in button points. Empty keeps it disabled. */
export const SIGN_IN_HREF = '';
