// Public surface of the site module. Other modules import only this file.
//
// The site module owns the website's editable copy: today the recruiting band (the headline,
// the pitch, and how much the guild needs each class). Officers change it with
// `recruiting-set` from the officers' quarters, Discord, or an agent; everyone reads it with
// `recruiting-get`, so visitors see the same thing officers wrote.

import { CLASS_NAMES, type WowClass } from '@vintage/wow-data';

/** How much the guild wants a class, most to least. `closed` still shows, as "not now". */
export const NEED_LEVELS = ['high', 'medium', 'closed'] as const;
export type NeedLevel = (typeof NEED_LEVELS)[number];

/** One row of the recruiting band. */
export interface ClassNeed {
  wowClass: WowClass;
  /** Free text for the specs wanted: "protection", "holy · discipline", "any". */
  specs: string;
  need: NeedLevel;
}

/** Limits `recruiting-set` enforces, here so every surface can show them. */
export const RECRUITING_LIMITS = {
  headline: 120,
  pitch: 800,
  specs: 60,
  needs: CLASS_NAMES.length,
} as const;

/** What `recruiting-get` answers. */
export interface Recruiting {
  headline: string;
  pitch: string;
  /** In the order officers set; the band shows them as given. One row per class at most. */
  needs: ClassNeed[];
  /**
   * Epoch ms of the last `recruiting-set`, or null while the band shows the starter text. Who
   * saved it is stored but not answered: this view is public.
   */
  updatedAt: number | null;
}

/**
 * What the band says until an officer saves it: the copy the website shipped with before this
 * module existed, so the first deploy shows no change.
 */
export const STARTER_RECRUITING: Recruiting = {
  headline: 'We need a second main tank, and two healers for the twenties.',
  pitch:
    'Semi-hardcore: come prepared, be on time, be kind. Loot is decided before the first raid ' +
    'and written here. New members start as recruits for about two weeks; Discord ranks are ' +
    'guild ranks, so nothing is managed twice. To join, ask an officer for an invite to the ' +
    'Discord, then sign in here to add your characters.',
  needs: [
    { wowClass: 'warrior', specs: 'protection', need: 'high' },
    { wowClass: 'priest', specs: 'holy · discipline', need: 'high' },
    { wowClass: 'shaman', specs: 'restoration', need: 'high' },
    { wowClass: 'mage', specs: 'any', need: 'medium' },
    { wowClass: 'druid', specs: 'restoration · feral tank', need: 'medium' },
    { wowClass: 'warlock', specs: 'any', need: 'medium' },
    { wowClass: 'paladin', specs: 'holy', need: 'medium' },
    { wowClass: 'hunter', specs: 'any', need: 'closed' },
    { wowClass: 'rogue', specs: 'any', need: 'closed' },
  ],
  updatedAt: null,
};

export const SITE_COMMANDS = ['recruiting-get', 'recruiting-set'] as const;
export type SiteCommandName = (typeof SITE_COMMANDS)[number];
