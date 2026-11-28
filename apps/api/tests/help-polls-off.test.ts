// Polls are off (@vintage/features): no poll command is registered, help doesn't mention them,
// and buttons on polls already posted say they're off. The other poll tests mock the flag on.
import {
  type Interaction,
  InteractionType,
  ApplicationCommandOptionType as T,
} from '@vintage/discord-kit';
import { featureOn } from '@vintage/features';
import { RANDOM_COMMAND } from '@vintage/gateway/commands';
import { describe, expect, it } from 'vitest';
import { handleEventInteraction, PICK_NIGHT_OFF } from '../src/discord-events';
import { handlePollInteraction, POLLS_OFF } from '../src/discord-polls';
import { parseExample, renderHelp } from '../src/help';
import { ALL_TOPIC_KEYS, HELP_TOPICS } from '../src/help-topics';

const said = (r: unknown) => (r as { data?: { content?: string } }).data?.content;

describe('with Polls off', () => {
  it('is the shipped setting', () => {
    expect(featureOn('polls')).toBe(false);
  });

  it('still takes help-get topic:polls, so its input is unchanged, and answers the overview', () => {
    expect(ALL_TOPIC_KEYS).toContain('polls');
    const page = renderHelp('polls', { tier: 'raider', tierOf: () => 'public', siteUrl: null });
    expect(page.topic).toBeNull();
    expect(page.text).not.toContain('/vintage poll');
  });

  it('registers neither /vintage poll nor /vintage event pick-night', () => {
    const top = RANDOM_COMMAND.options.map((o) => o.name);
    expect(top).not.toContain('poll');
    const event = RANDOM_COMMAND.options.find((o) => o.name === 'event') as unknown as {
      options: { name: string }[];
    };
    expect(event.options.map((o) => o.name)).toEqual(['help', 'create', 'check-export']);
    const help = RANDOM_COMMAND.options.find((o) => o.name === 'help') as unknown as {
      options: { choices: { value: string }[] }[];
    };
    expect(help.options[0]?.choices.map((c) => c.value)).not.toContain('polls');
  });

  it('leaves polls and pick-night out of help, and every example still parses', () => {
    expect(HELP_TOPICS.map((t) => t.key)).not.toContain('polls');
    const events = HELP_TOPICS.find((t) => t.key === 'events');
    expect(Object.keys(events?.runs ?? {})).toEqual(['event create']);
    const examples = HELP_TOPICS.flatMap((t) => t.examples).filter((e) => e.startsWith('/vintage'));
    expect(examples.some((e) => e.includes('pick-night') || e.startsWith('/vintage poll'))).toBe(
      false,
    );
    for (const example of examples)
      expect(parseExample(example), example).not.toHaveProperty('problem');
  });

  it('answers a vote button on a poll already posted with a note that polls are off', async () => {
    const click = {
      id: 'i',
      application_id: 'app',
      token: 'tok',
      type: InteractionType.MESSAGE_COMPONENT,
      data: { custom_id: 'poll:v:p1:o1', component_type: 2 },
    } as unknown as Interaction;
    expect(said(await handlePollInteraction(click, {} as never))).toBe(POLLS_OFF);
  });

  it('answers pick-night, if Discord still offers it, with a note that polls are off', async () => {
    const slash = {
      id: 'i',
      application_id: 'app',
      token: 'tok',
      type: InteractionType.APPLICATION_COMMAND,
      data: {
        name: 'vintage',
        options: [
          {
            name: 'event',
            type: T.SUB_COMMAND_GROUP,
            options: [{ name: 'pick-night', type: T.SUB_COMMAND, options: [] }],
          },
        ],
      },
    } as unknown as Interaction;
    expect(said(await handleEventInteraction(slash, {} as never))).toBe(PICK_NIGHT_OFF);
  });
});
