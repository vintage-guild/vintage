import { TIERS, type Tier, tierAllows } from '@vintage/guild-kit';
import { currentSession, type Session } from './session';

/**
 * Who the site is composing for (docs/features/active/role-aware-views). One page, three
 * compositions: the storefront for visitors, the raid-day board for members, and the same plus
 * an officer strip for leaders and officers. The view only orders and shows sections; every
 * command still checks its own tier, so this is never a permission.
 */
export const VIEWS = ['visitor', 'member', 'officer'] as const;
export type View = (typeof VIEWS)[number];

/** The view for a session: signed out and `public` (Discord friends) see the storefront. */
export function viewFor(session: Session | null): View {
  switch (session?.tier) {
    case 'member':
    case 'recruit':
    case 'raider':
      return 'member';
    case 'leader':
    case 'officer':
      return 'officer';
    default:
      return 'visitor';
  }
}

/** The view for whoever is signed in now. */
export function currentView(): View {
  return viewFor(currentSession());
}

/**
 * The home page's sections, each with the lowest tier its reads allow. A section a session
 * can't read isn't shown at all, and neither is its header link: no placeholder copy for
 * people it isn't for. Recruiting is everyone's.
 */
export const HOME_SECTIONS = {
  raids: 'member', // raid-list, signup-list
  progress: 'member', // progress-get
  recruiting: 'public', // recruiting-get
  roster: 'recruit', // member-list
  news: 'member', // coordinator-log, poll-list
} as const satisfies Record<string, Tier>;

export type HomeSection = keyof typeof HOME_SECTIONS;

/** The home sections a session sees. */
export function sectionsFor(session: Session | null): Set<HomeSection> {
  // An unknown tier is treated as public, so it still gets the storefront.
  const raw = session?.tier ?? 'public';
  const tier: Tier = (TIERS as readonly string[]).includes(raw) ? (raw as Tier) : 'public';
  return new Set(
    (Object.keys(HOME_SECTIONS) as HomeSection[]).filter((s) => tierAllows(tier, HOME_SECTIONS[s])),
  );
}

/** Whether the session's tier can answer signups (`signup-set` is recruit tier). */
export function canSignUp(session: Session | null): boolean {
  return ['recruit', 'raider', 'leader', 'officer'].includes(session?.tier ?? '');
}
