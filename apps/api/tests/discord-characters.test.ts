// The edges of /random character (#149) with stub ports: autocomplete that answers nothing
// outside the guild, names matched loosely, and custom ids within Discord's 100 characters. The
// JTBD host runs the whole flow against the registry (J40, J41).
import {
  ApplicationCommandOptionType,
  type Interaction,
  InteractionType,
} from '@vintage/discord-kit';
import type { Character, Member } from '@vintage/identity/contract';
import { describe, expect, it } from 'vitest';
import {
  type AutocompletePorts,
  type CharacterPorts,
  findCharacter,
  handleCharacterAutocomplete,
  handleCharacterInteraction,
  newCharacterForm,
} from '../src/discord-characters';
import { isAutocomplete } from '../src/gateway-auth';

const SERVER = '100000000000000001';
const T = ApplicationCommandOptionType;

const member: Member = {
  id: 'fen',
  guildId: 'g',
  discordId: 'd-fen',
  displayName: 'Fen',
  roleIds: [],
  inServer: true,
  rank: 'raider',
  tier: 'raider',
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
};
const id32 = 'k'.repeat(32);
const thorg: Character = {
  id: id32,
  guildId: 'g',
  memberId: 'fen',
  name: 'Thorg Il',
  class: 'warrior',
  spec: 'fury',
  role: 'tank',
  rolePicked: true,
  isMain: true,
};

const slash = (
  sub: string,
  options: { name: string; value: string; focused?: boolean }[],
  type: Interaction['type'] = InteractionType.APPLICATION_COMMAND,
  guild = SERVER,
): Interaction => ({
  id: 'i',
  application_id: 'app',
  token: 't',
  type,
  guild_id: guild,
  member: { user: { id: 'd-fen', username: 'fen' }, roles: [] },
  data: {
    name: 'random',
    options: [
      {
        name: 'character',
        type: T.SUB_COMMAND_GROUP,
        options: [
          {
            name: sub,
            type: T.SUB_COMMAND,
            options: options.map((o) => ({ ...o, type: T.STRING })),
          },
        ],
      },
    ],
  },
});

const autocompletePorts: AutocompletePorts = {
  discordGuildId: SERVER,
  guildId: 'g',
  memberByDiscordId: async (d) => (d === 'd-fen' ? member : null),
  characters: async () => [thorg],
};
const choices = (r: unknown) =>
  (r as { data: { choices: { name: string; value: string }[] } }).data.choices;

describe('/random character', () => {
  it('the HTTP route sends autocomplete, and only autocomplete, to the query', () => {
    expect(isAutocomplete({ type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE })).toBe(true);
    for (const other of [
      { type: InteractionType.APPLICATION_COMMAND },
      { type: InteractionType.MESSAGE_COMPONENT },
      { type: '4' },
      null,
      4,
    ]) {
      expect(isAutocomplete(other)).toBe(false);
    }
  });

  it('suggests specs by class, or every spec once with its class when none is chosen', async () => {
    const typing = (options: { name: string; value: string; focused?: boolean }[]) =>
      handleCharacterAutocomplete(
        slash('add', options, InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE),
        autocompletePorts,
      );
    expect(
      choices(
        await typing([
          { name: 'class', value: 'druid' },
          { name: 'spec', value: 'FER', focused: true },
        ]),
      ),
    ).toEqual([
      { name: 'Feral (melee DPS)', value: 'feral' },
      { name: 'Feral (tank)', value: 'feral-tank' },
    ]);
    const any = choices(await typing([{ name: 'spec', value: 'prot', focused: true }]));
    expect(any).toEqual([{ name: 'Protection Warrior (tank)', value: 'protection' }]);
  });

  it('suggests only your own characters, and nothing outside the guild server or to strangers', async () => {
    const name = (guild = SERVER, who = 'd-fen') => {
      const i = slash(
        'main',
        [{ name: 'name', value: 'th', focused: true }],
        InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE,
        guild,
      );
      i.member!.user.id = who;
      return handleCharacterAutocomplete(i, autocompletePorts);
    };
    expect(choices(await name())).toEqual([
      { name: 'Thorg Il · Fury Warrior, tank · main', value: 'Thorg Il' },
    ]);
    expect(choices(await name('999'))).toEqual([]);
    expect(choices(await name(SERVER, 'stranger'))).toEqual([]);
    // A slash command is not autocomplete, and autocomplete is not a slash command.
    expect(await handleCharacterAutocomplete(slash('list', []), autocompletePorts)).toBeNull();
  });

  it('matches a typed name in any capitalization, and keeps ids within 100 characters', async () => {
    expect(findCharacter([thorg], 'thorg IL')).toBe(thorg);
    expect(findCharacter([thorg], id32)).toBe(thorg);
    expect(findCharacter([thorg], 'thorgil')).toBeUndefined();

    const ports: CharacterPorts = {
      discordGuildId: SERVER,
      guildId: 'g',
      memberByDiscordId: async () => member,
      run: async (_caller, name) =>
        name === 'character-list'
          ? { success: true, data: [thorg] }
          : { success: true, data: { preview: { willRemove: thorg }, confirmToken: 'tok' } },
    };
    const preview = await handleCharacterInteraction(
      slash('remove', [{ name: 'name', value: 'Thorg Il' }]),
      ports,
    );
    const form = newCharacterForm(`signup-new:${'e'.repeat(32)}:tentative`, 'New character', {
      label: 'What might stop you? (optional)',
      placeholder: 'x',
    });
    const ids = JSON.stringify([preview, form]).match(/"custom_id":"[^"]*"/g) ?? [];
    expect(ids.join()).toContain(`char-rm:${id32}`);
    for (const customId of ids) {
      expect(customId.length - '"custom_id":""'.length).toBeLessThanOrEqual(100);
    }
    // The form holds at most five fields, and the spec list fits one select menu.
    const fields = (form as { data: { components: unknown[] } }).data.components;
    expect(fields).toHaveLength(5);
    expect(JSON.stringify(form)).toContain('"custom_id":"spec"');
  });
});
