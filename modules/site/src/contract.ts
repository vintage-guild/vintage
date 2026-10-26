// Public surface of the site module. Other modules import only this file.
//
// The site module owns the website's editable copy: the recruiting band (the headline, the
// pitch, and how much the guild needs each class) and the guild profile (the hero's pills and
// intro, the About page, the Discord invite, the contact address). Officers change them with
// `recruiting-set` and `guild-profile-set` from the officers' quarters, Discord, or an agent;
// everyone reads them with `recruiting-get` and `guild-profile-get`, so visitors see the same
// thing officers wrote.

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

/** High, medium, closed: the order the band lists needs in. */
export function byNeed<T extends { need: NeedLevel }>(needs: readonly T[]): T[] {
  const rank = (n: NeedLevel) => NEED_LEVELS.indexOf(n);
  return needs
    .map((n, i) => ({ n, i }))
    .sort((a, b) => rank(a.n.need) - rank(b.n.need) || a.i - b.i)
    .map(({ n }) => n);
}

/** What `recruiting-get` answers. */
export interface Recruiting {
  headline: string;
  pitch: string;
  /**
   * High first, then medium, then closed, whatever order they were saved in; within a level,
   * the order officers gave. One row per class at most.
   */
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

/** One titled part of the About page. Paragraphs are separated by a blank line. */
export interface AboutSection {
  heading: string;
  body: string;
}

/** Limits `guild-profile-set` enforces, here so every surface can show them. */
export const PROFILE_LIMITS = {
  pills: 6,
  pill: 32,
  intro: 400,
  aboutLead: 300,
  aboutSections: 6,
  heading: 60,
  body: 1500,
} as const;

/** A Discord invite: `https://discord.gg/<code>` or `https://discord.com/invite/<code>`. */
export const DISCORD_INVITE_PATTERN =
  /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/;

/** What `guild-profile-get` answers: the guild's own words on the public pages. */
export interface GuildProfile {
  /** Short facts under the hero for visitors: ruleset, raid nights, sizes, style. */
  pills: string[];
  /** The hero's paragraph for everyone. */
  intro: string;
  /** The About page's opening line. */
  aboutLead: string;
  aboutSections: AboutSection[];
  /** The public Discord invite, or null: "Join the Discord" then points at recruiting. */
  discordInvite: string | null;
  /** Where to write about privacy or the terms, or null: the legal pages say to ask in Discord. */
  contactEmail: string | null;
  /** Epoch ms of the last `guild-profile-set`, or null while it shows the starter text. */
  updatedAt: number | null;
}

/**
 * What the site says until an officer saves the profile: the hero copy the site shipped with,
 * and an About page in the guild's own terms (who we are, how we raid, how to join).
 */
export const STARTER_PROFILE: GuildProfile = {
  pills: ['Normal ruleset', 'Wed + Thu · 8 pm ET', '10 · 20 · 40', 'Semi-hardcore'],
  intro:
    "We're building a raid team for Forever's first tier: people who show up prepared, on time, " +
    'and good company. Signups, reminders, and loot rules are settled before the first pull, so ' +
    'raid night is just the raid. Raids open December 9.',
  aboutLead:
    'A raiding guild on WoW: Forever, made of people who have raided together since Vanilla, ' +
    'The Burning Crusade, and Wrath.',
  aboutSections: [
    {
      heading: 'Who we are',
      body:
        'Many of us have cleared content together across Vanilla, TBC, and Wrath, and a lot of ' +
        'us were ahead of the curve, with server firsts along the way. Forever is a fresh start, ' +
        'and we mean to be ready for it.',
    },
    {
      heading: 'Raiding',
      body:
        "WoW: Forever launches on November 4. Barrow Deeps, Hyjal Summit, and Onyxia's Lair " +
        'unlock on December 9.\n\nWe raid semi-hardcore: come prepared, be on time, be kind. ' +
        'Signups, reminders, and the final roster run through Discord and this site, so raid ' +
        'night is just the raid.',
    },
    {
      heading: 'Joining',
      body:
        'Ask an officer for an invite to our Discord. New members start as recruits for about ' +
        "two weeks, and Discord ranks are guild ranks here, so there's nothing to manage twice. " +
        "Once you're in, sign in with Discord to add your characters.",
    },
  ],
  discordInvite: null,
  contactEmail: null,
  updatedAt: null,
};

export const SITE_COMMANDS = [
  'recruiting-get',
  'recruiting-set',
  'guild-profile-get',
  'guild-profile-set',
] as const;
export type SiteCommandName = (typeof SITE_COMMANDS)[number];
