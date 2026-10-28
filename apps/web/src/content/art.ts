import type { LedgerArt } from '@vintage/ui-kit';

/**
 * The site's art: Bloodfen's generated pieces, used with permission and not covered by the code
 * license. Files live in `public/art`; the brief for each is in the home page plan's image
 * guidance (docs/features/completed/home-page).
 */
export const ART = {
  /** The home hero: the orc and the dragon, subject right, dark left where the text sits. */
  hero: '/art/forever-dragon.webp',
  /** The hero on phones: the same pair stacked, dark at the top where the headline goes. */
  heroPhone: '/art/hero-phone.webp',
  /**
   * One scene per launch raid, keyed by the progress module's raid id, behind its ledger row.
   * The position is where the subject is, since the strip shows a slice of the 3:1 scene:
   * the barrow door, Hyjal's trunk and the sun, Onyxia on her ledge at the top right.
   */
  raids: {
    'barrow-deeps': { src: '/art/barrow-deeps.webp', position: '78% 38%' },
    'hyjal-summit': { src: '/art/hyjal-summit.webp', position: '74% 36%' },
    'onyxias-lair': { src: '/art/onyxias-lair.webp', position: '84% 16%' },
  } as Record<string, LedgerArt>,
  /** A tank's shield leaned on a healer's staff, ink and wash, for the cream recruiting band. */
  recruiting: '/art/recruiting-arms.webp',
  /** The coordinator's face: a messenger raven with a scroll, beside the news heading. */
  coordinator: '/art/coordinator-raven.webp',
  /** A dusk sky over black ridges, behind the footer. */
  dusk: '/art/dusk-ridge.webp',
};
