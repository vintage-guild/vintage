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
    ASK,
    APPLY,
    RECRUITING,
  ],
} satisfies ApplicationCommand;

/** Subcommands and groups whose work runs in Convex; the gateway forwards them. */
export const FORWARDED_GROUPS: ReadonlySet<string> = new Set([
  POLL_GROUP.name,
  ASK.name,
  APPLY.name,
  RECRUITING.name,
]);

export const COMMANDS: readonly ApplicationCommand[] = [RANDOM_COMMAND];
