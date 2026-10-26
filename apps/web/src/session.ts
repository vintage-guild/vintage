import type { GuildRank } from '@vintage/identity/contract';

/** The signed-in person. */
export interface Session {
  /**
   * Their Vintage member id; null when they signed in with Discord but aren't in the guild's
   * Discord server. Then they are `public` tier and see what visitors see.
   */
  memberId: string | null;
  displayName: string;
  tier: string;
  rank: GuildRank | null;
  /** Their Discord avatar (Discord's CDN, or its default avatar). Absent shows their initial. */
  avatarUrl?: string;
  /** IANA zone from the member's preferences (`member-prefs-set timezone`); times show in it. */
  timezone?: string;
}

let session: Session | null = null;

/**
 * Tiers a leader or officer can preview the site as, lowest first. `visitor` is signed out.
 * Each has the guild rank a member of that tier would carry, for the rank pill.
 */
export const PREVIEW_TIERS = {
  visitor: null,
  member: 'member',
  recruit: 'recruit',
  raider: 'raider',
  leader: 'raid-leader',
} as const satisfies Record<string, GuildRank | null>;
export type PreviewTier = keyof typeof PREVIEW_TIERS;

const TIER_ORDER = ['public', 'member', 'recruit', 'raider', 'leader', 'officer'];
const rankOf = (tier: string) => TIER_ORDER.indexOf(tier === 'visitor' ? 'public' : tier);

let preview: PreviewTier | null = null;

/** Whether `real` may preview the site as `tier`: leaders and officers, as a lower tier. */
export function canPreviewAs(real: Session | null, tier: PreviewTier): boolean {
  const have = rankOf(real?.tier ?? 'public');
  return have >= rankOf('leader') && rankOf(tier) < have;
}

/** Show the site as `tier` for the rest of this page load (null: as yourself). */
export function setPreview(tier: PreviewTier | null): void {
  preview = tier;
}

/** The tier being previewed, when the signed-in person may preview it. */
export function currentPreview(): PreviewTier | null {
  return preview && canPreviewAs(session, preview) ? preview : null;
}

/** Who is really signed in, ignoring a preview. */
export function realSession(): Session | null {
  return session;
}

/**
 * The signed-in person, or null. Set by Discord sign-in (`src/connect.ts`, through
 * `@vintage/web-session`); in development the fixtures sign in a persona instead. While a leader
 * or officer previews a lower tier, this is them at that tier (null for `visitor`), so every
 * page composes as that tier would see it.
 */
export function currentSession(): Session | null {
  const tier = currentPreview();
  if (!session || !tier) return session;
  if (tier === 'visitor') return null;
  return { ...session, tier, rank: PREVIEW_TIERS[tier] };
}

export function setSession(next: Session | null): void {
  session = next;
}

/** What the shell can do about signing in, once a backend is connected. */
export interface SignInHandlers {
  signIn(): void;
  signOut(): void;
  /** Re-read the session (after `member-prefs-set`, or for a rank change from role sync). */
  refresh(): Promise<void>;
}

let handlers: SignInHandlers | null = null;

/** The shell installs these when it connects to the guild server. */
export function setSignInHandlers(next: SignInHandlers | null): void {
  handlers = next;
}

/** Whether sign-in can start: false with the dev fixtures and before a backend is connected. */
export function canSignIn(): boolean {
  return handlers !== null;
}

export function signIn(): void {
  handlers?.signIn();
}

export function signOut(): void {
  handlers?.signOut();
}

export async function refreshSession(): Promise<void> {
  await handlers?.refresh();
}
