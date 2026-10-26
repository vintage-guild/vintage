// What the recruiting band says. Officer-editable content; a `site` module will own it later
// (the feature plan lists `recruit-needs-set`). Until then it lives here, not in a fixture, so
// production shows the same thing as development.

/**
 * The public Discord invite. Null until the GM sets one (feature plan, open question 3): the
 * calls to action then point at the recruiting band, which says to ask an officer.
 */
export const DISCORD_INVITE_URL: string | null = null;

export type Need = 'high' | 'medium' | 'closed';

export interface ClassNeed {
  wowClass: string;
  specs: string;
  need: Need;
}

export const RECRUITING = {
  updatedOn: 'Oct 25, 2026',
  headline: 'We need a second main tank, and two healers for the twenties.',
  pitch:
    'Semi-hardcore: come prepared, be on time, be kind. Loot is decided before the first raid ' +
    'and written here. New members start as recruits for about two weeks; Discord ranks are ' +
    'guild ranks, so nothing is managed twice. To join, ask an officer for an invite to the ' +
    'Discord, then sign in here to add your characters.',
  needs: [
    { wowClass: 'Warrior', specs: 'protection', need: 'high' },
    { wowClass: 'Priest', specs: 'holy · discipline', need: 'high' },
    { wowClass: 'Shaman', specs: 'restoration', need: 'high' },
    { wowClass: 'Mage', specs: 'any', need: 'medium' },
    { wowClass: 'Druid', specs: 'restoration · feral tank', need: 'medium' },
    { wowClass: 'Warlock', specs: 'any', need: 'medium' },
    { wowClass: 'Paladin', specs: 'holy', need: 'medium' },
    { wowClass: 'Hunter', specs: 'any', need: 'closed' },
    { wowClass: 'Rogue', specs: 'any', need: 'closed' },
  ] satisfies ClassNeed[],
} as const;
