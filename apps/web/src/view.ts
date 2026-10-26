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

/** Whether the session's tier can answer signups (`signup-set` is recruit tier). */
export function canSignUp(session: Session | null): boolean {
  return ['recruit', 'raider', 'leader', 'officer'].includes(session?.tier ?? '');
}
