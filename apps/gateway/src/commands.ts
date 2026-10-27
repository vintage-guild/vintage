// The slash commands the gateway answers. The register script sends these definitions to
// Discord, and the interaction handler routes on the same names, so they cannot drift apart.
// apps/api imports this file too (`@vintage/gateway/commands`) to build Random's help pages in
// Convex, so it stays pure data: discord-kit only, no Node or Vercel imports.
import { type ApplicationCommand, ApplicationCommandOptionType } from '@vintage/discord-kit';

const T = ApplicationCommandOptionType;

/**
 * `/random <group> help`: that group's help page. Convex renders it for the reader's rank from
 * these same definitions (apps/api/src/help.ts).
 */
const GROUP_HELP = {
  type: T.SUB_COMMAND,
  name: 'help',
  description: 'How these commands work, for your rank',
} as const;

/** `/random poll create`: Discord checks the option types and ranges; poll-create checks the rest. */
const POLL_GROUP = {
  type: T.SUB_COMMAND_GROUP,
  name: 'poll',
  description: 'Guild polls',
  options: [
    GROUP_HELP,
    {
      type: T.SUB_COMMAND,
      name: 'create',
      description: 'Post a poll in this channel',
      options: [
        {
          type: T.STRING,
          name: 'question',
          description: 'What are you asking?',
          required: true,
          max_length: 300,
        },
        {
          type: T.STRING,
          name: 'options',
          description: '2–25 answers, separated by ; (e.g. Tuesday; Thursday; Friday)',
          required: true,
          max_length: 1000,
        },
        {
          type: T.INTEGER,
          name: 'hours',
          description: 'How long it stays open (default 24)',
          min_value: 1,
          max_value: 768,
        },
        {
          type: T.STRING,
          name: 'method',
          description: 'How people answer (default: pick one)',
          choices: [
            { name: 'Pick one', value: 'single' },
            { name: 'Pick any', value: 'multi' },
            { name: 'Rank them (on the website)', value: 'ranked' },
          ],
        },
        {
          type: T.INTEGER,
          name: 'max_choices',
          description: 'Pick any: the most options one person may pick',
          min_value: 1,
          max_value: 25,
        },
        {
          type: T.STRING,
          name: 'audience',
          description: 'Who may vote (default: raiders and up)',
          choices: [
            { name: 'Raiders and up', value: 'raider' },
            { name: 'Recruits and up (raid leaders)', value: 'recruit' },
            { name: 'Members and up (raid leaders)', value: 'member' },
            { name: 'Raid leaders and officers', value: 'leader' },
            { name: 'Officers', value: 'officer' },
          ],
        },
        {
          type: T.BOOLEAN,
          name: 'anonymous',
          description: 'Hide who voted for what, from everyone',
        },
        {
          type: T.STRING,
          name: 'results',
          description: 'When results show (default: live)',
          choices: [
            { name: 'Live', value: 'live' },
            { name: 'When it closes', value: 'after-close' },
            { name: 'Officers only', value: 'officers' },
          ],
        },
      ],
    },
  ],
};

/** The options both event subcommands require, in Discord's order (required first). */
const EVENT_BASICS = [
  {
    type: T.STRING,
    name: 'name',
    description: 'The event’s name, e.g. Onyxia run or Cathedral run',
    required: true,
    max_length: 60,
  },
  {
    type: T.STRING,
    name: 'instance',
    description: 'Where, e.g. Onyxia’s Lair or Scarlet Monastery',
    required: true,
    max_length: 60,
  },
  {
    // Not a fixed choice any more: the command checks it per kind (raid 10/20/40, dungeon 5,
    // battleground 10/15/40, other 1–40) and says which sizes fit.
    type: T.INTEGER,
    name: 'size',
    description: 'Players: raid 10/20/40, dungeon 5, battleground 10/15/40, other 1–40',
    required: true,
    min_value: 1,
    max_value: 40,
  },
];

/** The optional options both event subcommands share: what kind, and the role counts. */
const EVENT_EXTRAS = [
  {
    type: T.STRING,
    name: 'kind',
    description: 'What kind of event (default raid)',
    choices: [
      { name: 'Raid', value: 'raid' },
      { name: 'Dungeon', value: 'dungeon' },
      { name: 'Battleground', value: 'battleground' },
      { name: 'Other', value: 'other' },
    ],
  },
  ...(['tanks', 'healers', 'dps'] as const).map((name) => ({
    type: T.INTEGER,
    name,
    description: `How many ${name === 'dps' ? 'DPS' : name} (default: the kind’s usual comp)`,
    min_value: 0,
    max_value: 40,
  })),
  {
    type: T.NUMBER,
    name: 'hours',
    description: 'How long it runs, in hours (default 3)',
    min_value: 0.5,
    max_value: 8,
  },
];

/**
 * `/random event create` and `/random event pick-night` (#151; `/random raid` until then):
 * raid-create and raid-night-poll, run as the raid leader who asked, for a raid, dungeon,
 * battleground, or other event. Times are typed in the guild's clock (`2026-11-10 20:00`, or
 * `2026-11-10 8pm`) and echoed back as Discord timestamps, so mistakes show at once.
 */
const EVENT_GROUP = {
  type: T.SUB_COMMAND_GROUP,
  name: 'event',
  description: 'Raids, dungeons, battlegrounds, and other events (raid leaders and officers)',
  options: [
    GROUP_HELP,
    {
      type: T.SUB_COMMAND,
      name: 'create',
      description: 'Make a one-off event, open for signups',
      options: [
        ...EVENT_BASICS,
        {
          type: T.STRING,
          name: 'start',
          description: 'When, in the guild’s clock: 2026-11-10 20:00 (or 8pm)',
          required: true,
          max_length: 40,
        },
        ...EVENT_EXTRAS,
      ],
    },
    {
      type: T.SUB_COMMAND,
      name: 'pick-night',
      description: 'Let people vote on a start time; the winner becomes the event',
      options: [
        ...EVENT_BASICS,
        {
          type: T.STRING,
          name: 'times',
          description: '2–10 start times, separated by ; (2026-11-10 20:00; 2026-11-12 20:00)',
          required: true,
          max_length: 400,
        },
        ...EVENT_EXTRAS,
        {
          type: T.INTEGER,
          name: 'vote_hours',
          description: 'How long voting stays open (default 24)',
          min_value: 1,
          max_value: 168,
        },
        {
          type: T.INTEGER,
          name: 'quorum',
          description: 'Fewest ballots for the result to count',
          min_value: 1,
          max_value: 40,
        },
      ],
    },
  ],
};

/** `/random ask`: a question for the guild agent (#18); the answer arrives privately. */
const ASK = {
  type: T.SUB_COMMAND,
  name: 'ask',
  description: 'Ask Random about raids, signups, the roster, polls, or recruiting',
  options: [
    {
      type: T.STRING,
      name: 'question',
      description: 'Your question, in plain words',
      required: true,
      max_length: 2000,
    },
  ],
};

/** `/random apply`: the short answers here, the long ones in a modal (#135). */
const APPLY = {
  type: T.SUB_COMMAND,
  name: 'apply',
  description: 'Apply to raid with Vintage',
  options: [
    {
      type: T.STRING,
      name: 'character',
      description: 'Your character name',
      required: true,
      max_length: 12,
    },
    {
      type: T.STRING,
      name: 'class',
      description: 'Your class',
      required: true,
      choices: [
        'warrior',
        'paladin',
        'hunter',
        'rogue',
        'priest',
        'shaman',
        'mage',
        'warlock',
        'druid',
      ].map((c) => ({ name: c.charAt(0).toUpperCase() + c.slice(1), value: c })),
    },
    {
      type: T.STRING,
      name: 'spec',
      description: 'Your spec, e.g. restoration',
      required: true,
      max_length: 40,
    },
    {
      type: T.STRING,
      name: 'role',
      description: 'Core raider, or flex when there is room',
      choices: [
        { name: 'Raider', value: 'raider' },
        { name: 'Flex raider', value: 'flex-raider' },
      ],
    },
  ],
};

/** `/random recruiting`: the open needs; leaders and officers post it to the channel. */
const RECRUITING = {
  type: T.SUB_COMMAND,
  name: 'recruiting',
  description: 'Show who Vintage is recruiting',
};

/**
 * `/random help`: what Random does, for the reader's rank, or one topic's page. The topic values
 * match HELP_TOPICS in apps/api/src/help-topics.ts; a test there checks they stay the same.
 */
const HELP = {
  type: T.SUB_COMMAND,
  name: 'help',
  description: 'What Random can do for you, and how',
  options: [
    {
      type: T.STRING,
      name: 'topic',
      description: 'One topic in detail',
      choices: [
        { name: 'Events', value: 'events' },
        { name: 'Signups', value: 'signups' },
        { name: 'Polls', value: 'polls' },
        { name: 'Ask Random', value: 'ask' },
        { name: 'Recruiting', value: 'recruiting' },
      ],
    },
  ],
};

export const RANDOM_COMMAND = {
  name: 'random',
  description: 'Vintage guild tools',
  contexts: [0],
  options: [
    {
      type: T.SUB_COMMAND,
      name: 'ping',
      description: 'Check that Random is answering',
    },
    HELP,
    POLL_GROUP,
    EVENT_GROUP,
    ASK,
    APPLY,
    RECRUITING,
  ],
} satisfies ApplicationCommand;

/** Subcommands and groups whose work runs in Convex; the gateway forwards them. */
export const FORWARDED_GROUPS: ReadonlySet<string> = new Set([
  HELP.name,
  POLL_GROUP.name,
  EVENT_GROUP.name,
  ASK.name,
  APPLY.name,
  RECRUITING.name,
]);

export const COMMANDS: readonly ApplicationCommand[] = [RANDOM_COMMAND];
