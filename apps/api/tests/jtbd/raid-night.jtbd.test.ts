// JTBD: the raid night (PLAN §6). One test per job in docs/jtbd/raid-night.md; the ids match.
// Each test builds a fresh guild, drives it only through commands and coordinator ticks, and
// checks what members would see in Discord. Extend these when the raid night changes.
import { decodeRaidImport } from '@vintage/bridge-format';
import { buttonLabels, messageText } from '@vintage/coordinator/testing';
import type { Caller } from '@vintage/guild-kit';
import type { RaidEvent, Signup } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHost, DAY, HOUR, type Host, OPS_CHANNEL, ROLES, SIGNUP_CHANNEL } from './host';

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
  });

  it('J06 · a raid leader arranges groups and sees what the comp is missing', async () => {
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

    // One character: Accept answers right away, only Aeryn sees the reply, the post refresh starts.
    const accepted = await ui.click(g.aeryn.discordId!, `signup:${wed.id}:accepted`);
    expect(content(accepted)).toMatch(/Aeryn: \*\*accepted\*\*/);
    expect(flags(accepted)).toBe(64);
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
      data: { custom_id: `signup-note:${wed.id}:late:${g.chars.bram}` },
    });
    await ui.submit(g.bram.discordId!, `signup-note:${wed.id}:late:${g.chars.bram}`, 'after work');
    expect(await g.host.ok<Signup>(g.bram, 'signup-get', { eventId: wed.id })).toMatchObject({
      status: 'late',
      note: 'after work',
    });

    // Two characters: pick one first, and the picker turns into the result.
    await g.host.ok(g.dara, 'character-add', { name: 'Daraheal', class: 'priest', spec: 'holy' });
    const picker = await ui.click(g.dara.discordId!, `signup:${wed.id}:accepted`);
    expect(content(picker)).toMatch(/Which character/);
    const daraChars = await g.host.ok<{ id: string; name: string }[]>(g.dara, 'character-list', {});
    const alt = daraChars.find((c) => c.name === 'Daraheal')!;
    const picked = await ui.pick(g.dara.discordId!, `signup-pick:${wed.id}:accepted`, alt.id);
    expect(picked).toMatchObject({ type: 7, data: { components: [] } });
    expect(content(picked)).toMatch(/Daraheal: \*\*accepted\*\*/);
    // Next time, their signed-up character is used without asking.
    const again = await ui.click(g.dara.discordId!, `signup:${wed.id}:bench`);
    expect(content(again)).toMatch(/Daraheal: \*\*bench\*\*/);

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
});
