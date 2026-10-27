// The hand-written half of Random's help (#155): one topic per area, the guild command each
// `/random` subcommand runs (its tier decides who sees it), and two or three examples. The rest
// of each page (descriptions, options, choices, ranges) comes from RANDOM_COMMAND, so it can't
// drift; tests/help.test.ts fails when a forwarded subcommand has no topic or an example no longer
// parses against the definitions.

export interface HelpTopic {
  /** The `topic` choice on `/random help` (apps/gateway/src/commands.ts). */
  key: string;
  title: string;
  /** One line for the overview. */
  summary: string;
  /** The `/random` subcommand group whose `help` subcommand opens this page. */
  group?: string;
  /**
   * The slash subcommands this topic covers, by path (`poll create`, `ask`), and the guild
   * command each one runs.
   */
  runs: Readonly<Record<string, string>>;
  /** Things done with buttons, not slash commands, and the guild command each one runs. */
  buttons?: readonly { text: string; label: string; command: string }[];
  /** `/random …` examples are checked against the definitions; anything else is shown as is. */
  examples: readonly string[];
  /** A page on the website (VINTAGE_SITE_URL) about the same thing. */
  sitePath?: string;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    key: 'events',
    title: 'Events',
    summary: 'Raids and runs the guild signs up for; see Signups for joining one.',
    group: 'raid',
    runs: { 'raid create': 'raid-create', 'raid pick-night': 'raid-night-poll' },
    examples: [
      '/random raid create name:Onyxia run instance:Onyxia’s Lair size:40 start:2026-11-10 8pm',
      '/random raid create name:Molten Core instance:Molten Core size:40 start:2026-11-12 20:00 hours:4',
      '/random raid pick-night name:Zul’Gurub instance:Zul’Gurub size:20 times:2026-11-10 20:00; 2026-11-12 20:00',
    ],
  },
  {
    key: 'signups',
    title: 'Signups',
    summary: 'Sign up for an event from its card in the signup channel.',
    runs: {},
    buttons: [
      {
        text: 'Press **Accept**, **Late**, **Tentative**, **Standby**, or **Decline** on an event’s card. Random asks which character when you have more than one, and you can add a note.',
        label: 'sign up with the buttons on event cards',
        command: 'signup-set',
      },
    ],
    examples: [
      'Press **Accept** on the Onyxia card, then pick your healer.',
      'Changed your mind? Press **Decline** on the same card.',
    ],
  },
  {
    key: 'polls',
    title: 'Polls',
    summary: 'Guild questions with buttons to vote; ranked polls are voted on the website.',
    group: 'poll',
    runs: { 'poll create': 'poll-create' },
    examples: [
      '/random poll create question:Which night for the next MC? options:Tuesday; Thursday; Friday',
      '/random poll create question:Which raids this phase? options:MC; Onyxia; BWL method:multi max_choices:2 hours:48',
      '/random poll create question:Rank the next tier options:BWL; ZG; AQ20 method:ranked',
    ],
    sitePath: '/polls',
  },
  {
    key: 'ask',
    title: 'Ask Random',
    summary: 'Ask in plain words; Random answers privately from the guild’s own data.',
    runs: { ask: 'agent-ask' },
    examples: [
      '/random ask question:When is the next raid?',
      '/random ask question:Sign me up for Thursday on my priest',
      '/random ask question:How do I make a dungeon run?',
    ],
  },
  {
    key: 'recruiting',
    title: 'Recruiting',
    summary: 'Who the guild needs, and how to apply.',
    runs: { apply: 'application-submit', recruiting: 'recruiting-get' },
    examples: [
      '/random recruiting',
      '/random apply character:Aeryn class:priest spec:holy',
      '/random apply character:Thorg class:warrior spec:protection role:flex-raider',
    ],
    sitePath: '/apply',
  },
];
