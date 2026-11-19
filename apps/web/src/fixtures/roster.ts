// The guild roster in development: what one `armory-guild-roster-record` call would bring back
// from Blizzard's guild roster and the armory, built from the example guild plus a few in-game
// characters who never joined the site. Seeded through the real command (seed.ts).
import type { RosterFetchResult, RosterMember } from '@vintage/armory/contract';
import { titleCase } from '@vintage/ui-kit';
import type { WowClass } from '@vintage/wow-data';
import { type FixtureMember, MEMBERS } from './data';

/**
 * The guild's in-game rank index for each site rank (the game has no raid-leader rank; they
 * are officers). 0 is the Guild Master (Stridulent here); 3 is Officer Alt.
 */
const RANK_INDEX: Record<FixtureMember['rank'], number> = {
  officer: 2,
  'raid-leader': 2,
  raider: 4,
  'flex-raider': 5,
  member: 6,
  recruit: 7,
};

const SURNAMES = [
  'Arcos',
  'Ashvale',
  'Blackmoor',
  'Crowe',
  'Dunmere',
  'Emberly',
  'Fairwind',
  'Greymane',
  'Hollow',
  'Ironwood',
  'Kestrel',
  'Lornwick',
  'Marsh',
  'Northcott',
  'Oakheart',
  'Pyre',
];

const RACES: Record<WowClass, string> = {
  warrior: 'Orc',
  paladin: 'Human',
  hunter: 'Night Elf',
  rogue: 'Undead',
  priest: 'Dwarf',
  shaman: 'Tauren',
  mage: 'Gnome',
  warlock: 'Undead',
  druid: 'Night Elf',
};

/** Primary pairs people actually run, by class. */
const PRIMARIES: Record<WowClass, [string, string][]> = {
  warrior: [
    ['Mining', 'Blacksmithing'],
    ['Mining', 'Engineering'],
  ],
  paladin: [
    ['Mining', 'Blacksmithing'],
    ['Herbalism', 'Alchemy'],
  ],
  hunter: [
    ['Skinning', 'Leatherworking'],
    ['Mining', 'Engineering'],
  ],
  rogue: [
    ['Skinning', 'Leatherworking'],
    ['Mining', 'Engineering'],
  ],
  priest: [
    ['Tailoring', 'Enchanting'],
    ['Herbalism', 'Alchemy'],
  ],
  shaman: [
    ['Skinning', 'Leatherworking'],
    ['Herbalism', 'Alchemy'],
  ],
  mage: [
    ['Tailoring', 'Enchanting'],
    ['Herbalism', 'Alchemy'],
  ],
  warlock: [
    ['Tailoring', 'Enchanting'],
    ['Tailoring', 'Engineering'],
  ],
  druid: [
    ['Herbalism', 'Alchemy'],
    ['Skinning', 'Leatherworking'],
  ],
};

const SECONDARIES = ['First Aid', 'Cooking', 'Fishing'];

/** A stable small number from a name, so the example roster is the same every load. */
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

const slugOf = (name: string, surname: string) => `${name}-${surname}`.toLowerCase();

const profileUrl = (slug: string) =>
  `https://worldofwarcraft.blizzard.com/en-us/forever/us/armory/character/${slug}`;

interface Character {
  name: string;
  surname: string;
  class: WowClass;
  spec: string;
  rank: number;
  level: number;
}

/** In-game only: alts and a new invite who haven't signed in to the site. */
const IN_GAME_ONLY: Character[] = [
  { name: 'Aerwyn', surname: 'Marsh', class: 'druid', spec: 'restoration', rank: 3, level: 60 },
  { name: 'Stridalt', surname: 'Crowe', class: 'hunter', spec: 'marksmanship', rank: 3, level: 44 },
  { name: 'Grimtusk', surname: 'Ashvale', class: 'warrior', spec: 'arms', rank: 6, level: 38 },
  { name: 'Lornn', surname: 'Arcos', class: 'priest', spec: 'holy', rank: 6, level: 60 },
  { name: 'Quill', surname: 'Pyre', class: 'mage', spec: 'fire', rank: 7, level: 17 },
];

/** The surname a site member's character has in game (their registered one, if any). */
export function fixtureSurname(m: FixtureMember): string {
  const last = (m.character ?? m.name).split(' ')[1];
  return last ?? SURNAMES[hash(m.name) % SURNAMES.length] ?? 'Arcos';
}

function characters(): Character[] {
  const fromSite = MEMBERS.map((m) => {
    const first = (m.character ?? m.name).split(' ')[0];
    const h = hash(m.name);
    const lowLevel = m.rank === 'recruit' || m.rank === 'member';
    return {
      name: first ?? m.name,
      surname: fixtureSurname(m),
      class: m.class,
      spec: m.spec,
      rank: m.name === 'Stridulent' ? 0 : RANK_INDEX[m.rank],
      level: lowLevel && h % 3 === 0 ? 50 + (h % 10) : 60,
    };
  });
  return [...fromSite, ...IN_GAME_ONLY];
}

function enrichment(c: Character): RosterFetchResult {
  const h = hash(c.name);
  const pair = PRIMARIES[c.class][h % 2] ?? PRIMARIES[c.class][0] ?? ['Herbalism', 'Alchemy'];
  const cap = c.level >= 60 ? 300 : Math.min(300, c.level * 5);
  const skill = (offset: number) => Math.max(1, cap - ((h >>> offset) % 4) * 15);
  return {
    status: 'found',
    className: titleCase(c.class),
    raceName: RACES[c.class],
    activeSpec: titleCase(c.spec.replace('feral-tank', 'feral').replaceAll('-', ' ')),
    professions: [
      { name: pair[0], level: skill(2), maxLevel: 300 },
      { name: pair[1], level: skill(4), maxLevel: 300 },
      ...SECONDARIES.filter((_, i) => (h >>> (6 + i)) % 2 === 0).map((name, i) => ({
        name,
        level: skill(8 + i),
        maxLevel: 300,
      })),
    ],
    // No portraits in development: nothing leaves the machine, and the page shows the class.
    avatarUrl: null,
    profileUrl: profileUrl(slugOf(c.name, c.surname)),
  };
}

/** One sync's input: everyone in the guild, everyone enriched but one pending and one error. */
export function fixtureRosterSync(): {
  members: RosterMember[];
  enriched: { slug: string; result: RosterFetchResult }[];
} {
  const all = characters();
  const members = all.map((c, i) => ({
    blizzardId: 700000 + i,
    name: c.name,
    surname: c.surname,
    slug: slugOf(c.name, c.surname),
    level: c.level,
    guildRank: c.rank,
  }));
  const enriched = all.flatMap((c) => {
    const slug = slugOf(c.name, c.surname);
    if (c.name === 'Quill') return []; // Just invited: not enriched yet.
    if (c.name === 'Grimtusk') {
      return [{ slug, result: { status: 'error' as const, error: 'Not in the armory yet' } }];
    }
    return [{ slug, result: enrichment(c) }];
  });
  return { members, enriched };
}
