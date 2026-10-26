// Example guild for development: who is in it and what is on the calendar. Everything here is
// seeded through real commands (seed.ts), so the shapes are the commands' inputs, not records.
import type { GuildRank } from '@vintage/identity/contract';
import type { Role, WowClass } from '@vintage/wow-data';

export const FIXTURE_GUILD_ID = 'guild-fixtures';

/** Discord role ids for the example guild, one per rank, mirroring the real rank roles. */
export const ROLE_IDS: Record<Exclude<GuildRank, 'friend'>, string> = {
  officer: '300000000000000001',
  'raid-leader': '300000000000000002',
  raider: '300000000000000003',
  'flex-raider': '300000000000000004',
  recruit: '300000000000000005',
  member: '300000000000000006',
};

export interface FixtureMember {
  /** Discord display name. */
  name: string;
  /** The character's in-game name when it differs (Forever names have a last name). */
  character?: string;
  class: WowClass;
  spec: string;
  role: Role;
  rank: Exclude<GuildRank, 'friend'>;
}

/** The time zone in the signed-in fixture member's profile (who that is: persona.ts). */
export const FIXTURE_TIMEZONE = 'America/New_York';

export const MEMBERS: readonly FixtureMember[] = [
  { name: 'Stridulent', class: 'warrior', spec: 'protection', role: 'tank', rank: 'officer' },
  { name: 'Aeryn', class: 'priest', spec: 'holy', role: 'healer', rank: 'officer' },
  { name: 'Garrick', class: 'paladin', spec: 'holy', role: 'healer', rank: 'raid-leader' },
  { name: 'Morwenna', class: 'mage', spec: 'frost', role: 'ranged', rank: 'raider' },
  { name: 'Kaelthir', class: 'rogue', spec: 'combat', role: 'melee', rank: 'raider' },
  { name: 'Brannoch', class: 'warrior', spec: 'fury', role: 'melee', rank: 'raider' },
  { name: 'Ysolde', class: 'warlock', spec: 'affliction', role: 'ranged', rank: 'raider' },
  { name: 'Tamsin', class: 'hunter', spec: 'marksmanship', role: 'ranged', rank: 'raider' },
  { name: 'Nimue', class: 'priest', spec: 'shadow', role: 'ranged', rank: 'raider' },
  { name: 'Oswyn', class: 'shaman', spec: 'enhancement', role: 'melee', rank: 'raider' },
  { name: 'Fenwick', class: 'druid', spec: 'feral-tank', role: 'tank', rank: 'raider' },
  { name: 'Isolde', class: 'mage', spec: 'fire', role: 'ranged', rank: 'raider' },
  { name: 'Rhoswen', class: 'priest', spec: 'discipline', role: 'healer', rank: 'raider' },
  { name: 'Caddoc', class: 'warrior', spec: 'arms', role: 'melee', rank: 'raider' },
  { name: 'Elowen', class: 'hunter', spec: 'survival', role: 'ranged', rank: 'raider' },
  { name: 'Jorund', class: 'paladin', spec: 'protection', role: 'tank', rank: 'raider' },
  { name: 'Thessaly', class: 'shaman', spec: 'restoration', role: 'healer', rank: 'raider' },
  {
    name: 'Bloodfen',
    character: 'Bloodfen Il',
    class: 'warrior',
    spec: 'protection',
    role: 'tank',
    rank: 'flex-raider',
  },
  { name: 'Maelis', class: 'warlock', spec: 'destruction', role: 'ranged', rank: 'flex-raider' },
  { name: 'Peregrin', class: 'rogue', spec: 'subtlety', role: 'melee', rank: 'flex-raider' },
  { name: 'Sable', class: 'druid', spec: 'balance', role: 'ranged', rank: 'flex-raider' },
  { name: 'Ulfric', class: 'warrior', spec: 'fury', role: 'melee', rank: 'flex-raider' },
  { name: 'Vashti', class: 'mage', spec: 'arcane', role: 'ranged', rank: 'flex-raider' },
  { name: 'Wendeline', class: 'priest', spec: 'holy', role: 'healer', rank: 'recruit' },
  { name: 'Alaric', class: 'rogue', spec: 'assassination', role: 'melee', rank: 'recruit' },
  { name: 'Beatrix', class: 'hunter', spec: 'beast-mastery', role: 'ranged', rank: 'recruit' },
  { name: 'Corvin', class: 'warlock', spec: 'demonology', role: 'ranged', rank: 'recruit' },
  { name: 'Delphine', class: 'druid', spec: 'restoration', role: 'healer', rank: 'recruit' },
  { name: 'Eadric', class: 'paladin', spec: 'retribution', role: 'melee', rank: 'recruit' },
  { name: 'Faelan', class: 'shaman', spec: 'elemental', role: 'ranged', rank: 'recruit' },
  { name: 'Gwendolyn', class: 'mage', spec: 'frost', role: 'ranged', rank: 'member' },
  { name: 'Hadrian', class: 'warrior', spec: 'protection', role: 'tank', rank: 'member' },
  { name: 'Ingrid', class: 'priest', spec: 'shadow', role: 'ranged', rank: 'member' },
];

export interface FixtureRaid {
  name: string;
  instance: string;
  size: 10 | 20 | 40;
  /** ISO 8601 with offset; raid nights are 8 pm Eastern. */
  startsAt: string;
  /**
   * Members going (accepted) and tentative, by name. Everyone else has not answered.
   * Only recruits and above can answer (`signup-set` is a recruit command), so the
   * three `member`-rank people never appear here.
   */
  going: readonly string[];
  tentative: readonly string[];
}

const raiders = MEMBERS.filter((m) => m.rank !== 'member');

/** Discord channel ids for the example guild, for the coordinator's posts. */
export const CHANNELS = { signups: '400000000000000001', ops: '400000000000000002' } as const;

/** The example poll, created by a raid leader for raiders and up (`poll-create`). */
export const POLL = {
  createdBy: 'Garrick',
  question: 'Off-night dungeons: Sunday or Monday?',
  description: 'For attunement runs and the recruits’ Deadmines nights.',
  options: ['Sunday', 'Monday', 'Either'] as const,
  /** Who votes, and for which option (by index). The signed-in member has not voted yet. */
  votes: [
    ['Stridulent', 0],
    ['Aeryn', 0],
    ['Garrick', 1],
    ['Morwenna', 0],
    ['Kaelthir', 1],
    ['Brannoch', 0],
    ['Ysolde', 2],
    ['Tamsin', 0],
    ['Nimue', 1],
    ['Oswyn', 0],
    ['Fenwick', 0],
    ['Isolde', 1],
    ['Rhoswen', 0],
    ['Caddoc', 2],
    ['Elowen', 1],
    ['Jorund', 0],
    ['Thessaly', 0],
    ['Maelis', 1],
    ['Peregrin', 0],
    ['Sable', 1],
  ] as const satisfies readonly (readonly [string, number])[],
  /** ISO 8601; the Friday after the poll opens. */
  closesAt: '2026-10-30T23:00:00-04:00',
};

export const RAIDS: readonly FixtureRaid[] = [
  {
    name: 'Launch night',
    instance: 'Azeroth',
    size: 40,
    startsAt: '2026-11-04T20:00:00-05:00',
    going: raiders.slice(0, 26).map((m) => m.name),
    tentative: raiders.slice(26, 30).map((m) => m.name),
  },
  {
    name: 'Deadmines, two groups',
    instance: 'The Deadmines',
    size: 10,
    startsAt: '2026-11-06T20:00:00-05:00',
    going: MEMBERS.filter((m) => m.rank === 'recruit').map((m) => m.name),
    tentative: [],
  },
  {
    name: 'Barrow Deeps, first pull',
    instance: 'Barrow Deeps',
    size: 10,
    startsAt: '2026-12-09T20:00:00-05:00',
    going: MEMBERS.filter((m) => m.rank === 'raider' || m.rank === 'officer').map((m) => m.name),
    tentative: [],
  },
];
