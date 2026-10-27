// The slash commands the gateway answers. The register script sends these definitions to
// Discord, and the interaction handler routes on the same names, so they cannot drift apart.
import { type ApplicationCommand, ApplicationCommandOptionType } from '@vintage/discord-kit';

const T = ApplicationCommandOptionType;

/** `/random poll create`: Discord checks the option types and ranges; poll-create checks the rest. */
const POLL_GROUP = {
  type: T.SUB_COMMAND_GROUP,
  name: 'poll',
  description: 'Guild polls',
  options: [
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

/** The raid options both raid subcommands share, in Discord's order (required first). */
const RAID_BASICS = [
  {
    type: T.STRING,
    name: 'name',
    description: 'The raid’s name, e.g. Onyxia run',
    required: true,
    max_length: 60,
  },
  {
    type: T.STRING,
    name: 'instance',
    description: 'Where, e.g. Onyxia’s Lair',
    required: true,
    max_length: 60,
  },
  {
    type: T.INTEGER,
    name: 'size',
    description: 'Raid size',
    required: true,
    choices: [
      { name: '10', value: 10 },
      { name: '20', value: 20 },
      { name: '40', value: 40 },
    ],
  },
];

const RAID_HOURS = {
  type: T.NUMBER,
  name: 'hours',
  description: 'How long the raid runs, in hours (default 3)',
  min_value: 0.5,
  max_value: 8,
};

/**
 * `/random raid create` and `/random raid pick-night`: raid-create and raid-night-poll, run as
 * the raid leader who asked. Times are typed in the guild's clock (`2026-11-10 20:00`, or
 * `2026-11-10 8pm`) and echoed back as Discord timestamps, so mistakes show at once.
 */
const RAID_GROUP = {
  type: T.SUB_COMMAND_GROUP,
  name: 'raid',
  description: 'Raids (raid leaders and officers)',
  options: [
    {
      type: T.SUB_COMMAND,
      name: 'create',
      description: 'Make a one-off raid, open for signups',
      options: [
        ...RAID_BASICS,
        {
          type: T.STRING,
          name: 'start',
          description: 'When, in the guild’s clock: 2026-11-10 20:00 (or 8pm)',
          required: true,
          max_length: 40,
        },
        RAID_HOURS,
      ],
    },
    {
      type: T.SUB_COMMAND,
      name: 'pick-night',
      description: 'Let the raid vote on a start time; the winner becomes the raid',
      options: [
        ...RAID_BASICS,
        {
          type: T.STRING,
          name: 'times',
          description: '2–10 start times, separated by ; (2026-11-10 20:00; 2026-11-12 20:00)',
          required: true,
          max_length: 400,
        },
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
        RAID_HOURS,
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
    POLL_GROUP,
    RAID_GROUP,
    ASK,
  ],
} satisfies ApplicationCommand;

/** Subcommands and groups whose work runs in Convex; the gateway forwards them. */
export const FORWARDED_GROUPS: ReadonlySet<string> = new Set([
  POLL_GROUP.name,
  RAID_GROUP.name,
  ASK.name,
]);

export const COMMANDS: readonly ApplicationCommand[] = [RANDOM_COMMAND];
