// The signup flow's parsing and how it uses signup-suggest (#148), the Role menu and the New
// character form (#149). The JTBD host runs the whole flow against the registry (J05, J15, J39,
// J40); these pin the edges with stub ports.
import { type Interaction, InteractionType } from '@vintage/discord-kit';
import type { CommandResult } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import type { RaidEvent, Signup, SignupGuess } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import {
  handleSignupInteraction,
  type NewCharacterInput,
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
  inServer: true,
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
  alsoRoles: [],
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
  const adds: NewCharacterInput[] = [];
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
    characterAdd: async (_caller, input) => {
      adds.push(input);
      return input.spec === 'holy' && input.class === 'mage'
        ? {
            success: false,
            error: { code: 'INVALID_SPEC', message: '"holy" is not a mage spec', retryable: false },
          }
        : {
            success: true,
            data: { ...oak, id: 'elm', name: input.name, isMain: false } as Character,
          };
    },
    afterChange: async () => undefined,
  };
  return { p, sets, adds };
}

/** A New character form submit, as Discord sends labels with a text input and selects. */
const newCharacter = (
  customId: string,
  fields: { name: string; class: string; spec?: string; role?: string; note?: string },
) =>
  interaction(
    customId,
    {
      components: [
        { type: 18, component: { type: 4, custom_id: 'name', value: fields.name } },
        { type: 18, component: { type: 3, custom_id: 'class', values: [fields.class] } },
        {
          type: 18,
          component: { type: 3, custom_id: 'spec', values: fields.spec ? [fields.spec] : [] },
        },
        {
          type: 18,
          component: { type: 3, custom_id: 'role', values: fields.role ? [fields.role] : [] },
        },
        ...(fields.note === undefined
          ? []
          : [{ type: 18, component: { type: 4, custom_id: 'note', value: fields.note } }]),
      ],
    },
    InteractionType.MODAL_SUBMIT,
  );

describe('discord signups', () => {
  it('signs up with the guessed spec, not only the guessed character', async () => {
    const { p, sets } = ports(guessOak);
    const res = await handleSignupInteraction(interaction('signup:raid1:accepted'), p);
    expect(sets).toEqual([
      { eventId: 'raid1', characterId: 'oak', status: 'accepted', spec: 'feral' },
    ]);
    expect(JSON.stringify(res)).toContain('Feral Druid, melee DPS): 3 of your last 5');
  });

  it('plays the guessed spec through the reason form, and only for the guessed character', async () => {
    const { p, sets } = ports(guessOak);
    const submit = (characterId: string) =>
      handleSignupInteraction(
        interaction(
          `signup-note:raid1:tentative:${characterId}`,
          {
            components: [{ type: 1, components: [{ type: 4, custom_id: 'note', value: 'maybe' }] }],
          },
          InteractionType.MODAL_SUBMIT,
        ),
        p,
      );
    expect(JSON.stringify(await submit('oak'))).toContain('3 of your last 5');
    await submit('elm');
    expect(sets).toEqual([
      { eventId: 'raid1', characterId: 'oak', status: 'tentative', note: 'maybe', spec: 'feral' },
      { eventId: 'raid1', characterId: 'elm', status: 'tentative', note: 'maybe' },
    ]);
  });

  it('keeps every custom id within Discord’s 100 characters with real-length ids', async () => {
    // Convex ids are 32 characters; Beast Mastery and Assassination are the longest specs.
    const id = (c: string) => c.repeat(32);
    const { p } = ports({ ...guessOak, characterId: id('c'), spec: 'beast-mastery' });
    p.event = async () => ({ ...raid, id: id('e') });
    p.characters = async () => [
      { ...oak, id: id('c') },
      { ...oak, id: id('d'), isMain: false },
    ];
    const form = await handleSignupInteraction(interaction(`signup:${id('e')}:tentative`), p);
    expect(form).toMatchObject({ type: 9 });
    const reply = await handleSignupInteraction(interaction(`signup:${id('e')}:accepted`), p);
    // The New character form, from the picker (with a note) and from Switch character.
    const pick = (customId: string) =>
      handleSignupInteraction(interaction(customId, { component_type: 3, values: ['new'] }), p);
    const fromPicker = await pick(`signup-pick:${id('e')}:tentative`);
    p.signup = async () => ({ status: 'tentative', characterId: id('c') }) as Signup;
    const fromSwitch = await pick(`signup-char:${id('e')}`);
    expect([fromPicker, fromSwitch]).toMatchObject([{ type: 9 }, { type: 9 }]);
    const ids =
      JSON.stringify([form, reply, fromPicker, fromSwitch]).match(/"custom_id":"[^"]*"/g) ?? [];
    expect(ids.join()).toContain('signup-role:');
    expect(ids.join()).toContain('signup-new:');
    expect(ids.length).toBeGreaterThan(2);
    for (const customId of ids)
      expect(customId.length - '"custom_id":""'.length).toBeLessThanOrEqual(100);
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

  it('the Role menu plays a role for this raid, or goes back to the spec', async () => {
    const { p, sets } = ports(guessOak);
    p.signup = async () => ({ status: 'late', characterId: 'oak' }) as Signup;
    const role = (value: string) =>
      handleSignupInteraction(
        interaction('signup-role:raid1', { component_type: 3, values: [value] }),
        p,
      );
    expect(await role('tank')).toMatchObject({ type: 7 });
    await role('guess');
    expect(sets).toEqual([
      { eventId: 'raid1', status: 'late', characterId: 'oak', role: 'tank' },
      { eventId: 'raid1', status: 'late', characterId: 'oak', role: null },
    ]);
    // The reply's Role menu: "Guess from the spec (…)" first, chosen unless a role was picked.
    const res = JSON.stringify(
      await handleSignupInteraction(interaction('signup:raid1:accepted'), p),
    );
    expect(res).toContain(
      '"label":"Guess from the spec (Melee DPS)","value":"guess","default":true',
    );
  });

  it('opens the New character form straight away for someone with no characters', async () => {
    const { p } = ports(null);
    p.characters = async () => [];
    const res = await handleSignupInteraction(interaction('signup:raid1:tentative'), p);
    expect(res).toMatchObject({ type: 9, data: { custom_id: 'signup-new:raid1:tentative' } });
    // Tentative asks for its note in the same form; the picker always ends with New character….
    expect(JSON.stringify(res)).toContain('"custom_id":"note"');
    p.characters = async () => [oak];
    const picker = JSON.stringify(
      await handleSignupInteraction(interaction('signup:raid1:accepted'), p),
    );
    expect(picker).toContain('"label":"New character…","value":"new"');
  });

  it('asks how late with 5 / 15 / 30 min buttons instead of a reason form', async () => {
    const { p, sets } = ports(guessOak);
    const picker = await handleSignupInteraction(interaction('signup:raid1:late'), p);
    const json = JSON.stringify(picker);
    expect(json).toContain('Later than 30 minutes? Press Absent instead.');
    expect(json).toContain('signup-late:raid1:oak:5');
    expect(json).toContain('signup-late:raid1:oak:15');
    expect(json).toContain('signup-late:raid1:oak:30');
    const res = await handleSignupInteraction(interaction('signup-late:raid1:oak:15'), p);
    expect(res).toMatchObject({ type: 7 });
    expect(sets).toEqual([
      { eventId: 'raid1', characterId: 'oak', status: 'late', lateMinutes: 15, spec: 'feral' },
    ]);
  });

  it('the New character form saves the character, then signs up with it in one step', async () => {
    const { p, sets, adds } = ports(null);
    const res = await handleSignupInteraction(
      newCharacter('signup-new:raid1:tentative', {
        name: 'Elm',
        class: 'warrior',
        spec: 'fury',
        role: 'tank',
        note: ' after work ',
      }),
      p,
    );
    expect(adds).toEqual([{ name: 'Elm', class: 'warrior', spec: 'fury', role: 'tank' }]);
    expect(sets).toEqual([
      { eventId: 'raid1', status: 'tentative', characterId: 'elm', note: 'after work' },
    ]);
    expect(JSON.stringify(res)).toContain('your new character');

    // "Guess from the spec" sends no role; a wrong spec for the class is the command's to refuse.
    await handleSignupInteraction(
      newCharacter('signup-new:raid1:accepted', {
        name: 'Ash',
        class: 'priest',
        spec: 'holy',
        role: 'guess',
      }),
      p,
    );
    expect(adds[1]).toEqual({ name: 'Ash', class: 'priest', spec: 'holy' });
    const refused = await handleSignupInteraction(
      newCharacter('signup-new:raid1:accepted', { name: 'Kol', class: 'mage', spec: 'holy' }),
      p,
    );
    expect(JSON.stringify(refused)).toContain('is not a mage spec');
    expect(JSON.stringify(refused)).toContain('New character…');
    expect(sets).toHaveLength(2);

    // Already signed up: a form that asked for a note still saves it; one that didn't (from
    // Switch character) leaves the signup's note alone.
    p.signup = async () => ({ status: 'tentative', characterId: 'gone', note: 'old' }) as Signup;
    await handleSignupInteraction(
      newCharacter('signup-new:raid1:tentative', {
        name: 'Fir',
        class: 'mage',
        spec: 'fire',
        note: 'bus',
      }),
      p,
    );
    await handleSignupInteraction(
      newCharacter('signup-new:raid1:tentative', { name: 'Yew', class: 'mage', spec: 'fire' }),
      p,
    );
    expect(sets.slice(2)).toEqual([
      { eventId: 'raid1', status: 'tentative', characterId: 'elm', note: 'bus' },
      { eventId: 'raid1', status: 'tentative', characterId: 'elm' },
    ]);
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
    expect(pick('signup-role:raid1', 'tank')).toEqual({
      kind: 'role',
      eventId: 'raid1',
      role: 'tank',
    });
    expect(pick('signup-role:raid1', 'guess')).toEqual({
      kind: 'role',
      eventId: 'raid1',
      role: null,
    });
    expect(pick('signup-role:raid1', 'dps')).toBeNull();
    expect(pick('signup-role:raid1:late', 'tank')).toBeNull();
    const form = (id: string) =>
      parseSignupInteraction(newCharacter(id, { name: 'Elm', class: 'mage', spec: 'frost' }));
    expect(form('signup-new:raid1:accepted')).toEqual({
      kind: 'new',
      eventId: 'raid1',
      status: 'accepted',
    });
    expect(form('signup-new:raid1')).toBeNull();
    expect(form('signup-new:raid1:maybe')).toBeNull();
    expect(
      parseSignupInteraction(interaction('signup-new:raid1:accepted', { component_type: 2 })),
    ).toBeNull();
    const note = (id: string) =>
      parseSignupInteraction(
        interaction(
          id,
          { components: [{ type: 1, components: [{ type: 4, custom_id: 'note', value: ' x ' }] }] },
          InteractionType.MODAL_SUBMIT,
        ),
      );
    expect(note('signup-note:raid1:late:oak')).toMatchObject({ characterId: 'oak', note: 'x' });
    expect(note('signup-note:raid1:late:oak:feral')).toBeNull();
    expect(note('signup-note:raid1:late:o k')).toBeNull();
    const click = (id: string) => parseSignupInteraction(interaction(id, { component_type: 2 }));
    expect(click('signup:raid1:accepted')).toMatchObject({ kind: 'button' });
    expect(click('signup:raid1:accepted:junk')).toBeNull();
    expect(pick('signup-pick:raid1:accepted:x', 'oak')).toBeNull();
  });

  /** 2 tanks, 2 healers, 3 melee, 3 ranged (all raiders): raid full (10/10), melee full (3/3). */
  function compFullRoster(roster: Signup['roster']): Signup[] {
    return [
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `t${i}`,
        memberId: `mt${i}`,
        characterName: `Tank${i}`,
        class: 'warrior',
        spec: 'protection',
        role: 'tank',
        status: 'accepted',
        roster,
        signedUpAt: i,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `h${i}`,
        memberId: `mh${i}`,
        characterName: `Heal${i}`,
        class: i === 0 ? 'priest' : 'druid',
        spec: i === 0 ? 'holy' : 'restoration',
        role: 'healer',
        status: 'accepted',
        roster,
        signedUpAt: 10 + i,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `m${i}`,
        memberId: `mm${i}`,
        characterName: `Melee${i}`,
        class: 'rogue',
        spec: 'combat',
        role: 'melee',
        status: 'accepted',
        roster,
        signedUpAt: 20 + i,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `r${i}`,
        memberId: `mr${i}`,
        characterName: `Ranged${i}`,
        class: 'mage',
        spec: 'frost',
        role: 'ranged',
        status: 'accepted',
        roster,
        signedUpAt: 30 + i,
      })),
    ] as Signup[];
  }

  function fenSignup(p: SignupPorts, spec = 'feral') {
    p.signupSet = async (_caller, input) => ({
      success: true,
      data: {
        id: 's-fen',
        guildId: 'g',
        eventId: 'raid1',
        memberId: 'fen',
        characterId: 'oak',
        characterName: 'Oak',
        class: 'druid',
        spec: input.spec ?? spec,
        role: 'melee',
        alsoRoles: [],
        status: input.status,
        lateMinutes: null,
        note: null,
        roster: 'pending',
        group: null,
        signedUpAt: 100,
        updatedAt: 100,
        updatedBy: 'fen',
        queued: false,
        promotedAt: null,
      } satisfies Signup,
    });
  }

  it('a sign-up has no cap: a new signup never hears Standby for capacity alone before an officer decides (#324, row 48)', async () => {
    const { p } = ports({ ...guessOak, spec: 'feral', role: 'melee' });
    const smallRaid: RaidEvent = {
      ...raid,
      size: 10,
      kind: 'raid',
      access: 'guild',
      roleTargets: { tank: 2, healer: 2, melee: 3, ranged: 3 },
      rosterApprovedAt: null,
      rosterApprovedBy: null,
    };
    const recruitMember: Member = { ...member, id: 'fen', rank: 'recruit', tier: 'recruit' };
    // Full by comp math (10/10, melee 3/3), but nobody is explicitly rostered yet: no officer
    // decision has applied, so this doesn't count as a cap.
    const existingSignups = compFullRoster('pending');
    const allMembers: Member[] = [
      recruitMember,
      ...existingSignups.map((s) => ({ ...member, id: s.memberId, rank: 'raider' as const })),
    ];
    p.memberByDiscordId = async () => recruitMember;
    p.event = async () => smallRaid;
    p.signups = async () => existingSignups;
    p.rosterContext = async () => ({ members: allMembers, absences: [] });
    fenSignup(p);

    const res = await handleSignupInteraction(interaction('signup:raid1:accepted'), p);
    const text = JSON.stringify(res);
    expect(text).not.toContain('Standby');
    expect(text).toContain('The signup post updates in a few seconds.');
  });

  it('surfaces the comp-solver bench reason once the raid is already full by explicit seats (#324)', async () => {
    const { p } = ports({ ...guessOak, spec: 'feral', role: 'melee' });
    const smallRaid: RaidEvent = {
      ...raid,
      size: 10,
      kind: 'raid',
      access: 'guild',
      roleTargets: { tank: 2, healer: 2, melee: 3, ranged: 3 },
      rosterApprovedAt: null,
      rosterApprovedBy: null,
    };
    const recruitMember: Member = { ...member, id: 'fen', rank: 'recruit', tier: 'recruit' };
    // Already explicitly seated (roster: 'rostered') to fill the raid: a real leader decision.
    const existingSignups = compFullRoster('rostered');
    const allMembers: Member[] = [
      recruitMember,
      ...existingSignups.map((s) => ({ ...member, id: s.memberId, rank: 'raider' as const })),
    ];
    p.memberByDiscordId = async () => recruitMember;
    p.event = async () => smallRaid;
    p.signups = async () => existingSignups;
    p.rosterContext = async () => ({ members: allMembers, absences: [] });
    fenSignup(p);

    const res = await handleSignupInteraction(interaction('signup:raid1:accepted'), p);
    expect(JSON.stringify(res)).toContain(
      "You're on Standby (melee slots full (3/3)); leaders will seat you if a spot opens.",
    );
  });
});
