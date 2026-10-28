import { coordinatorCommands } from '@vintage/coordinator/commands';
import { createMemoryCoordinatorDeps } from '@vintage/coordinator/testing';
import {
  ApplicationCommandOptionType,
  type Embed,
  type Interaction,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from '@vintage/discord-kit';
import type { Tier } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { raidsCommands } from '@vintage/raids/commands';
import { createMemoryRaidsDeps } from '@vintage/raids/testing';
import { fixedClock, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CANCELLED,
  checkDraft,
  type Draft,
  decodeDraft,
  encodeDraft,
  FORM_IDS,
  handleEventFormInteraction,
  isEventFormInteraction,
} from '../src/discord-event-form';
import { type EventPorts, handleEventInteraction } from '../src/discord-events';

const GUILD = 'guild-test';
const DISCORD_GUILD = '600000000000000001';
const NY = 'America/New_York';
/** Mon 26 Oct 2026, 12:00 New York. */
const NOW = Date.UTC(2026, 9, 26, 16);
/** Tue 10 Nov 2026, 20:00 New York (EST). */
const TUE_8PM = Date.UTC(2026, 10, 11, 1);

const member = (id: string, tier: Tier): Member => ({
  id,
  guildId: GUILD,
  discordId: `d-${id}`,
  displayName: id,
  roleIds: [],
  inServer: true,
  rank: null,
  tier,
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
});
let members: Member[];

type Deps = ReturnType<typeof createMemoryRaidsDeps> &
  ReturnType<typeof createMemoryCoordinatorDeps>;
let deps: Deps;
let ticks: number;
let ports: EventPorts;

beforeEach(async () => {
  members = [member('rook', 'leader'), member('aeryn', 'raider'), member('vex', 'leader')];
  deps = {
    ...createMemoryRaidsDeps(members),
    ...createMemoryCoordinatorDeps(() => ({ guildId: GUILD, events: [], members: [] })),
  };
  const registry = testRegistry<Deps>([...raidsCommands, ...coordinatorCommands], fixedClock(NOW));
  ticks = 0;
  ports = {
    discordGuildId: DISCORD_GUILD,
    guildId: GUILD,
    memberByDiscordId: async (discordId) => members.find((m) => m.discordId === discordId) ?? null,
    run: (caller, name, input) => registry.execute({ name, input, caller }, deps),
    afterChange: async () => {
      ticks++;
    },
    now: () => NOW,
  };
});

// ── Interactions as Discord sends them ────────────────────────────────────────────────────────

const base = (who: string, guildId = DISCORD_GUILD) => ({
  id: 'i',
  application_id: 'app',
  token: 'tok',
  guild_id: guildId,
  channel_id: '400000000000000009',
  member: { user: { id: `d-${who}`, username: who }, roles: [] },
});

const T = ApplicationCommandOptionType;
const slash = (
  who: string,
  options: Record<string, string | number> = {},
  guildId = DISCORD_GUILD,
): Interaction => ({
  ...base(who, guildId),
  type: InteractionType.APPLICATION_COMMAND,
  data: {
    name: 'random',
    options: [
      {
        name: 'event',
        type: T.SUB_COMMAND_GROUP,
        options: [
          {
            name: 'create',
            type: T.SUB_COMMAND,
            options: Object.entries(options).map(([name, value]) => ({
              name,
              value,
              type: typeof value === 'number' ? T.INTEGER : T.STRING,
            })),
          },
        ],
      },
    ],
  },
});

type Message = { id: string; embeds?: Embed[] };

/** A modal submit: text boxes by id, and selects as arrays. */
const submit = (
  who: string,
  customId: string,
  fields: Record<string, string | string[]>,
  message?: Message,
): Interaction => ({
  ...base(who),
  type: InteractionType.MODAL_SUBMIT,
  data: {
    custom_id: customId,
    components: Object.entries(fields).map(([id, v]) => ({
      type: 18,
      component: Array.isArray(v)
        ? { type: 3, custom_id: id, values: v }
        : { type: 4, custom_id: id, value: v },
    })),
  },
  ...(message ? { message } : {}),
});

const click = (who: string, customId: string, message: Message): Interaction => ({
  ...base(who),
  type: InteractionType.MESSAGE_COMPONENT,
  data: { custom_id: customId, component_type: 2 },
  message,
});

// ── Reading what came back ────────────────────────────────────────────────────────────────────

interface Field {
  type: number;
  label: string;
  description?: string;
  component: {
    custom_id: string;
    value?: string;
    placeholder?: string;
    required?: boolean;
    options?: { label: string; value: string; default?: boolean }[];
  };
}
interface ButtonSeen {
  custom_id: string;
  label: string;
  disabled?: boolean;
}
interface Data {
  content?: string;
  flags?: number;
  custom_id?: string;
  title?: string;
  embeds?: Embed[];
  components?: (Field | { components: ButtonSeen[] })[];
}
const typeOf = (r: unknown) => (r as { type: number }).type;
const dataOf = (r: unknown) => (r as { data: Data }).data;
const fields = (r: unknown) => (dataOf(r).components ?? []) as Field[];
const field = (r: unknown, id: string) => fields(r).find((f) => f.component.custom_id === id);
const buttons = (r: unknown) =>
  ((dataOf(r).components ?? []) as { components: ButtonSeen[] }[]).flatMap((row) => row.components);
const labels = (r: unknown) => buttons(r).map((b) => b.label);
const card = (r: unknown) => dataOf(r).embeds?.[0];
const fieldValue = (r: unknown, name: string) =>
  card(r)?.fields?.find((f) => f.name === name)?.value;
const problems = (r: unknown) => fieldValue(r, 'Fix before posting') ?? '';
/** The preview message as Discord sends it back with the next click. */
const messageOf = (r: unknown): Message => ({ id: 'm1', embeds: dataOf(r).embeds ?? [] });
const draftIn = (r: unknown) => decodeDraft(card(r)?.footer?.text);

const STAGE_1 = {
  name: 'Cathedral run',
  kind: ['dungeon'],
  where: 'Scarlet Monastery',
  start: '2026-11-10 8pm',
  hours: '3',
};

const run = (i: Interaction) => handleEventFormInteraction(i, ports);

/** Rook fills in stage 1 and gets the first preview. */
const stageOne = (overrides: Record<string, string | string[]> = {}) =>
  run(submit('rook', FORM_IDS.details, { ...STAGE_1, ...overrides }));

// ── Opening the form ─────────────────────────────────────────────────────────────────────────

describe('a bare /random event create', () => {
  it('opens the New event form: five fields, the zone named, and what Submit does', async () => {
    const r = await run(slash('rook'));
    expect(typeOf(r)).toBe(InteractionResponseType.MODAL);
    expect(dataOf(r)).toMatchObject({ custom_id: FORM_IDS.details, title: 'New event' });
    expect(fields(r).map((f) => f.label)).toEqual([
      'Name',
      'Kind',
      'Where',
      'Date and time',
      'Length in hours',
    ]);
    expect(field(r, 'name')?.description).toBe('Submit to set up the event.');
    expect(field(r, 'start')?.description).toContain(NY);
    expect(field(r, 'start')?.component.placeholder).toBe('2026-11-10 8pm');
    expect(field(r, 'hours')?.component.value).toBe('3');
    expect(field(r, 'kind')?.component.options?.map((o) => o.label)).toEqual([
      'Raid',
      'Dungeon',
      'Battleground',
      'Event',
    ]);
    expect(field(r, 'where')?.component.required).toBe(false);
  });

  it('prefills what was typed and carries size and counts in its custom id', async () => {
    const r = await run(
      slash('rook', { name: 'Cathedral run', kind: 'dungeon', size: 5, tanks: 1, dps: 3 }),
    );
    expect(dataOf(r).custom_id).toBe('evform:new:5:1::3');
    expect(field(r, 'name')?.component.value).toBe('Cathedral run');
    expect(field(r, 'kind')?.component.options?.find((o) => o.default)?.value).toBe('dungeon');
    const preview = await run(
      submit('rook', dataOf(r).custom_id!, { ...STAGE_1, kind: ['dungeon'] }),
    );
    expect(draftIn(preview)).toMatchObject({ size: '5', tanks: '1', healers: '', dps: '3' });
  });

  it('keeps the typed path when name and start are given', async () => {
    const typed = slash('rook', {
      name: 'Onyxia run',
      instance: 'Onyxia’s Lair',
      size: 40,
      start: '2026-11-10 8pm',
    });
    expect(isEventFormInteraction(typed)).toBe(false);
    expect(await run(typed)).toBeNull();
    const made = await handleEventInteraction(typed, ports);
    expect(dataOf(made).content).toContain('Made **Onyxia run**');
  });

  it('tells a raider it needs a raid leader, and opens nothing', async () => {
    const r = await run(slash('aeryn'));
    expect(typeOf(r)).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
    expect(dataOf(r).content).toContain('needs the Raid Leader rank');
  });

  it('refuses another server', async () => {
    const r = await run(slash('rook', {}, '999'));
    expect(dataOf(r).content).toContain('only runs raids in the Vintage guild server');
  });
});

// ── Stage 1 → the first preview ──────────────────────────────────────────────────────────────

describe('stage 1', () => {
  it('replies privately with the draft so far and Set up event', async () => {
    const r = await stageOne();
    expect(typeOf(r)).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
    expect(dataOf(r).flags).toBe(MessageFlags.EPHEMERAL);
    expect(card(r)?.title).toBe('Cathedral run');
    expect(fieldValue(r, 'Kind')).toBe('Dungeon');
    expect(fieldValue(r, 'Where')).toBe('Scarlet Monastery');
    expect(fieldValue(r, 'Starts')).toBe(`<t:${TUE_8PM / 1000}:F> (<t:${TUE_8PM / 1000}:R>)`);
    expect(fieldValue(r, 'Size')).toBe('5-player dungeon');
    expect(fieldValue(r, 'Roles')).toBe('1 tank · 1 healer · 3 DPS (the usual comp)');
    expect(fieldValue(r, 'Length')).toBe('3 hours');
    expect(labels(r)).toEqual(['Set up event', 'Edit details', 'Cancel']);
    expect(problems(r)).toBe('');
    expect(draftIn(r)).toMatchObject({ user: 'd-rook', kind: 'dungeon', step: 1 });
  });

  it('says what is wrong instead of failing: an unreadable time, a past one, no instance', async () => {
    const unreadable = await stageOne({ start: 'next tuesday', where: '' });
    expect(problems(unreadable)).toContain("couldn't read “next tuesday”");
    expect(problems(unreadable)).toContain(NY);
    expect(problems(unreadable)).toContain('Say where it runs');
    expect(fieldValue(unreadable, 'Starts')).toBe('Not readable yet');
    const past = await stageOne({ start: '2026-10-01 8pm' });
    expect(problems(past)).toContain('already passed');
    const long = await stageOne({ hours: '9' });
    expect(problems(long)).toContain('half an hour to 8 hours');
    const event = await stageOne({ kind: ['other'], where: '' });
    expect(problems(event)).toBe('');
    expect(fieldValue(event, 'Where')).toBe('Anywhere');
    expect(fieldValue(event, 'Size')).toBe('Open: no cap, no queue');
  });

  it('takes a length in hours like 2.5 or 2h', async () => {
    expect(fieldValue(await stageOne({ hours: '2.5' }), 'Length')).toBe('2.5 hours');
    expect(fieldValue(await stageOne({ hours: '2h' }), 'Length')).toBe('2 hours');
    expect(fieldValue(await stageOne({ hours: '' }), 'Length')).toBe('3 hours');
  });
});

// ── Stage 2, built for the kind ──────────────────────────────────────────────────────────────

const stageTwoForm = async (kind: string) => {
  const preview = await stageOne({ kind: [kind], where: 'Somewhere' });
  return { preview, form: await run(click('rook', FORM_IDS.next, messageOf(preview))) };
};

describe('stage 2', () => {
  it('a dungeon asks for its one size and the counts, prefilled with its usual comp', async () => {
    const { form } = await stageTwoForm('dungeon');
    expect(typeOf(form)).toBe(InteractionResponseType.MODAL);
    expect(dataOf(form)).toMatchObject({
      custom_id: 'evform:kind:dungeon',
      title: 'Dungeon details',
    });
    expect(fields(form).map((f) => f.label)).toEqual(['Size', 'Tanks', 'Healers', 'DPS']);
    expect(field(form, 'size')?.description).toBe('Submit to preview, then Post event.');
    expect(field(form, 'size')?.component.options?.map((o) => o.value)).toEqual(['5']);
    expect(['tanks', 'healers', 'dps'].map((c) => field(form, c)?.component.value)).toEqual([
      '1',
      '1',
      '3',
    ]);
  });

  it('a raid offers 10, 20 and 40; a battleground 10, 15 and 40 with no tanks', async () => {
    const raid = (await stageTwoForm('raid')).form;
    expect(field(raid, 'size')?.component.options?.map((o) => o.value)).toEqual(['10', '20', '40']);
    expect(field(raid, 'size')?.component.options?.find((o) => o.default)?.value).toBe('40');
    expect(field(raid, 'tanks')?.component.value).toBe('4');
    const bg = (await stageTwoForm('battleground')).form;
    expect(dataOf(bg).title).toBe('Battleground details');
    expect(field(bg, 'size')?.component.options?.map((o) => o.value)).toEqual(['10', '15', '40']);
    expect(field(bg, 'tanks')).toBeUndefined();
    expect(fields(bg).length).toBeLessThanOrEqual(5);
  });

  it('an Event takes a size box, empty for open, and optional counts', async () => {
    const { form } = await stageTwoForm('other');
    expect(dataOf(form).title).toBe('Event details');
    expect(field(form, 'size')?.component.options).toBeUndefined();
    expect(field(form, 'size')?.component.placeholder).toContain('open');
    expect(field(form, 'tanks')?.component.value).toBeUndefined();
  });

  it('usual counts follow the size picked; changing one takes all of them as typed', async () => {
    const { preview } = await stageTwoForm('raid');
    const twenty = await run(
      submit(
        'rook',
        'evform:kind:raid',
        { size: ['20'], tanks: '4', healers: '10', dps: '26' },
        messageOf(preview),
      ),
    );
    expect(typeOf(twenty)).toBe(InteractionResponseType.UPDATE_MESSAGE);
    expect(fieldValue(twenty, 'Size')).toBe('20-player raid');
    expect(fieldValue(twenty, 'Roles')).toContain('(the usual comp)');
    expect(fieldValue(twenty, 'Roles')).not.toContain('26 DPS');
    expect(labels(twenty)).toEqual(['Post event', 'Edit details', 'Edit size and comp', 'Cancel']);
    expect(buttons(twenty)[0]?.disabled).toBe(false);

    const typed = await run(
      submit(
        'rook',
        'evform:kind:raid',
        { size: ['20'], tanks: '2', healers: '6', dps: '12' },
        messageOf(twenty),
      ),
    );
    expect(fieldValue(typed, 'Roles')).toBe('2 tanks · 6 healers · 12 DPS');
  });

  it('counts set by hand stay when only the size changes, and the form says so', async () => {
    const { preview } = await stageTwoForm('raid');
    const typed = await run(
      submit(
        'rook',
        'evform:kind:raid',
        { size: ['40'], tanks: '4', healers: '9', dps: '26' },
        messageOf(preview),
      ),
    );
    const form = await run(click('rook', FORM_IDS.editKind, messageOf(typed)));
    expect(field(form, 'tanks')?.description).toContain('Set by you');
    const smaller = await run(
      submit(
        'rook',
        'evform:kind:raid',
        { size: ['20'], tanks: '4', healers: '9', dps: '26' },
        messageOf(typed),
      ),
    );
    expect(problems(smaller)).toContain('add up to more than 20 players');
    const fresh = (await stageTwoForm('raid')).form;
    expect(field(fresh, 'tanks')?.description).toBe(
      'Left as they are, they follow the size you pick.',
    );
  });

  it('counts that do not fit the size are shown, and Post event waits', async () => {
    const { preview } = await stageTwoForm('dungeon');
    const r = await run(
      submit(
        'rook',
        'evform:kind:dungeon',
        { size: ['5'], tanks: '2', healers: '2', dps: '3' },
        messageOf(preview),
      ),
    );
    expect(problems(r)).toContain('add up to more than 5 players');
    expect(buttons(r)[0]).toMatchObject({ label: 'Post event', disabled: true });
    const words = await run(
      submit(
        'rook',
        'evform:kind:dungeon',
        { size: ['5'], tanks: 'x', healers: '1', dps: '3' },
        messageOf(preview),
      ),
    );
    expect(problems(words)).toContain('whole numbers');
  });

  it('an Event over 40, or a size a kind does not take, is shown', async () => {
    const { preview } = await stageTwoForm('other');
    const big = await run(
      submit(
        'rook',
        'evform:kind:other',
        { size: '50', tanks: '', healers: '', dps: '' },
        messageOf(preview),
      ),
    );
    expect(problems(big)).toContain('An event is 1 to 40 players');
    const dungeon = (await stageTwoForm('dungeon')).preview;
    const ten = await run(
      submit(
        'rook',
        'evform:kind:dungeon',
        { size: ['10'], tanks: '1', healers: '1', dps: '3' },
        messageOf(dungeon),
      ),
    );
    expect(problems(ten)).toContain('A dungeon is 5 players');
  });
});

// ── The final preview's buttons ──────────────────────────────────────────────────────────────

/** Stage 1 and stage 2 for a dungeon, ready to post. */
async function ready() {
  const { preview } = await stageTwoForm('dungeon');
  return run(
    submit(
      'rook',
      'evform:kind:dungeon',
      { size: ['5'], tanks: '1', healers: '1', dps: '3' },
      messageOf(preview),
    ),
  );
}

describe('the preview', () => {
  it('Post event runs raid-create, starts a tick, and becomes the Made line', async () => {
    const r = await run(click('rook', FORM_IDS.post, messageOf(await ready())));
    expect(typeOf(r)).toBe(InteractionResponseType.UPDATE_MESSAGE);
    expect(dataOf(r).content).toContain('Made **Cathedral run** (Somewhere, 5-player dungeon)');
    expect(dataOf(r).content).toContain('looking for 1 tank · 1 healer · 3 DPS');
    expect(dataOf(r)).toMatchObject({ embeds: [], components: [] });
    const [raid] = await deps.raids.listEvents(GUILD);
    expect(raid).toMatchObject({
      name: 'Cathedral run',
      instance: 'Somewhere',
      kind: 'dungeon',
      size: 5,
      startsAt: TUE_8PM,
      durationMinutes: 180,
      roleTargets: null,
    });
    expect(ticks).toBe(1);
  });

  it('the same draft posted twice makes one event', async () => {
    const message = messageOf(await ready());
    await run(click('rook', FORM_IDS.post, message));
    const again = await run(click('rook', FORM_IDS.post, message));
    expect(dataOf(again).content).toContain('is already made');
    expect(await deps.raids.listEvents(GUILD)).toHaveLength(1);
    expect(ticks).toBe(1);
  });

  it('Post event re-checks the tier: a leader demoted since gets nothing made', async () => {
    const message = messageOf(await ready());
    members[0] = { ...members[0]!, tier: 'raider' };
    const r = await run(click('rook', FORM_IDS.post, message));
    expect(dataOf(r).content).toContain('needs the Raid Leader rank');
    expect(await deps.raids.listEvents(GUILD)).toEqual([]);
  });

  it('Post event before stage 2, or with problems, makes nothing and shows the preview', async () => {
    const early = await run(click('rook', FORM_IDS.post, messageOf(await stageOne())));
    expect(labels(early)).toContain('Set up event');
    const past = await run(
      click('rook', FORM_IDS.post, messageOf(await stageOne({ start: '2026-10-01 8pm' }))),
    );
    expect(problems(past)).toContain('already passed');
    expect(await deps.raids.listEvents(GUILD)).toEqual([]);
  });

  it('Edit details reopens stage 1 prefilled; a new kind starts the comp over', async () => {
    const preview = await ready();
    const form = await run(click('rook', FORM_IDS.edit, messageOf(preview)));
    expect(field(form, 'name')?.component.value).toBe('Cathedral run');
    expect(field(form, 'start')?.component.value).toBe('2026-11-10 8pm');
    expect(field(form, 'kind')?.component.options?.find((o) => o.default)?.value).toBe('dungeon');
    const same = await run(
      submit(
        'rook',
        FORM_IDS.details,
        { ...STAGE_1, name: 'Cath', where: 'SM' },
        messageOf(preview),
      ),
    );
    expect(typeOf(same)).toBe(InteractionResponseType.UPDATE_MESSAGE);
    expect(labels(same)[0]).toBe('Post event');
    const raid = await run(
      submit('rook', FORM_IDS.details, { ...STAGE_1, kind: ['raid'] }, messageOf(preview)),
    );
    expect(labels(raid)[0]).toBe('Set up event');
    expect(fieldValue(raid, 'Size')).toBe('40-player raid');
  });

  it('Edit size and comp reopens stage 2 with the counts set', async () => {
    const { preview } = await stageTwoForm('dungeon');
    const typed = await run(
      submit(
        'rook',
        'evform:kind:dungeon',
        { size: ['5'], tanks: '2', healers: '1', dps: '2' },
        messageOf(preview),
      ),
    );
    const form = await run(click('rook', FORM_IDS.editKind, messageOf(typed)));
    expect(field(form, 'tanks')?.component.value).toBe('2');
    expect(field(form, 'dps')?.component.value).toBe('2');
  });

  it('Cancel says nothing was made', async () => {
    const r = await run(click('rook', FORM_IDS.cancel, messageOf(await ready())));
    expect(dataOf(r)).toMatchObject({ content: CANCELLED, embeds: [], components: [] });
    expect(await deps.raids.listEvents(GUILD)).toEqual([]);
  });
});

// ── The draft in the message ─────────────────────────────────────────────────────────────────

const DRAFT: Draft = {
  user: 'd-rook',
  name: 'Zul’Gurub · ✨',
  kind: 'raid',
  where: 'Zul’Gurub',
  start: '2026-11-10 8pm',
  hours: '3',
  size: '20',
  tanks: '',
  healers: '',
  dps: '',
  step: 2,
};
const withFooter = (text: string): Message => ({ id: 'm1', embeds: [{ footer: { text } }] });
const raw = (value: unknown) =>
  `v1.${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}`;

describe('the draft', () => {
  it('round-trips through the footer, any characters included', () => {
    expect(decodeDraft(`Only you can see this draft. ${encodeDraft(DRAFT)}`)).toEqual(DRAFT);
  });

  it('refuses anything a member could not have typed: long fields, other kinds, extra keys', () => {
    expect(decodeDraft(raw({ ...DRAFT, name: 'x'.repeat(61) }))).toBeNull();
    expect(decodeDraft(raw({ ...DRAFT, kind: 'arena' }))).toBeNull();
    expect(decodeDraft(raw({ ...DRAFT, size: '400' }))).toBeNull();
    expect(decodeDraft(raw({ ...DRAFT, roleTargets: { tank: 1 } }))).toBeNull();
    expect(decodeDraft(raw({ ...DRAFT, step: 3 }))).toBeNull();
    expect(decodeDraft('v1.not-base64!')).toBeNull();
    expect(decodeDraft('v1.e30')).toBeNull();
    expect(decodeDraft(undefined)).toBeNull();
  });

  it('a click on someone else’s draft is refused, and an unreadable one makes nothing', async () => {
    const theirs = await run(click('vex', FORM_IDS.post, withFooter(encodeDraft(DRAFT))));
    expect(dataOf(theirs).content).toContain('belongs to someone else');
    const broken = await run(click('rook', FORM_IDS.post, withFooter('v1.garbage')));
    expect(dataOf(broken).content).toContain('Start again');
    expect(await deps.raids.listEvents(GUILD)).toEqual([]);
  });

  it('a decoded draft is checked again with raid-create’s rules before it is posted', () => {
    const fine = checkDraft(DRAFT, NY, NOW);
    expect(fine.problems).toEqual([]);
    expect(fine.input).toMatchObject({ kind: 'raid', size: 20, startsAt: TUE_8PM });
    const odd = checkDraft({ ...DRAFT, size: '7', tanks: 'zz' }, NY, NOW);
    expect(odd.input).toBeNull();
    expect(odd.problems.join(' ')).toContain('A raid is 10, 20 or 40 players');
    expect(odd.problems.join(' ')).toContain('whole numbers');
    // A name past raid-create's 60 characters passes the form's own checks; the schema catches it.
    const long = checkDraft({ ...DRAFT, name: 'x'.repeat(70) }, NY, NOW);
    expect(long.input).toBeNull();
    expect(long.problems.join(' ')).toContain('name');
  });

  it('keeps every custom id under 100 characters', async () => {
    const opened = await run(
      slash('rook', {
        name: 'x'.repeat(60),
        kind: 'other',
        size: 40,
        tanks: 40,
        healers: 40,
        dps: 40,
      }),
    );
    expect(dataOf(opened).custom_id!.length).toBeLessThanOrEqual(100);
    for (const id of Object.values(FORM_IDS)) expect(id.length).toBeLessThan(100);
  });
});
