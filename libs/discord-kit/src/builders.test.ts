import { describe, expect, it } from 'vitest';
import {
  actionRow,
  ButtonStyle,
  button,
  ComponentType,
  linkButton,
  stringSelect,
  textInput,
} from './components';
import { EMBED_LIMITS, embed } from './embeds';
import {
  ApplicationCommandOptionType,
  deferReply,
  deferUpdate,
  type Interaction,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  modal,
  modalValues,
  pong,
  reply,
  subcommandPath,
  updateMessage,
} from './interactions';
import { discordTimestamp, TimestampStyle } from './timestamps';

describe('interaction responses', () => {
  it('answers PING with PONG', () => {
    expect(pong()).toEqual({ type: InteractionResponseType.PONG });
    expect(InteractionResponseType.PONG).toBe(1);
  });

  it('builds an immediate reply with mentions off', () => {
    expect(reply('hi')).toEqual({
      type: 4,
      data: { content: 'hi', allowed_mentions: { parse: [] } },
    });
  });

  it('sets the ephemeral flag', () => {
    const res = reply({ content: 'secret' }, { ephemeral: true });
    expect(res.type).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
    expect(res).toMatchObject({ data: { flags: MessageFlags.EPHEMERAL } });
    expect(deferReply({ ephemeral: true })).toEqual({ type: 5, data: { flags: 64 } });
  });

  it('builds a modal with one text input per row, and reads submitted values', () => {
    const res = modal(
      'signup-note:raid:late:char',
      'Running late?',
      textInput('note', 'Why, and how late?', { required: false, max_length: 200 }),
    );
    expect(res).toEqual({
      type: 9,
      data: {
        custom_id: 'signup-note:raid:late:char',
        title: 'Running late?',
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'note',
                label: 'Why, and how late?',
                style: 1,
                required: false,
                max_length: 200,
              },
            ],
          },
        ],
      },
    });
    const submitted = {
      id: '1',
      application_id: '2',
      token: 't',
      type: InteractionType.MODAL_SUBMIT,
      data: {
        custom_id: 'x',
        components: [
          { type: 1, components: [{ type: 4, custom_id: 'note', value: 'after work' }] },
        ],
      },
    };
    expect(modalValues(submitted)).toEqual({ note: 'after work' });
    expect(() => modal('x', 'a'.repeat(46), textInput('n', 'Note'))).toThrow();
    expect(() => actionRow(textInput('a', 'A'), textInput('b', 'B'))).toThrow();
  });

  it('builds deferred and update responses', () => {
    expect(deferReply()).toEqual({ type: 5 });
    expect(deferUpdate()).toEqual({ type: 6 });
    expect(updateMessage({ components: [] })).toEqual({ type: 7, data: { components: [] } });
  });

  it('reads the subcommand path of a slash command', () => {
    const interaction = {
      id: '1',
      application_id: 'a',
      token: 't',
      type: InteractionType.APPLICATION_COMMAND,
      data: {
        name: 'vintage',
        options: [{ name: 'ping', type: ApplicationCommandOptionType.SUB_COMMAND, options: [] }],
      },
    } satisfies Interaction;
    expect(subcommandPath(interaction)).toEqual(['ping']);
    expect(subcommandPath({ ...interaction, data: { name: 'vintage' } })).toEqual([]);
  });
});

describe('embeds', () => {
  it('clips to Discord limits and drops undefined keys', () => {
    const e = embed({
      title: 'x'.repeat(300),
      fields: Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, value: 'v' })),
    });
    expect(e.title).toHaveLength(EMBED_LIMITS.title);
    expect(e.title?.endsWith('…')).toBe(true);
    expect(e.fields).toHaveLength(EMBED_LIMITS.fields);
    expect('description' in e).toBe(false);
  });
});

describe('components', () => {
  it('builds buttons and selects in action rows', () => {
    const row = actionRow(
      button('signup:yes', 'Yes', ButtonStyle.SUCCESS),
      linkButton('https://x.y', 'Site'),
    );
    expect(row.type).toBe(ComponentType.ACTION_ROW);
    expect(row.components[0]).toMatchObject({ type: 2, style: 3, custom_id: 'signup:yes' });
    expect(row.components[1]).toMatchObject({ style: ButtonStyle.LINK, url: 'https://x.y' });
    const select = stringSelect('spec', [{ label: 'Holy', value: 'holy' }], { max_values: 1 });
    expect(actionRow(select).components).toHaveLength(1);
  });

  it('rejects rows Discord would reject', () => {
    const b = (i: number) => button(`b${i}`, `B${i}`);
    expect(() => actionRow(...[1, 2, 3, 4, 5, 6].map(b))).toThrow();
    expect(() => actionRow(stringSelect('s', [{ label: 'a', value: 'a' }]), b(1))).toThrow();
    expect(() => button('x'.repeat(101), 'too long')).toThrow();
    expect(() => stringSelect('s', [])).toThrow();
  });
});

describe('discordTimestamp', () => {
  const when = new Date('2026-11-04T19:30:00Z');

  it('defaults to the long date-time style', () => {
    expect(discordTimestamp(when)).toBe(`<t:${when.getTime() / 1000}:F>`);
  });

  it('supports every style and millisecond epochs', () => {
    expect(discordTimestamp(when.getTime() + 999, TimestampStyle.RELATIVE)).toBe(
      `<t:${when.getTime() / 1000}:R>`,
    );
    for (const style of Object.values(TimestampStyle)) {
      expect(discordTimestamp(when, style)).toMatch(new RegExp(`^<t:\\d+:${style}>$`));
    }
  });

  it('rejects invalid dates', () => {
    expect(() => discordTimestamp(new Date('nope'))).toThrow();
  });
});
