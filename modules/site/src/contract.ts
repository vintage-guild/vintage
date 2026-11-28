// Public surface of the site module. Other modules import only this file.
//
// The site module owns the website's editable copy: the recruiting band (the headline, the
// pitch, and how much the guild needs each class and role) and the guild profile (the hero's pills and
// intro, the About page, the Discord invite, the contact address). Officers change them with
// `recruiting-set` and `guild-profile-set` from the officers' quarters, Discord, or an agent;
// everyone reads them with `recruiting-get` and `guild-profile-get`, so visitors see the same
// thing officers wrote.

import { CLASS_NAMES, ROLES, type Role, type WowClass } from '@vintage/wow-data';

/** How much the guild wants a class, most to least. `closed` still shows, as "not now". */
export const NEED_LEVELS = ['high', 'medium', 'low', 'closed'] as const;
export type NeedLevel = (typeof NEED_LEVELS)[number];

/** The raid role a line recruits for; `any` when the class is wanted in whatever it plays. */
export const NEED_ROLES = ['any', ...ROLES] as const;
export type NeedRole = Role | 'any';

/** One row of the recruiting band: a class, the role it's wanted for, and how much. */
export interface ClassNeed {
  wowClass: WowClass;
  /** A role the class can play, or `any`. Lines saved before roles existed read as `any`. */
  role: NeedRole;
  /**
   * The line's special notes, shown under "Special notes": free text such as "restoration" or
   * "can also off-tank", or empty. Named `specs` from when it only held specs; lines saved then
   * may say "any", which reads as no note (`needNote`).
   */
  specs: string;
  need: NeedLevel;
}

/** Limits `recruiting-set` enforces, here so every surface can show them. */
export const RECRUITING_LIMITS = {
  headline: 120,
  /** Room for the guiding principles in full, with a paragraph or two around them. */
  pitch: 2000,
  /** A line's special notes. */
  specs: 100,
  /** One line per class and role at most: each class's roles plus `any`. */
  needs: CLASS_NAMES.length * NEED_ROLES.length,
} as const;

/** A line's special note as shown: empty for none, and for "any", the old placeholder. */
export function needNote(specs: string | undefined | null): string {
  const note = (specs ?? '').trim();
  return note.toLowerCase() === 'any' ? '' : note;
}

/** High, medium, low, closed: the order the band lists needs in. */
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
   * High first, then medium, low, and closed, whatever order they were saved in; within a
   * level, the order officers gave. One row per class and role at most.
   */
  needs: ClassNeed[];
  /**
   * Epoch ms of the last `recruiting-set`, or null while the band shows the starter text. Who
   * saved it is stored but not answered: this view is public.
   */
  updatedAt: number | null;
}

/**
 * The guild's guiding principles, in the GM's words. Shown wherever the site lists them, word for
 * word: never reworded (TJ, 2026-11-27).
 */
export const GUIDING_PRINCIPLES: readonly { name: string; text: string }[] = [
  {
    name: 'Show up.',
    text: "If you're on the raid roster, we built the night around you being there. Can't make it? Say so ahead of time.",
  },
  {
    name: 'Know your shit.',
    text: 'Rotation, cooldowns, your own buttons — sort that out before raid. The group is counting on your contributions, not carrying you.',
  },
  {
    name: "Don't be an asshole.",
    text: "Wipes happen, loot's going to piss someone off eventually, nobody needs to be a dick about either one.",
  },
  {
    name: 'Say something.',
    text: "Have a bad pull, bad rotation, you're burnt out, whatever — tell an officer. We'd rather hear it than watch you quietly check out.",
  },
  {
    name: 'Time is precious.',
    text: "We've got jobs. Some of us have kids. Plan and play in a way that's conscious of others' time.",
  },
  {
    name: 'Have fun.',
    text: "Don't let this game become another job. Laugh, share victories, kick some ass.",
  },
];

/** The principles as a markdown list, each name in bold. */
export const GUIDING_PRINCIPLES_MARKDOWN = GUIDING_PRINCIPLES.map(
  (p) => `- **${p.name}** ${p.text}`,
).join('\n');

/**
 * What the band says until an officer saves it: the copy the website shipped with before this
 * module existed, so the first deploy shows no change.
 */
export const STARTER_RECRUITING: Recruiting = {
  headline: 'Show up, know your class, kill bosses.',
  pitch: [
    'We go back to Vanilla, and we still play like it. What we want now is an efficient use of ' +
      'game time that clears all the content on an expeditious timeline, while we actually enjoy ' +
      'the community and the game along the way.',
    "We're taking like-minded players of any class. The table shows where we need people most.",
    '## Guiding principles',
    GUIDING_PRINCIPLES_MARKDOWN,
    'Apply here, or ask an officer in Discord. Just here to hang out? Join the Discord and say hi.',
  ].join('\n\n'),
  needs: [
    { wowClass: 'warrior', role: 'tank', specs: 'protection', need: 'high' },
    { wowClass: 'priest', role: 'healer', specs: 'holy · discipline', need: 'high' },
    { wowClass: 'shaman', role: 'healer', specs: 'restoration', need: 'high' },
    { wowClass: 'mage', role: 'ranged', specs: '', need: 'medium' },
    { wowClass: 'druid', role: 'healer', specs: 'restoration', need: 'medium' },
    { wowClass: 'druid', role: 'tank', specs: 'feral', need: 'medium' },
    { wowClass: 'warlock', role: 'ranged', specs: '', need: 'medium' },
    { wowClass: 'paladin', role: 'healer', specs: 'holy', need: 'medium' },
    { wowClass: 'hunter', role: 'ranged', specs: '', need: 'closed' },
    { wowClass: 'rogue', role: 'melee', specs: '', need: 'closed' },
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
  /** Short facts under the hero for visitors: ruleset, raid nights, style. */
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
  pills: ['Normal ruleset', 'Mon + Wed · 8–11 pm CT', 'Semi-hardcore', 'Raiding since Vanilla'],
  intro:
    'We raid two nights a week, clear all the content on a good timeline, and keep the game ' +
    'from becoming another job. Raids open December 9.',
  aboutLead:
    'We go back to Vanilla. Somewhere in there we ran a Retail guild that cleared Cutting Edge ' +
    'every season from TBC through Shadowlands, and a Classic guild that speedran competitively ' +
    'from launch into Wrath.',
  aboutSections: [
    {
      heading: 'Who we are',
      body:
        "We still have the wrinkles in our brains to play like that. We just ain't about the " +
        'time investment required for that life anymore.\n\nWhat we want now is an efficient use ' +
        'of game time that clears all the content on an expeditious timeline, while we actually ' +
        'enjoy the community and the game along the way.',
    },
    { heading: 'Guiding principles', body: GUIDING_PRINCIPLES_MARKDOWN },
    {
      heading: 'Raiding',
      body:
        "Monday and Wednesday, 8 to 11 pm Central. Barrow Deeps, Hyjal Summit, and Onyxia's Lair " +
        'open December 9.\n\nTarget is 20 core raiders. We build from there as the right people ' +
        'show up.\n\nIf we ever run more than one raid team, every team is the guild. Nobody gets ' +
        "priority because they're progressing faster, and nobody gets treated like the backup " +
        "squad because they're newer or smaller.",
    },
    {
      heading: 'Joining',
      body:
        'Raiders and flex raiders apply on this site. New raiders start as Recruits. Same ' +
        "expectations as Raider, we just haven't seen enough of you yet. A couple weeks, not a " +
        'hazing ritual.\n\nHere for the guild and not the raid team? Join the Discord and hang ' +
        'out. No raid obligation, no pressure.',
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
