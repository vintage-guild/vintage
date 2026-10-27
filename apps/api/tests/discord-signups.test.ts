// The signup flow's parsing and how it uses signup-suggest (#148). The JTBD host runs the whole
// flow against the registry (J05, J15, J39); these pin the edges with stub ports.
import { type Interaction, InteractionType } from '@vintage/discord-kit';
import type { CommandResult } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import type { RaidEvent, Signup, SignupGuess } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import {
  handleSignupInteraction,
  parseSignupInteraction,
  type SignupInput,
  type SignupPorts,
} from '../src/discord-signups';

const SERVER = '100000000000000001';

const interaction = (
  customId: string,
  extra: Partial<Interaction['data']> = {},
  type: Interaction['type'] = InteractionType.MESSAGE_COMPONENT,
): Interaction => ({
  id: 'i',
  application_id: 'app',
  token: 'token',
  type,
  guild_id: SERVER,
  member: { user: { id: 'd-fen', username: 'fen' }, roles: [] },
  data: { custom_id: customId, ...extra },
});

const member: Member = {
  id: 'fen',
  guildId: 'g',
  discordId: 'd-fen',
  displayName: 'Fen',
  roleIds: [],
  rank: 'raider',
  tier: 'raider',
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
};
const oak: Character = {
  id: 'oak',
  guildId: 'g',
  memberId: 'fen',
  name: 'Oak',
  class: 'druid',
  spec: 'feral-tank',
  role: 'tank',
  isMain: true,
};
const guessOak: SignupGuess = {
  characterId: 'oak',
  characterName: 'Oak',
  spec: 'feral',
  role: 'melee',
  reason: '3 of your last 5 Molten Core nights',
};
const raid = { id: 'raid1', name: 'Raid night', size: 40, kind: 'raid' } as RaidEvent;

function ports(guess: SignupGuess | null) {
  const sets: SignupInput[] = [];
  const p: SignupPorts = {
    discordGuildId: SERVER,
    guildId: 'g',
    memberByDiscordId: async () => member,
    characters: async () => [oak],
    event: async () => raid,
    signup: async () => null,
    signups: async () => [],
    signupSuggest: async () => ({ success: true, data: guess }),
    signupSet: async (_caller, input) => {
      sets.push(input);
      const result: CommandResult<Signup> = {
        success: true,
        data: {
          characterName: 'Oak',
          class: 'druid',
          status: input.status,
          spec: input.spec ?? 'feral-tank',
          role: input.spec === 'feral' ? 'melee' : 'tank',
          queued: false,
        } as Signup,
      };
      return result;
    },
    afterChange: async () => undefined,
  };
  return { p, sets };
}

describe('discord signups', () => {
  it('signs up with the guessed spec, not only the guessed character', async () => {
    const { p, sets } = ports(guessOak);
    const res = await handleSignupInteraction(interaction('signup:raid1:accepted'), p);
    expect(sets).toEqual([
      { eventId: 'raid1', characterId: 'oak', status: 'accepted', spec: 'feral' },
    ]);
    expect(JSON.stringify(res)).toContain('Feral Druid, melee DPS): 3 of your last 5');
  });

  it('carries the guessed spec through the reason form', async () => {
    const { p, sets } = ports(null);
    const submit = interaction(
      'signup-note:raid1:tentative:oak:feral',
      { components: [{ type: 1, components: [{ type: 4, custom_id: 'note', value: 'maybe' }] }] },
      InteractionType.MODAL_SUBMIT,
    );
    await handleSignupInteraction(submit, p);
    expect(sets).toEqual([
      { eventId: 'raid1', characterId: 'oak', status: 'tentative', note: 'maybe', spec: 'feral' },
    ]);
  });

  it("marks a role as needed without counting the member's own signup", async () => {
    const { p } = ports({ ...guessOak, spec: 'feral-tank', role: 'tank' });
    const dungeon = {
      ...raid,
      kind: 'dungeon',
      size: 5,
      roleTargets: { tank: 1, healer: 1, dps: 3 },
    };
    p.event = async () => dungeon as RaidEvent;
    // Fen is the one tank going; switching away would leave the raid short, so tank is marked.
    p.signups = async () => [
      { memberId: 'fen', role: 'tank', status: 'accepted', queued: false } as Signup,
    ];
    const res = await handleSignupInteraction(interaction('signup:raid1:accepted'), p);
    expect(JSON.stringify(res)).toContain('"description":"Tank · tanks needed"');
  });

  it('opens the picker when signup-suggest has no guess or fails', async () => {
    const { p, sets } = ports(null);
    const res = await handleSignupInteraction(interaction('signup:raid1:accepted'), p);
    expect(JSON.stringify(res)).toContain('Which character');
    p.signupSuggest = async () => ({
      success: false,
      error: { code: 'BOOM', message: 'x', retryable: true },
    });
    expect(
      JSON.stringify(await handleSignupInteraction(interaction('signup:raid1:accepted'), p)),
    ).toContain('Which character');
    expect(sets).toEqual([]);
  });

  it('parses only well-formed ids, with the picked value as the choice', () => {
    const pick = (id: string, value: string) =>
      parseSignupInteraction(interaction(id, { component_type: 3, values: [value] }));
    expect(pick('signup-char:raid1', 'oak')).toEqual({
      kind: 'switch',
      eventId: 'raid1',
      characterId: 'oak',
    });
    expect(pick('signup-spec:raid1', 'feral-tank')).toEqual({
      kind: 'spec',
      eventId: 'raid1',
      spec: 'feral-tank',
    });
    expect(pick('signup-spec:raid1:accepted', 'feral')).toBeNull();
    expect(pick('signup-char:raid1:accepted', 'oak')).toBeNull();
    expect(pick('signup-spec:', 'feral')).toBeNull();
    expect(pick('signup-char:raid1', '')).toBeNull();
    expect(pick('signup-char:raid1', 'x y')).toBeNull();
    expect(pick('signup-pick:raid1:accepted', 'a:b')).toBeNull();
    const note = (id: string) =>
      parseSignupInteraction(
        interaction(
          id,
          { components: [{ type: 1, components: [{ type: 4, custom_id: 'note', value: ' x ' }] }] },
          InteractionType.MODAL_SUBMIT,
        ),
      );
    expect(note('signup-note:raid1:late:oak')).toMatchObject({ spec: undefined, note: 'x' });
    expect(note('signup-note:raid1:late:oak:feral')).toMatchObject({ spec: 'feral' });
    expect(note('signup-note:raid1:late:oak:feral:more')).toBeNull();
    expect(note('signup-note:raid1:late:oak:fer al')).toBeNull();
  });
});
