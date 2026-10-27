// JTBD: the raid night (PLAN §6). One test per job in docs/jtbd/raid-night.md; the ids match.
// Each test builds a fresh guild, drives it only through commands and coordinator ticks, and
// checks what members would see in Discord. Extend these when the raid night changes.
import { decodeRaidImport } from '@vintage/bridge-format';
import { buttonLabels, messageText } from '@vintage/coordinator/testing';
import { ScheduledEventStatus } from '@vintage/discord-kit';
import type { Caller } from '@vintage/guild-kit';
import type { RaidEvent, Signup } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createHost,
  DAY,
  DISCORD_GUILD,
  HOUR,
  type Host,
  OPS_CHANNEL,
  ROLES,
  SIGNUP_CHANNEL,
} from './host';

/** Wed 28 Oct 2026, 20:00 New York (EDT). */
const WED = Date.UTC(2026, 9, 29, 0);
/** Sat 24 Oct 2026, 12:00 New York: four days before the Wednesday raid. */
const SATURDAY_NOON = Date.UTC(2026, 9, 24, 16);

interface Guild {
  host: Host;
  ana: Caller; // officer
  rook: Caller; // raid leader
  aeryn: Caller; // raider, warrior tank
  bram: Caller; // flex raider, priest healer
  cade: Caller; // raider, mage; doesn't want DMs
  dara: Caller; // recruit
  pip: Caller; // member, no raiding intent
  chars: Record<string, string>;
}

async function createGuild(): Promise<Guild> {
  const host = createHost(SATURDAY_NOON);
  const join = (id: string, name: string, role: string) =>
    host.discordMember(`50000000000000000${id}`, name, [role]);
  const g = {
    host,
    ana: await join('1', 'Ana', ROLES.officer),
    rook: await join('2', 'Rook', ROLES.raidLeader),
    aeryn: await join('3', 'Aeryn', ROLES.raider),
    bram: await join('4', 'Bram', ROLES.flexRaider),
    cade: await join('5', 'Cade', ROLES.raider),
    dara: await join('6', 'Dara', ROLES.recruit),
    pip: await join('7', 'Pip', ROLES.member),
    chars: {} as Record<string, string>,
  };
  const add = async (who: Caller, key: string, name: string, cls: string, spec: string) => {
    g.chars[key] = (
      await host.ok<{ id: string }>(who, 'character-add', { name, class: cls, spec })
    ).id;
  };
  await add(g.ana, 'ana', 'Anarra', 'paladin', 'holy');
  await add(g.rook, 'rook', 'Rookwood', 'druid', 'feral-tank');
  await add(g.aeryn, 'aeryn', 'Aeryn', 'warrior', 'protection');
  await add(g.bram, 'bram', 'Bramble', 'priest', 'holy');
  await add(g.cade, 'cade', 'Cadence', 'mage', 'frost');
  await add(g.dara, 'dara', 'Daralis', 'rogue', 'combat');
  await host.ok(g.cade, 'member-prefs-set', { dmOptOut: true });
  return g;
}

/** J01's setup: an officer schedules Wed/Thu nights and points the coordinator at the channels. */
async function scheduleRaidNights(g: Guild) {
  await g.host.ok(g.ana, 'schedule-create', {
    name: 'Raid night',
    instance: 'Molten Core',
    size: 40,
    weekdays: ['wed', 'thu'],
    time: '20:00',
    timeZone: 'America/New_York',
  });
  await g.host.configureCoordinator();
  await g.host.tick();
  const raids = await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list', {});
  return { wed: raids[0]!.event, thu: raids[1]!.event };
}

const answer = (g: Guild, who: Caller, key: string, eventId: string, status: string) =>
  g.host.ok<Signup>(who, 'signup-set', { eventId, characterId: g.chars[key], status });

interface Menu {
  custom_id: string;
  options: { label: string; value: string; description?: string; default?: boolean }[];
}
/** The select menus on a private reply, in order. */
const menus = (r: unknown): Menu[] =>
  ((r as { data?: { components?: { components: Menu[] }[] } }).data?.components ?? []).map(
    (row) => row.components[0]!,
  );

const mentions = (m: { message: { allowed_mentions?: { users?: string[] } } }) =>
  m.message.allowed_mentions?.users ?? [];

describe('JTBD: raid night', () => {
  let g: Guild;
  beforeEach(async () => {
    g = await createGuild();
  });

  it('J01 · an officer sets up raid nights once and signup posts appear on their own', async () => {
    const { wed, thu } = await scheduleRaidNights(g);
    expect(wed.startsAt).toBe(WED);
    expect(thu.startsAt).toBe(WED + DAY);
    const posts = g.host.sentTo(SIGNUP_CHANNEL);
    for (const p of posts) expect(p.message.embeds?.[0]?.title).toBe('Raid night · Molten Core');
    expect(posts).toHaveLength(2);
    expect(buttonLabels(posts[0]!.message)).toEqual([
      'Accept',
      'Late',
      'Tentative',
      'Standby',
      'Decline',
      'Roster',
    ]);
    // Running again posts nothing new.
    await g.host.tick();
    expect(g.host.sentTo(SIGNUP_CHANNEL)).toHaveLength(2);
  });

  it('J02 · a raider answers and the signup post updates to show them', async () => {
    const { wed } = await scheduleRaidNights(g);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    await g.host.tick();
    const edit = g.host.editsTo(SIGNUP_CHANNEL).at(-1)!;
    const text = messageText(edit.message);
    expect(text).toMatch(/\*\*1\*\* going/);
    expect(text).toMatch(/Tanks 1\/4\n<:square_warrior:\d+> 1 Aeryn \*prot\*/);
    expect(text).toMatch(/Healers 0\/10\n—/);
  });

  it('J03 · only expected raiders who have not answered get pinged, once', async () => {
    const { wed } = await scheduleRaidNights(g);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    g.host.clock.advance(WED - 72 * HOUR - g.host.clock.now());
    await g.host.tick();
    await g.host.tick();
    const reminders = g.host
      .sentTo(SIGNUP_CHANNEL)
      .filter((m) => m.message.content?.includes('Still waiting'));
    // Only Wednesday is inside 72h; Thursday's 72h mark is a day later.
    expect(reminders).toHaveLength(1);
    // Not Aeryn (answered), Dara (a recruit), or Pip (a member): they aren't expected to answer.
    expect(mentions(reminders[0]!).sort()).toEqual(
      [g.ana, g.rook, g.bram, g.cade].map((c) => c.discordId).sort(),
    );
  });

  it('J04 · at 24h non-responders get a DM unless they opted out, and officers get a digest', async () => {
    const { wed } = await scheduleRaidNights(g);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    await answer(g, g.ana, 'ana', wed.id, 'accepted');
    g.host.clock.advance(WED - 24 * HOUR - g.host.clock.now());
    await g.host.tick();
    const dmed = g.host.discord.sent.filter((m) => m.kind === 'dm').map((m) => m.to);
    expect(dmed.sort()).toEqual([g.bram.discordId, g.rook.discordId].sort()); // Cade opted out
    const digest = g.host.sentTo(OPS_CHANNEL).find((m) => m.message.content?.includes('confirmed'));
    expect(digest?.message.content).toMatch(/2\/40 confirmed/);
    expect(digest?.message.content).toMatch(/Not answered \(3\): Bram, Cade, Rook/);
  });

  it('J05 · a raider changes their answer and keeps their place in line', async () => {
    const { wed } = await scheduleRaidNights(g);
    const first = await answer(g, g.bram, 'bram', wed.id, 'tentative');
    g.host.clock.advance(HOUR);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    g.host.clock.advance(HOUR);
    const changed = await answer(g, g.bram, 'bram', wed.id, 'accepted');
    expect(changed.id).toBe(first.id);
    expect(changed.signedUpAt).toBe(first.signedUpAt);
    const list = await g.host.ok<Signup[]>(g.dara, 'signup-list', { eventId: wed.id });
    expect(list.map((s) => s.characterName)).toEqual(['Bramble', 'Aeryn']);

    // Playing another spec for the night, from the private reply's Change spec menu, keeps the
    // place too; only the signup's spec and role change.
    const respecced = await g.host.discordUi.pick(
      g.bram.discordId!,
      `signup-spec:${wed.id}`,
      'shadow',
    );
    expect(respecced).toMatchObject({ type: 7 });
    const shadow = await g.host.ok<Signup>(g.bram, 'signup-get', { eventId: wed.id });
    expect(shadow).toMatchObject({ id: first.id, signedUpAt: first.signedUpAt, role: 'ranged' });
    expect(
      (await g.host.ok<Signup[]>(g.dara, 'signup-list', { eventId: wed.id })).map(
        (s) => s.characterName,
      ),
    ).toEqual(['Bramble', 'Aeryn']);
  });

  it('J06 ·a raid leader arranges groups and sees what the comp is missing', async () => {
    const { wed } = await scheduleRaidNights(g);
    const tank = await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    await answer(g, g.bram, 'bram', wed.id, 'accepted');
    await g.host.ok(g.rook, 'roster-move', { signupId: tank.id, group: 1 });
    expect(await g.host.run(g.aeryn, 'roster-move', { signupId: tank.id, group: 2 })).toMatchObject(
      {
        error: { code: 'COMMAND_NOT_FOUND' },
      },
    );
    const comp = await g.host.run(g.aeryn, 'comp-suggest', { eventId: wed.id });
    expect(comp.reasoning).toMatch(/need 3 tanks/);
    expect(comp.reasoning).toMatch(/no Mark of the Wild/);
  });

  it('J07 · at T-2h signups lock, the final roster posts, and officers get the addon string', async () => {
    const { wed } = await scheduleRaidNights(g);
    const tank = await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    const healer = await answer(g, g.bram, 'bram', wed.id, 'accepted');
    await g.host.ok(g.rook, 'roster-move', { signupId: tank.id, group: 1 });
    await g.host.ok(g.rook, 'roster-move', { signupId: healer.id, group: 1 });
    g.host.clock.advance(WED - 2 * HOUR - g.host.clock.now());
    await g.host.tick();

    const raid = await g.host.ok<{ event: RaidEvent }>(g.aeryn, 'raid-get', { eventId: wed.id });
    expect(raid.event.status).toBe('locked');
    const final = g.host
      .sentTo(SIGNUP_CHANNEL)
      .find((m) => messageText(m.message).includes('Final roster'));
    expect(messageText(final!.message)).toMatch(/Final roster · Raid night[\s\S]*2\/40/);
    const addon = g.host
      .sentTo(OPS_CHANNEL)
      .find((m) => m.message.content?.includes('Addon import'));
    const encoded = addon!.message.content!.split('```\n')[1]!.split('\n```')[0]!;
    const decoded = decodeRaidImport(encoded);
    expect(decoded.ok && decoded.value.groups).toEqual([
      { group: 1, characterIds: [g.chars.aeryn, g.chars.bram] },
    ]);

    // After lock, raiders can't change their answer; the raid leader still can.
    expect(
      await g.host.run(g.cade, 'signup-set', {
        eventId: wed.id,
        characterId: g.chars.cade,
        status: 'accepted',
      }),
    ).toMatchObject({
      error: { code: 'RAID_CLOSED' },
    });
    await g.host.ok(g.rook, 'signup-set', {
      eventId: wed.id,
      characterId: g.chars.cade,
      status: 'accepted',
    });
  });

  it('J08 · an officer cancels one night; it stays cancelled and nobody is chased for it', async () => {
    const { thu } = await scheduleRaidNights(g);
    await g.host.ok(g.ana, 'raid-cancel', { eventId: thu.id });
    await g.host.ok(g.ana, 'schedule-materialize');
    const upcoming = await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list', {});
    expect(upcoming.map((r) => r.event.id)).not.toContain(thu.id);
    g.host.clock.advance(thu.startsAt - 24 * HOUR - g.host.clock.now());
    await g.host.tick();
    const thursdayStamp = `<t:${Math.floor(thu.startsAt / 1000)}:`;
    const aboutThursday = g.host.discord.sent.filter((m) =>
      JSON.stringify(m.message).includes(thursdayStamp),
    );
    expect(aboutThursday.filter((m) => m.kind !== 'edit')).toHaveLength(1); // only the original post
  });

  it('J09 · a member can see why the bot pinged them', async () => {
    const { wed } = await scheduleRaidNights(g);
    g.host.clock.advance(WED - 24 * HOUR - g.host.clock.now());
    await g.host.tick();
    const log = await g.host.ok<{ rule: string; target: string; status: string }[]>(
      g.bram,
      'coordinator-log',
      {
        eventId: wed.id,
      },
    );
    expect(log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'remind-24h', target: SIGNUP_CHANNEL, status: 'sent' }),
        expect.objectContaining({ rule: 'dm-24h', target: g.bram.memberId, status: 'sent' }),
        expect.objectContaining({ rule: 'remind-72h', status: 'skipped' }),
      ]),
    );
  });

  it('J10 · Discord roles decide who can sign up', async () => {
    const { wed } = await scheduleRaidNights(g);
    expect(
      await g.host.run(g.pip, 'signup-set', {
        eventId: wed.id,
        characterId: 'x',
        status: 'accepted',
      }),
    ).toMatchObject({
      error: { code: 'COMMAND_NOT_FOUND' },
    });
    const pipRaider = await g.host.discordMember(g.pip.discordId!, 'Pip', [ROLES.raider]);
    expect(pipRaider.tier).toBe('raider');
    const pipChar = await g.host.ok<{ id: string }>(pipRaider, 'character-add', {
      name: 'Pipsqueak',
      class: 'hunter',
      spec: 'marksmanship',
    });
    await g.host.ok(pipRaider, 'signup-set', {
      eventId: wed.id,
      characterId: pipChar.id,
      status: 'accepted',
    });
    const friend = await g.host.discordMember('500000000000000099', 'Visitor', [ROLES.friend]);
    expect(friend.tier).toBe('public');
    expect(await g.host.run(friend, 'raid-list', {})).toMatchObject({
      error: { code: 'COMMAND_NOT_FOUND' },
    });
  });

  it('J11 · an officer pauses the coordinator and nothing goes out until they resume', async () => {
    await g.host.ok(g.ana, 'schedule-create', {
      name: 'Raid night',
      instance: 'Molten Core',
      size: 40,
      weekdays: ['wed'],
      time: '20:00',
      timeZone: 'America/New_York',
    });
    await g.host.configureCoordinator();
    await g.host.ok(g.rook, 'coordinator-pause');
    expect(await g.host.tick()).toMatchObject({ skipped: 'paused' });
    expect(g.host.discord.sent).toEqual([]);
    expect(await g.host.run(g.rook, 'coordinator-run')).toMatchObject({
      error: { code: 'COORDINATOR_PAUSED' },
    });
    await g.host.ok(g.rook, 'coordinator-resume');
    await g.host.tick();
    expect(g.host.sentTo(SIGNUP_CHANNEL)).toHaveLength(1);
  });

  it('J12 · a raider who will be late says so, with a reason everyone can see', async () => {
    const { wed } = await scheduleRaidNights(g);
    await g.host.ok(g.bram, 'signup-set', {
      eventId: wed.id,
      characterId: g.chars.bram,
      status: 'late',
      note: 'after work, ~20 min',
    });
    await g.host.tick();
    const text = messageText(g.host.editsTo(SIGNUP_CHANNEL).at(-1)!.message);
    // Late still takes a spot: listed with the healers, marked late, reason underneath.
    expect(text).toMatch(
      /Healers 1\/10\n<:square_priest:\d+> 1 Bramble \*holy\* <:status_late:\d+>/,
    );
    expect(text).toMatch(/Late: Bramble \(after work, ~20 min\)/);
    g.host.clock.advance(WED - 24 * HOUR - g.host.clock.now());
    await g.host.tick();
    const digest = g.host.sentTo(OPS_CHANNEL).find((m) => m.message.content?.includes('confirmed'));
    expect(digest?.message.content).toMatch(/Late \(1\): Bramble \(after work, ~20 min\)/);
  });

  it('J13 · when a raid is full, extra people queue and the first in line is told when a spot opens', async () => {
    const raid = await g.host.ok<RaidEvent>(g.rook, 'raid-create', {
      name: 'ZG',
      instance: "Zul'Gurub",
      size: 10,
      startsAt: WED,
    });
    await g.host.configureCoordinator();
    // Eleven raiders answer, one minute apart.
    const people: Caller[] = [];
    for (let i = 0; i < 11; i++) {
      const who = await g.host.discordMember(`51000000000000${100 + i}`, `Raider${i}`, [
        ROLES.raider,
      ]);
      const char = await g.host.ok<{ id: string }>(who, 'character-add', {
        name: `Raiderchar${String.fromCharCode(97 + i)}`,
        class: 'warrior',
        spec: 'fury',
      });
      await g.host.ok(who, 'signup-set', {
        eventId: raid.id,
        characterId: char.id,
        status: 'accepted',
      });
      people.push(who);
      g.host.clock.advance(60 * 1000);
    }
    const eleventh = await g.host.ok<Signup | null>(people[10]!, 'signup-get', {
      eventId: raid.id,
    });
    expect(eleventh?.queued).toBe(true);
    await g.host.tick();
    const post = messageText(g.host.sentTo(SIGNUP_CHANNEL)[0]!.message);
    expect(post).toMatch(/\*\*10\*\* going/);
    expect(post).toMatch(/\*\*1\*\* queued/);
    expect(post).toMatch(/Queue 1\n1\. <:square_warrior:\d+> Raiderchark \*fury\*/);

    // Someone ahead drops out: the queued raider is in and gets told, once.
    const third = await g.host.ok<Signup>(people[2]!, 'signup-get', { eventId: raid.id });
    await g.host.ok(people[2]!, 'signup-set', {
      eventId: raid.id,
      characterId: third.characterId,
      status: 'declined',
    });
    await g.host.tick();
    await g.host.tick();
    const notices = g.host
      .sentTo(SIGNUP_CHANNEL)
      .filter((m) => m.message.content?.includes('a spot opened up'));
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message.allowed_mentions?.users).toEqual([people[10]!.discordId]);
  });

  it('J14 · stepping down to tentative gives up your place in line', async () => {
    const { wed } = await scheduleRaidNights(g);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    g.host.clock.advance(HOUR);
    await answer(g, g.bram, 'bram', wed.id, 'accepted');
    g.host.clock.advance(HOUR);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'tentative');
    g.host.clock.advance(HOUR);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    const list = await g.host.ok<Signup[]>(g.dara, 'signup-list', { eventId: wed.id });
    expect(list.map((x) => x.characterName)).toEqual(['Bramble', 'Aeryn']);
  });

  it('J15 · a member answers straight from the Discord post, privately', async () => {
    const { wed } = await scheduleRaidNights(g);
    const ui = g.host.discordUi;
    const content = (r: unknown) => (r as { data?: { content?: string } }).data?.content ?? '';
    const flags = (r: unknown) => (r as { data?: { flags?: number } }).data?.flags;

    // One character: Accept answers right away with the guess (her main) and says so. Only
    // Aeryn sees the reply, and the post refresh starts.
    const accepted = await ui.click(g.aeryn.discordId!, `signup:${wed.id}:accepted`);
    expect(content(accepted)).toMatch(
      /\*\*Accepted\*\* for Raid night as \*\*Aeryn\*\* \(Protection Warrior, tank\): your main\./,
    );
    expect(flags(accepted)).toBe(64);
    // Change spec lists the warrior's specs with their roles; with one character there's no
    // Switch character menu.
    expect(menus(accepted).map((m) => m.custom_id)).toEqual([`signup-spec:${wed.id}`]);
    expect(menus(accepted)[0]!.options.map((o) => `${o.label}: ${o.description}`)).toEqual([
      'Arms: Melee DPS · DPS needed',
      'Fury: Melee DPS · DPS needed',
      'Protection: Tank · tanks needed',
    ]);
    expect(g.host.ticksRequested.length).toBeGreaterThan(0);
    expect((await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: wed.id })).status).toBe(
      'accepted',
    );

    // Roster shows the full list, privately.
    const roster = (await ui.click(g.aeryn.discordId!, `roster:${wed.id}`)) as {
      data: { flags?: number; embeds?: { title?: string }[] };
    };
    expect(roster.data.flags).toBe(64);
    expect(roster.data.embeds?.[0]?.title).toBe('Roster · Raid night');
    expect(JSON.stringify(roster.data)).toContain('Aeryn');

    // Late opens a reason form; the reason lands on the signup.
    const form = await ui.click(g.bram.discordId!, `signup:${wed.id}:late`);
    expect(form).toMatchObject({
      type: 9,
      data: { custom_id: `signup-note:${wed.id}:late:${g.chars.bram}:holy` },
    });
    const late = await ui.submit(
      g.bram.discordId!,
      `signup-note:${wed.id}:late:${g.chars.bram}:holy`,
      'after work',
    );
    expect(await g.host.ok<Signup>(g.bram, 'signup-get', { eventId: wed.id })).toMatchObject({
      status: 'late',
      note: 'after work',
    });
    // The form came from the guess, so the reply still says why.
    expect(content(late)).toMatch(
      /\*\*Late\*\* for Raid night as \*\*Bramble\*\* \(Holy Priest, healer\): your main\./,
    );

    // Several characters and no main to guess (she removed it): a private picker asks which,
    // marking what the raid is short of, and turns into the result with both menus.
    await g.host.ok(g.dara, 'character-add', { name: 'Daraheal', class: 'priest', spec: 'holy' });
    await g.host.ok(g.dara, 'character-add', { name: 'Darabolt', class: 'mage', spec: 'fire' });
    await g.host.ok(g.dara, 'character-remove', { characterId: g.chars.dara });
    const picker = await ui.click(g.dara.discordId!, `signup:${wed.id}:accepted`);
    expect(content(picker)).toMatch(/Which character/);
    expect(menus(picker)[0]!.options.map((o) => o.description)).toEqual([
      'Fire Mage, ranged DPS · DPS needed',
      'Holy Priest, healer · healers needed',
    ]);
    const daraChars = await g.host.ok<{ id: string; name: string }[]>(g.dara, 'character-list', {});
    const alt = daraChars.find((c) => c.name === 'Daraheal')!;
    const picked = await ui.pick(g.dara.discordId!, `signup-pick:${wed.id}:accepted`, alt.id);
    expect(picked).toMatchObject({ type: 7 });
    expect(content(picked)).toMatch(/\*\*Accepted\*\* for Raid night as \*\*Daraheal\*\*/);
    expect(menus(picked).map((m) => m.custom_id)).toEqual([
      `signup-char:${wed.id}`,
      `signup-spec:${wed.id}`,
    ]);
    // Next time, their signed-up character is used without asking.
    const again = await ui.click(g.dara.discordId!, `signup:${wed.id}:bench`);
    expect(content(again)).toMatch(/\*\*Bench\*\* for Raid night as \*\*Daraheal\*\*/);
    expect(content(again)).toMatch(/your signup for this raid/);
    // Declining needs no menus.
    expect(menus(await ui.click(g.dara.discordId!, `signup:${wed.id}:declined`))).toEqual([]);

    // A menu click for someone with no signup, or a malformed id, is handled safely.
    expect(content(await ui.pick(g.cade.discordId!, `signup-spec:${wed.id}`, 'fire'))).toMatch(
      /Answer the raid first/,
    );
    expect(await ui.pick(g.cade.discordId!, `signup-spec:${wed.id}:extra`, 'fire')).toBeNull();
    expect(await ui.pick(g.cade.discordId!, `signup-char:${wed.id}`, 'a:b')).toBeNull();

    // Refusals stay private and say what to do.
    expect(content(await ui.click(g.pip.discordId!, `signup:${wed.id}:accepted`))).toMatch(
      /Recruit rank/,
    );
    expect(content(await ui.click('999999999999999999', `signup:${wed.id}:accepted`))).toMatch(
      /don't know you yet/,
    );
    expect(
      content(
        await ui.clickFromServer(
          g.aeryn.discordId!,
          `signup:${wed.id}:declined`,
          '700000000000000001',
        ),
      ),
    ).toMatch(/only takes signups in the Vintage guild server/);
    expect((await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: wed.id })).status).toBe(
      'accepted',
    );
  });

  it('J39 · a raider brings a different character tonight in one click, for this raid only', async () => {
    const { wed, thu } = await scheduleRaidNights(g);
    const ui = g.host.discordUi;
    const content = (r: unknown) => (r as { data?: { content?: string } }).data?.content ?? '';
    const bark = (
      await g.host.ok<{ id: string }>(g.aeryn, 'character-add', {
        name: 'Aerbark',
        class: 'druid',
        spec: 'feral-tank',
      })
    ).id;

    // Wednesday she brings her druid: Accept uses her main, Switch character swaps in one pick.
    expect(content(await ui.click(g.aeryn.discordId!, `signup:${wed.id}:accepted`))).toMatch(
      /as \*\*Aeryn\*\* .*: your main\./,
    );
    const first = await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: wed.id });
    g.host.clock.advance(HOUR);
    await answer(g, g.bram, 'bram', wed.id, 'accepted');
    const switched = await ui.pick(g.aeryn.discordId!, `signup-char:${wed.id}`, bark);
    expect(switched).toMatchObject({ type: 7 });
    expect(content(switched)).toMatch(/as \*\*Aerbark\*\* \(Feral Druid, tank\)\./);
    // Her place in line is kept.
    expect(await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: wed.id })).toMatchObject({
      id: first.id,
      characterId: bark,
      signedUpAt: first.signedUpAt,
    });

    // Thursday, the same schedule: the guess is the druid, and the reply says why.
    const thursday = await ui.click(g.aeryn.discordId!, `signup:${thu.id}:accepted`);
    expect(content(thursday)).toMatch(
      /as \*\*Aerbark\*\* \(Feral Druid, tank\): your last Molten Core night\./,
    );
    // Change spec offers Feral twice, as a tank and as DPS.
    const specs = menus(thursday).find((m) => m.custom_id === `signup-spec:${thu.id}`)!;
    expect(specs.options.filter((o) => o.label === 'Feral').map((o) => o.value)).toEqual([
      'feral',
      'feral-tank',
    ]);
    expect(specs.options.find((o) => o.default)?.value).toBe('feral-tank');

    // Tonight she plays cat: the signup's role changes, the saved druid stays a tank.
    await ui.pick(g.aeryn.discordId!, `signup-spec:${thu.id}`, 'feral');
    expect(await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: thu.id })).toMatchObject({
      characterId: bark,
      spec: 'feral',
      role: 'melee',
    });
    const saved = await g.host.ok<{ id: string; spec: string }[]>(g.aeryn, 'character-list', {});
    expect(saved.find((c) => c.id === bark)?.spec).toBe('feral-tank');
    // Going late keeps the spec; switching back to her warrior clears it.
    expect(await ui.click(g.aeryn.discordId!, `signup:${thu.id}:late`)).toMatchObject({
      data: { custom_id: `signup-note:${thu.id}:late:${bark}:feral` },
    });
    await ui.submit(g.aeryn.discordId!, `signup-note:${thu.id}:late:${bark}:feral`, 'ten min');
    expect(await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: thu.id })).toMatchObject({
      status: 'late',
      spec: 'feral',
    });
    await ui.pick(g.aeryn.discordId!, `signup-char:${thu.id}`, g.chars.aeryn!);
    expect(await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: thu.id })).toMatchObject({
      characterName: 'Aeryn',
      spec: 'protection',
      role: 'tank',
      status: 'late',
    });
  });

  it('J28 · a raid leader makes a raid from Discord, and its signup card goes up', async () => {
    const { wed } = await scheduleRaidNights(g);
    const ui = g.host.eventUi;
    const content = (r: unknown) => (r as { data?: { content?: string } }).data?.content ?? '';
    const before = g.host.sentTo(SIGNUP_CHANNEL).length;
    const ticks = g.host.ticksRequested.length;

    // Rook types the time in the guild's clock; the reply echoes it back as a Discord timestamp.
    const tue8pm = Date.UTC(2026, 10, 4, 1); // Tue 3 Nov 2026, 20:00 New York (EST)
    const made = await ui.slash(g.rook.discordId!, 'create', {
      name: 'Onyxia run',
      instance: "Onyxia's Lair",
      size: 40,
      start: '2026-11-03 8pm',
    });
    expect(content(made)).toContain(`<t:${tue8pm / 1000}:F>`);
    // No kind given: a raid, with the usual 40-person comp.
    expect(content(made)).toContain("Made **Onyxia run** (Onyxia's Lair, 40-player raid) for <t:");
    expect(content(made)).toContain('looking for 4 tanks · 10 healers · 26 DPS');
    expect(g.host.ticksRequested.length).toBeGreaterThan(ticks);

    // The next tick posts its signup card beside the scheduled nights.
    await g.host.tick();
    const raids = await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list', {});
    const onyxia = raids.find((r) => r.event.name === 'Onyxia run')!.event;
    expect(onyxia).toMatchObject({ startsAt: tue8pm, size: 40, durationMinutes: 180 });
    expect(onyxia.id).not.toBe(wed.id);
    expect(
      g.host
        .sentTo(SIGNUP_CHANNEL)
        .slice(before)
        .some((m) => messageText(m.message).includes('Onyxia run')),
    ).toBe(true);

    // With server events on, the raid made from Discord also shows in the Events list.
    await g.host.configureCoordinator({ serverEvents: true });
    await g.host.tick();
    const listed = [...g.host.discord.serverEvents.values()].find(
      (e) => e.data.name === 'Onyxia run',
    );
    expect(listed?.data).toMatchObject({
      scheduled_start_time: new Date(tue8pm).toISOString(),
      entity_metadata: { location: "Onyxia's Lair" },
    });

    // A raider can't; a time it can't read says how to write one.
    const raider = await ui.slash(g.aeryn.discordId!, 'create', {
      name: 'Sneaky',
      instance: "Onyxia's Lair",
      size: 40,
      start: '2026-11-03 20:00',
    });
    expect(content(raider)).toMatch(/needs the Raid Leader rank/);
    const unclear = await ui.slash(g.rook.discordId!, 'create', {
      name: 'Later',
      instance: "Onyxia's Lair",
      size: 40,
      start: 'next tuesday',
    });
    expect(content(unclear)).toMatch(/couldn't read “next tuesday”/);

    // Another kind, with the counts set by hand: the reply and the Events list say what it is.
    const bg = await ui.slash(g.rook.discordId!, 'create', {
      name: 'WSG premade',
      instance: 'Warsong Gulch',
      size: 10,
      start: '2026-11-03 9pm',
      kind: 'battleground',
      healers: 3,
    });
    expect(content(bg)).toContain('(Warsong Gulch, 10-player battleground)');
    expect(content(bg)).toContain('looking for 0 tanks · 3 healers · 7 DPS');
    const wrongSize = await ui.slash(g.rook.discordId!, 'create', {
      name: 'Big SM',
      instance: 'Scarlet Monastery',
      size: 10,
      start: '2026-11-03 9pm',
      kind: 'dungeon',
    });
    expect(content(wrongSize)).toMatch(/A dungeon can't be 10 players.*Use a size of 5/s);
    await g.host.tick();
    await g.host.tick();
    const bgEvent = [...g.host.discord.serverEvents.values()].find(
      (e) => e.data.name === 'Battleground · WSG premade',
    );
    expect(bgEvent?.data.description).toContain('10-player battleground: Warsong Gulch.');
  });

  it('J31 · a 5-player dungeon shows its 1/1/3 comp and what it is missing, and queues the sixth', async () => {
    await g.host.configureCoordinator();
    const made = await g.host.eventUi.slash(g.rook.discordId!, 'create', {
      name: 'Cathedral run',
      instance: 'Scarlet Monastery',
      size: 5,
      start: '2026-10-28 7pm',
      kind: 'dungeon',
      tanks: 1,
      healers: 1,
      dps: 3,
    });
    const reply = (made as { data?: { content?: string } }).data?.content ?? '';
    expect(reply).toContain('(Scarlet Monastery, 5-player dungeon)');
    expect(reply).toContain('looking for 1 tank · 1 healer · 3 DPS');
    const raids = await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list', {});
    const sm = raids.find((r) => r.event.name === 'Cathedral run')!.event;
    expect(sm).toMatchObject({ kind: 'dungeon', size: 5 });

    // A tank answers: the card shows the dungeon's targets, the missing roles, and no buffs.
    await answer(g, g.aeryn, 'aeryn', sm.id, 'accepted');
    await g.host.tick();
    const card = g.host
      .sentTo(SIGNUP_CHANNEL)
      .find((m) => m.message.embeds?.[0]?.title?.includes('Cathedral run'))!.message;
    expect(card.embeds?.[0]?.title).toBe('Dungeon · Cathedral run · Scarlet Monastery');
    const text = messageText(card);
    expect(text).toContain('5-person dungeon');
    expect(text).toMatch(/Tanks 1\/1/);
    expect(text).toMatch(/Healers 0\/1/);
    expect(text).toMatch(/DPS 0\/3/);
    expect(text).toContain('**Missing** 1 healer · 3 dps');
    expect(text).not.toMatch(/MotW|Fort|Mark of the Wild|Fortitude|Arcane Intellect/);

    // Five more answer: the dungeon holds five, so the sixth person in is queued.
    g.host.clock.advance(60 * 1000);
    await answer(g, g.bram, 'bram', sm.id, 'accepted');
    for (const [who, key] of [
      [g.cade, 'cade'],
      [g.dara, 'dara'],
      [g.ana, 'ana'],
      [g.rook, 'rook'],
    ] as const) {
      g.host.clock.advance(60 * 1000);
      await answer(g, who, key, sm.id, 'accepted');
    }
    const sixth = await g.host.ok<Signup | null>(g.rook, 'signup-get', { eventId: sm.id });
    expect(sixth?.queued).toBe(true);
    await g.host.tick();
    const edited = messageText(g.host.editsTo(SIGNUP_CHANNEL).at(-1)!.message);
    expect(edited).toMatch(/\*\*5\*\* going/);
    expect(edited).toMatch(/\*\*1\*\* queued/);
    expect(edited).toMatch(/Queue 1\n1\. .*Rookwood/);
  });

  it('J32 · an open levelling group takes everyone who answers, with no cap and no queue', async () => {
    await g.host.configureCoordinator();
    const made = await g.host.eventUi.slash(g.rook.discordId!, 'create', {
      name: 'Westfall levelling',
      start: '2026-10-28 7pm',
      kind: 'other',
    });
    const reply = (made as { data?: { content?: string } }).data?.content ?? '';
    expect(reply).toContain('Made **Westfall levelling** (open event)');
    const raids = await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list', {});
    const group = raids.find((r) => r.event.name === 'Westfall levelling')!.event;
    expect(group).toMatchObject({ kind: 'other', size: null, instance: '' });

    // Six answer, more than any dungeon holds: all six are in, nobody queues.
    for (const [who, key] of [
      [g.aeryn, 'aeryn'],
      [g.bram, 'bram'],
      [g.cade, 'cade'],
      [g.dara, 'dara'],
      [g.ana, 'ana'],
      [g.rook, 'rook'],
    ] as const) {
      g.host.clock.advance(60 * 1000);
      await answer(g, who, key, group.id, 'accepted');
    }
    const last = await g.host.ok<Signup | null>(g.rook, 'signup-get', { eventId: group.id });
    expect(last?.queued).toBe(false);
    await g.host.tick();
    const card = g.host
      .sentTo(SIGNUP_CHANNEL)
      .find((m) => m.message.embeds?.[0]?.title?.includes('Westfall levelling'))!.message;
    expect(card.embeds?.[0]?.title).toBe('Event · Westfall levelling');
    const text = messageText(card);
    expect(text).toContain('Going 6');
    expect(text).not.toMatch(/Going 6\/|queued|Tanks/);
    expect(text).toContain('**Comp** no gaps');
  });

  it('J24 · a raid leader keeps the calendar right from the quarters: one-offs, moves, pauses, done', async () => {
    const { wed } = await scheduleRaidNights(g);
    const schedules = await g.host.ok<{ id: string }[]>(g.rook, 'schedule-list', {});
    const scheduleId = schedules[0]!.id;
    // Server events are on (as in the test server first): each posted raid shows in Events.
    await g.host.configureCoordinator({ serverEvents: true });
    const serverEvent = (name: string) =>
      [...g.host.discord.serverEvents.values()].find((e) => e.data.name === name);

    // A one-off on Saturday, then moved an hour later: Aeryn's answer comes along.
    const saturday = Date.UTC(2026, 9, 31, 22); // Sat 31 Oct, 18:00 New York
    const alt = await g.host.ok<RaidEvent>(g.rook, 'raid-create', {
      name: 'Alt run',
      instance: 'Barrow Deeps',
      size: 10,
      startsAt: saturday,
    });
    await answer(g, g.aeryn, 'aeryn', alt.id, 'accepted');
    await g.host.ok(g.rook, 'raid-reschedule', { eventId: alt.id, startsAt: saturday + HOUR });
    const moved = await g.host.ok<{ event: RaidEvent }>(g.aeryn, 'raid-get', { eventId: alt.id });
    expect(moved.event.startsAt).toBe(saturday + HOUR);
    expect((await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: alt.id })).status).toBe(
      'accepted',
    );

    // Its server event follows: made after the card, moved with the raid, cancelled with it.
    await g.host.tick(); // the card
    await g.host.tick(); // the server event, linking to the card
    expect(serverEvent('Alt run')).toMatchObject({
      status: ScheduledEventStatus.SCHEDULED,
      data: {
        scheduled_start_time: new Date(saturday + HOUR).toISOString(),
        entity_metadata: { location: 'Barrow Deeps' },
        description: expect.stringContaining(
          `https://discord.com/channels/${DISCORD_GUILD}/${SIGNUP_CHANNEL}/`,
        ),
      },
    });
    expect(serverEvent('Raid night')).toBeDefined();
    await g.host.ok(g.rook, 'raid-reschedule', { eventId: alt.id, startsAt: saturday + 2 * HOUR });
    await g.host.tick();
    expect(serverEvent('Alt run')!.data.scheduled_start_time).toBe(
      new Date(saturday + 2 * HOUR).toISOString(),
    );
    await g.host.ok(g.rook, 'raid-cancel', { eventId: alt.id });
    await g.host.tick();
    await g.host.tick();
    expect(serverEvent('Alt run')!.status).toBe(ScheduledEventStatus.CANCELED);
    expect(g.host.discord.eventCalls.filter((c) => c.data.status)).toHaveLength(1);

    // A week on, a paused schedule creates nothing; resumed, its next two nights appear.
    g.host.clock.advance(7 * DAY);
    await g.host.ok(g.rook, 'schedule-update', { scheduleId, active: false });
    const paused = await g.host.ok<{ created: RaidEvent[] }>(g.rook, 'schedule-materialize', {});
    expect(paused.created).toHaveLength(0);
    await g.host.ok(g.rook, 'schedule-update', { scheduleId, active: true });
    const resumed = await g.host.ok<{ created: RaidEvent[] }>(g.rook, 'schedule-materialize', {});
    expect(resumed.created.map((e) => e.startsAt)).toEqual([
      WED + 7 * DAY + HOUR,
      WED + 8 * DAY + HOUR,
    ]);

    // Last Wednesday has started, so it can be marked done.
    await g.host.ok(g.rook, 'raid-complete', { eventId: wed.id });
    const done = await g.host.ok<{ event: RaidEvent }>(g.aeryn, 'raid-get', { eventId: wed.id });
    expect(done.event.status).toBe('completed');

    // Raiders read the calendar but can't change it.
    const refused = await g.host.run(g.aeryn, 'raid-create', {
      name: 'Mine',
      instance: 'Barrow Deeps',
      size: 10,
      startsAt: saturday + DAY,
    });
    expect(refused).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });
  });
});
