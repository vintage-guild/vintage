// The hand-written half of Random's help (#155): one topic per area, the guild command each
// `/vintage` subcommand runs (its tier decides who sees it), and two or three examples. The rest
// of each page (descriptions, options, choices, ranges) comes from RANDOM_COMMAND, so it can't
// drift; tests/help.test.ts fails when a forwarded subcommand has no topic or an example no longer
// parses against the definitions.

export interface HelpTopic {
  /** The `topic` choice on `/vintage help` (apps/gateway/src/commands.ts). */
  key: string;
  title: string;
  /** One line for the overview. */
  summary: string;
  /** The `/vintage` subcommand group whose `help` subcommand opens this page. */
  group?: string;
  /**
   * The slash subcommands this topic covers, by path (`poll create`, `ask`), and the guild
   * command each one runs.
   */
  runs: Readonly<Record<string, string>>;
  /** Things done with buttons, not slash commands, and the guild command each one runs. */
  buttons?: readonly { text: string; label: string; command: string }[];
  /** `/vintage …` examples are checked against the definitions; anything else is shown as is. */
  examples: readonly string[];
  /** A page on the website (VINTAGE_SITE_URL) about the same thing. */
  sitePath?: string;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    key: 'events',
    title: 'Events',
    summary:
      'Raids, dungeons, battlegrounds, and other events the guild signs up for; see Signups for joining one.',
    group: 'event',
    runs: { 'event create': 'raid-create', 'event pick-night': 'raid-night-poll' },
    examples: [
      '/vintage event create',
      'The form picks a date in the next 25 days; type `start:` for any date, further ahead too.',
      '/vintage event create name:Molten Core instance:Molten Core size:40 start:2026-11-12 20:00 hours:4',
      '/vintage event pick-night name:Zul’Gurub instance:Zul’Gurub size:20 times:2026-11-10 20:00; 2026-11-12 20:00',
    ],
  },
  {
    key: 'exports',
    title: 'Raid exports',
    summary:
      'Check what the Vintage addon recorded on a raid night (who was there, the loot) before it is saved.',
    runs: { 'event check-export': 'raid-export-check' },
    examples: [
      'After the raid, copy the addon’s export string (it starts with !VIN:) once its Export tab lands.',
      '/vintage event check-export export:!VIN:1!9b5ZQnvq',
      'Add `event:` and pick the raid from its suggestions when the export doesn’t name one.',
    ],
    sitePath: '/officers',
  },
  {
    key: 'signups',
    title: 'Signups',
    summary: 'Sign up for an event from its card in the signup channel.',
    runs: {},
    buttons: [
      {
        text: 'Press **Accept**, **Late**, **Tentative**, **Standby**, or **Absent** on an event’s card. Random signs you up with your main (or, with no main, the character you usually bring) and says why; **Switch character**, **Change spec**, **Role**, and **Can also play** in its reply change it for that event only, and **New character…** adds one and signs up with it. Late picks 5, 15, or 30 minutes; Tentative asks for a reason.',
        label: 'sign up with the buttons on event cards',
        command: 'signup-set',
      },
    ],
    examples: [
      'Press **Accept** on the Onyxia card, then pick your healer.',
      'Changed your mind? Press **Absent** on the same card.',
    ],
  },
  {
    key: 'absences',
    title: 'Absences',
    summary: 'Mark yourself absent for a stretch of days or set weekly absent/late raid nights.',
    group: 'absence',
    runs: {
      'absence add': 'absence-add',
      'absence weekly': 'absence-weekly-set',
      'absence list': 'absence-list',
      'absence remove': 'absence-remove',
    },
    examples: [
      '/vintage absence add from:2026-12-03 to:2026-12-07 reason:work trip',
      '/vintage absence weekly',
      '/vintage absence list',
      '/vintage absence remove absence:abs-1',
    ],
    sitePath: '/profile',
  },
  {
    key: 'characters',
    title: 'Characters',
    summary:
      'Your mains and alts: signups use your main unless you pick another. Specs and names are suggested as you type.',
    group: 'character',
    runs: {
      'character add': 'character-add',
      'character list': 'character-list',
      'character main': 'character-update',
      'character remove': 'character-remove',
    },
    examples: [
      '/vintage character add name:Thorg class:warrior spec:fury role:tank',
      '/vintage character list',
      '/vintage character main name:Thorg',
      '/vintage character remove name:Aeryn',
    ],
    sitePath: '/characters',
  },
  {
    key: 'polls',
    title: 'Polls',
    summary: 'Guild questions with buttons to vote; ranked polls are voted on the website.',
    group: 'poll',
    runs: { 'poll create': 'poll-create' },
    examples: [
      '/vintage poll create question:Which night for the next MC? options:Tuesday; Thursday; Friday',
      '/vintage poll create question:Which raids this phase? options:MC; Onyxia; BWL method:multi max_choices:2 hours:48',
      '/vintage poll create question:Rank the next tier options:BWL; ZG; AQ20 method:ranked',
    ],
    sitePath: '/polls',
  },
  {
    key: 'ask',
    title: 'Ask Random',
    summary: 'Ask in plain words; Random answers privately from the guild’s own data.',
    runs: { ask: 'agent-ask' },
    examples: [
      '/vintage ask question:When is the next raid?',
      '/vintage ask question:Sign me up for Thursday on my priest',
      '/vintage ask question:How do I make a dungeon run?',
    ],
  },
  {
    key: 'recruiting',
    title: 'Recruiting',
    summary: 'Who the guild needs, and how to apply: the post has Apply buttons.',
    runs: { apply: 'application-submit', recruiting: 'recruiting-get' },
    examples: [
      '/vintage recruiting',
      '/vintage apply character:Aeryn class:priest spec:holy',
      '/vintage apply character:Thorg class:warrior spec:protection role:flex-raider',
    ],
    sitePath: '/apply',
  },
];
