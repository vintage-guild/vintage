// JTBD: the raid night (PLAN §6). One test per job in docs/jtbd/raid-night.md; the ids match.
// Each test builds a fresh guild, drives it only through commands and coordinator ticks, and
// checks what members would see in Discord. Extend these when the raid night changes.
import { decodeRaidImport, encodeBridge, type RaidExport } from '@vintage/bridge-format';
import luaMade from '@vintage/bridge-format/fixtures/lua-made.json';
import { buttonLabels, messageText } from '@vintage/coordinator/testing';
import { type Interaction, InteractionType, ScheduledEventStatus } from '@vintage/discord-kit';
import type { Caller } from '@vintage/guild-kit';
import type { Progress } from '@vintage/progress/contract';
import type { ExportCheck, RaidEvent, Signup } from '@vintage/raids/contract';
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

/** The golden fixture J44 checks (libs/bridge-format fixtures.ts, RAID_NIGHT_EXPORT_FIXTURE). */
const RAID_NIGHT_EXPORT = 'raid-export-night.v1';

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
    // No Roster yet: a new card hides no one. Manage is for raid leaders and officers.
    expect(buttonLabels(posts[0]!.message)).toEqual([
      'Accept',
      'Late',
      'Tentative',
      'Standby',
      'Absent',
      'Manage',
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
    expect(text).toMatch(/Tanks 1\/4\n<:spec_warrior_protection:\d+> Aeryn/);
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

  it('J05 · a raider changes their answer and spec while keeping their signup record', async () => {
    const { wed } = await scheduleRaidNights(g);
    const first = await answer(g, g.cade, 'cade', wed.id, 'tentative');
    g.host.clock.advance(HOUR);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    g.host.clock.advance(HOUR);
    const changed = await answer(g, g.cade, 'cade', wed.id, 'accepted');
    expect(changed.id).toBe(first.id);
    expect(changed.signedUpAt).toBe(first.signedUpAt);
    const list = await g.host.ok<Signup[]>(g.dara, 'signup-list', { eventId: wed.id });
    expect(list.map((s) => s.characterName)).toEqual(['Cadence', 'Aeryn']);

    // Playing another spec for the night, from the private reply's Change spec menu, keeps the
    // signup record too; only the signup's spec and role change.
    const respecced = await g.host.discordUi.pick(
      g.cade.discordId!,
      `signup-spec:${wed.id}`,
      'fire',
    );
    expect(respecced).toMatchObject({ type: 7 });
    const fire = await g.host.ok<Signup>(g.cade, 'signup-get', { eventId: wed.id });
    expect(fire).toMatchObject({ id: first.id, signedUpAt: first.signedUpAt, spec: 'fire' });
    expect(
      (await g.host.ok<Signup[]>(g.dara, 'signup-list', { eventId: wed.id })).map(
        (s) => s.characterName,
      ),
    ).toEqual(['Cadence', 'Aeryn']);
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

  it('J44 · after the raid, the addon’s export reads the same on the site, over MCP, and in Discord', async () => {
    const { wed } = await scheduleRaidNights(g);
    for (const key of ['aeryn', 'bram', 'cade'] as const) {
      await answer(g, g[key], key, wed.id, 'accepted');
    }
    g.host.clock.advance(WED + 4 * HOUR - g.host.clock.now()); // the raid is over
    const before = await g.host.ok<{ signups: Signup[] }>(g.rook, 'raid-get', { eventId: wed.id });

    // The string the addon's own codec wrote (Lua, checked under Lua 5.1 in CI): Aeryn and
    // Bramble raided, Cadence signed up and didn't come, a pick-up from another realm took loot.
    const exportString = luaMade.strings[RAID_NIGHT_EXPORT];
    expect(exportString).toMatch(/^!VIN:1!/);

    // The site: the quarters' Tonight tab reads the last week's raids and the next day's (as
    // the officers page does), picks the one that started last, and runs raid-export-check as
    // the signed-in raid leader. Tonight's own raid is Thursday's by now, the wrong one.
    const now = g.host.clock.now();
    const recent = await g.host.ok<{ event: RaidEvent }[]>(g.rook, 'raid-list', {
      from: now - 7 * DAY,
      to: now + DAY,
      statuses: ['open', 'locked', 'completed'],
    });
    const started = recent.filter((r) => r.event.startsAt <= now);
    expect(recent.map((r) => r.event.id)).toEqual([wed.id, expect.any(String)]);
    const picked = started.sort((a, b) => b.event.startsAt - a.event.startsAt)[0]!.event;
    expect(picked.id).toBe(wed.id);
    const site = await g.host.run(g.rook, 'raid-export-check', {
      exportString,
      eventId: picked.id,
    });
    expect(site).toMatchObject({ success: true });
    const check = site.data as ExportCheck;
    expect(check.event).toMatchObject({ id: wed.id, name: 'Raid night' });
    // The export was taken that night, so nothing about the match is in doubt.
    expect(check.warnings).toEqual([]);
    expect(check.declinedButSeen).toEqual([]);
    expect(check.attendees.map((a) => [a.name, a.snapshots, a.characterId])).toEqual([
      ['Aeryn', 3, g.chars.aeryn],
      ['Bramble', 3, g.chars.bram],
      ['Doran-Stonemaul', 2, null],
    ]);
    expect(check.unknownNames).toEqual(['Doran-Stonemaul']);
    expect(check.absent.map((a) => a.characterName)).toEqual(['Cadence']);
    expect(check.loot.map((l) => [l.itemName ?? l.itemId, l.looter, l.characterId])).toEqual([
      ['Arcanist Boots', 'Bramble', g.chars.bram],
      ['Lava Core', 'Doran-Stonemaul', null],
    ]);

    // MCP: the same command, listed for raid leaders and not for raiders, with the same answer.
    expect(await g.host.mcp.tools(g.rook.discordId!)).toContain('raid-export-check');
    expect(await g.host.mcp.tools(g.aeryn.discordId!)).not.toContain('raid-export-check');
    const mcp = await g.host.mcp.call(g.rook.discordId!, 'raid-export-check', {
      exportString,
      eventId: wed.id,
    });
    expect(mcp.data).toEqual(check);
    expect(mcp.reasoning).toBe(site.reasoning);

    // Discord: the raid leader picks last night's raid from the suggestions, then pastes.
    const suggested = (await g.host.eventUi.autocomplete(g.rook.discordId!, 'raid')) as {
      data: { choices: { name: string; value: string }[] };
    };
    expect(suggested.data.choices[0]).toEqual({
      name: 'Raid night · Wed, Oct 28, 8:00 PM',
      value: wed.id,
    });
    const reply = (await g.host.eventUi.slash(g.rook.discordId!, 'check-export', {
      export: exportString!,
      event: suggested.data.choices[0]!.value,
    })) as { data: { content: string; flags: number } };
    expect(reply.data.flags & 64).toBe(64); // private
    const said = reply.data.content;
    expect(said).toContain('**Raid night** · ');
    expect(said).not.toContain('⚠️');
    expect(said).toContain('3 snapshots: start 3 · Lucifron 3 (1 offline) · end 2');
    expect(said).toContain('Seen: Aeryn (3/3), Bramble (3/3), Doran-Stonemaul (2/3)');
    expect(said).toContain('Not signed up: Doran-Stonemaul');
    expect(said).toContain('Signed up but not seen: Cadence');
    expect(said).toContain(
      'Loot: Arcanist Boots → Bramble (Lucifron), Lava Core ×2 → Doran-Stonemaul',
    );
    expect(said).toMatch(/Nothing was recorded\.$/);

    // Suggestions are for raid leaders too: a raider, a Discord-only friend, and someone Random
    // doesn't know get none.
    const friend = await g.host.discordMember('500000000000000099', 'Fen', [ROLES.friend]);
    for (const discordId of [g.aeryn.discordId!, friend.discordId!, '500000000000000098']) {
      const offered = (await g.host.eventUi.autocomplete(discordId, '')) as {
        data: { choices: unknown[] };
      };
      expect(offered.data.choices, discordId).toEqual([]);
    }

    // A raider can't run it from Discord either, and nothing anywhere was recorded.
    const raider = (await g.host.eventUi.slash(g.aeryn.discordId!, 'check-export', {
      export: exportString!,
    })) as { data: { content: string } };
    expect(raider.data.content).toContain('needs the Raid Leader rank');
    const after = await g.host.ok<{ signups: Signup[] }>(g.rook, 'raid-get', { eventId: wed.id });
    expect(after.signups).toEqual(before.signups);
  });

  it('J46 · an officer records the addon’s export: attendance and loot are kept and the raid is done', async () => {
    const { wed } = await scheduleRaidNights(g);
    for (const key of ['aeryn', 'bram', 'cade'] as const) {
      await answer(g, g[key], key, wed.id, 'accepted');
    }
    g.host.clock.advance(WED + 4 * HOUR - g.host.clock.now()); // the raid is over
    const exportString = luaMade.strings[RAID_NIGHT_EXPORT]!;
    const input = { exportString, eventId: wed.id };

    // Officers record; raid leaders only check. Over MCP it's listed the same way.
    expect(await g.host.run(g.rook, 'raid-export-record', input)).toMatchObject({
      success: false,
      error: { code: 'COMMAND_NOT_FOUND' },
    });
    expect(await g.host.mcp.tools(g.ana.discordId!)).toContain('raid-export-record');
    expect(await g.host.mcp.tools(g.rook.discordId!)).not.toContain('raid-export-record');

    // The preview says what will be kept before anything is.
    const preview = await g.host.preview<{
      completes: boolean;
      replaces: unknown;
      attendance: unknown[];
      drops: unknown[];
      check: ExportCheck;
    }>(g.ana, 'raid-export-record', input);
    expect(preview).toMatchObject({ completes: true, replaces: null });
    expect([preview.attendance.length, preview.drops.length]).toEqual([3, 2]);
    expect(preview.check.absent.map((a) => a.characterName)).toEqual(['Cadence']);
    expect(
      (await g.host.ok<{ record: unknown }>(g.aeryn, 'attendance-list', { eventId: wed.id }))
        .record,
    ).toBeNull();
    const recorded = await g.host.run(g.ana, 'raid-export-record', input);
    expect(recorded).toMatchObject({
      success: true,
      reasoning: 'Recorded Raid night: 3 attended, 2 drops; completes Raid night',
    });

    // Raiders see who came, and members what dropped; the raid is done.
    const { attendance } = await g.host.ok<{
      attendance: { name: string; characterId: string | null; snapshots: number }[];
    }>(g.aeryn, 'attendance-list', { eventId: wed.id });
    expect(attendance.map((a) => [a.name, a.characterId, a.snapshots])).toEqual([
      ['Aeryn', g.chars.aeryn, 3],
      ['Bramble', g.chars.bram, 3],
      ['Doran-Stonemaul', null, 2],
    ]);
    const { drops } = await g.host.ok<{
      drops: { itemName: string | null; looter: string; count: number }[];
    }>(g.pip, 'loot-list', { eventId: wed.id });
    expect(drops.map((d) => [d.itemName, d.looter, d.count])).toEqual([
      ['Arcanist Boots', 'Bramble', 1],
      ['Lava Core', 'Doran-Stonemaul', 2],
    ]);
    const raid = await g.host.ok<{ event: RaidEvent }>(g.aeryn, 'raid-get', { eventId: wed.id });
    expect(raid.event.status).toBe('completed');

    // Pasting the same export again keeps what's there.
    expect(await g.host.run(g.ana, 'raid-export-record', input)).toMatchObject({
      success: true,
      data: { unchanged: true },
    });
  });

  it('J47 · the night’s first kills land on the ledger, and Random posts the raid summary', async () => {
    // Barrow Deeps on Thu 10 Dec, 20:00 New York, made the day before.
    const night = Date.UTC(2026, 11, 11, 1);
    g.host.clock.advance(night - DAY - g.host.clock.now());
    await g.host.configureCoordinator();
    const raid = await g.host.ok<RaidEvent>(g.rook, 'raid-create', {
      name: 'Barrow Deeps',
      instance: 'Barrow Deeps',
      size: 10,
      startsAt: night,
    });
    for (const key of ['aeryn', 'bram'] as const) {
      await answer(g, g[key], key, raid.id, 'accepted');
    }
    await g.host.tick(); // the signup card goes up
    g.host.clock.advance(night + 4 * HOUR - g.host.clock.now()); // the raid is over

    const S = night / 1000;
    const attempt = (name: string, from: number, minutes: number, killed: boolean) => ({
      name,
      startedAt: S + from * 60,
      endedAt: S + (from + minutes) * 60,
      killed,
      size: 10,
    });
    const exported = (exportedAt: number): RaidExport => ({
      v: 1,
      kind: 'raid-export',
      exportedAt,
      addonVersion: '0.2.0',
      exporter: 'Aeryn',
      attendance: [
        {
          at: S + 60,
          label: 'start',
          members: ['Aeryn', 'Bramble'].map((name) => ({ name, group: 1, online: true })),
        },
      ],
      loot: [{ itemId: 16_800, looter: 'Bramble', at: S + 26 * 60, source: 'Chillhowl' }],
      items: [{ itemId: 16_800, name: 'Arcanist Boots', quality: 4 }],
      encounters: [
        attempt('Chillhowl', 10, 4, false),
        attempt('Chillhowl', 20, 5, true),
        attempt('Elder Tangleclaw', 40, 6, true),
        attempt('Khalith the Dreadspinner', 60, 3, false),
        attempt('Khalith the Dreadspinner', 70, 2, false),
        attempt('Gloomfang', 90, 4, true),
      ],
    });
    const encode = (payload: RaidExport) => {
      const encoded = encodeBridge(payload);
      if (!encoded.ok) throw new Error(encoded.error.message);
      return encoded.value;
    };
    const input = { exportString: encode(exported(S + 3 * 3600)), eventId: raid.id };

    // The preview says which kills go on the ledger, and which the ledger has no boss for.
    const preview = await g.host.preview<{
      kills: { name: string; bossId: string | null }[];
    }>(g.ana, 'raid-export-record', input);
    expect(preview.kills.map((k) => [k.name, k.bossId])).toEqual([
      ['Chillhowl', 'chillhowl'],
      ['Elder Tangleclaw', 'elder-tangleclaw'],
      ['Gloomfang', null],
    ]);
    const recorded = await g.host.run(g.ana, 'raid-export-record', input);
    expect(recorded).toMatchObject({ success: true });
    expect(recorded.reasoning).toMatch(
      /; 2 first kills on the ledger; 1 kill matched no boss \(Gloomfang\)$/,
    );

    // Every member's ledger fills, through progress's own kill-record.
    const ledger = await g.host.ok<Progress>(g.pip, 'progress-get');
    const barrow = ledger.raids.find((r) => r.id === 'barrow-deeps')!;
    expect([barrow.killed, barrow.total, barrow.nextBossId]).toEqual([2, 8, 'khalith']);
    expect(barrow.bosses[0]).toMatchObject({ id: 'chillhowl', firstKillAt: (S + 25 * 60) * 1000 });

    // The next tick posts the summary under the card, once.
    await g.host.tick();
    await g.host.tick();
    const posts = g.host.sentTo(SIGNUP_CHANNEL);
    const summaries = posts.filter((m) => messageText(m.message).startsWith('Raid summary'));
    expect(summaries).toHaveLength(1);
    const text = messageText(summaries[0]!.message);
    expect(text).toContain('Raid summary · Barrow Deeps · Barrow Deeps');
    expect(text).toContain('**Bosses: 2/8, 3 wipes, 1h 24m**');
    expect(text).toContain('Came · 2\nAeryn, Bramble');
    expect(text).toContain('Loot · 1\nArcanist Boots → Bramble');
    expect(posts.indexOf(summaries[0]!)).toBeGreaterThan(0); // after the card

    // The same string again changes nothing; a later export of the night adds no kills and
    // edits the summary in place.
    expect(await g.host.run(g.ana, 'raid-export-record', input)).toMatchObject({
      data: { unchanged: true },
    });
    const later = await g.host.run(g.ana, 'raid-export-record', {
      exportString: encode({
        ...exported(S + 4 * 3600),
        loot: [],
      }),
      eventId: raid.id,
    });
    expect((later.data as { ledger: { outcome: string }[] }).ledger.map((k) => k.outcome)).toEqual([
      'duplicate',
      'duplicate',
      'unmatched',
    ]);
    expect(
      (await g.host.deps.progress.listKills(g.ana.guildId, { raidId: 'barrow-deeps' })).length,
    ).toBe(2);
    await g.host.tick();
    const edits = g.host
      .editsTo(SIGNUP_CHANNEL)
      .filter((m) => m.messageId === summaries[0]!.messageId);
    expect(edits).toHaveLength(1);
    expect(messageText(edits[0]!.message)).toContain('Loot · 0\nNothing dropped');
    expect(
      g.host
        .sentTo(SIGNUP_CHANNEL)
        .filter((m) => messageText(m.message).startsWith('Raid summary')),
    ).toHaveLength(1);
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
        expect.objectContaining({ rule: 'remind-30h', target: SIGNUP_CHANNEL, status: 'sent' }),
        expect.objectContaining({ rule: 'dm-30h', target: g.bram.memberId, status: 'sent' }),
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
      error: { code: 'FORBIDDEN' },
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
    expect(friend.tier).toBe('friend');
    // Friends see only open raids, never guild raids.
    expect(await g.host.ok(friend, 'raid-list', {})).toEqual([]);
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

  it('J12 · a raider who will be late says so, with how late everyone can see', async () => {
    const { wed } = await scheduleRaidNights(g);
    await g.host.ok(g.ana, 'signup-set', {
      eventId: wed.id,
      characterId: g.chars.ana,
      status: 'late',
      lateMinutes: 15,
      note: 'after work, ~20 min',
    });
    await g.host.tick();
    const text = messageText(g.host.editsTo(SIGNUP_CHANNEL).at(-1)!.message);
    // Late still takes a spot: listed with the healers, marked late with minutes.
    expect(text).toMatch(/Healers 1\/10\n<:spec_paladin_holy:\d+> Anarra <:status_late:\d+> 15m/);
    g.host.clock.advance(WED - 24 * HOUR - g.host.clock.now());
    await g.host.tick();
    const digest = g.host.sentTo(OPS_CHANNEL).find((m) => m.message.content?.includes('confirmed'));
    expect(digest?.message.content).toMatch(/Late \(1\): Anarra 15m \(after work, ~20 min\)/);
  });

  it('J13 · when a raid is full, comp-based seating decides and no one is auto-promoted', async () => {
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
    expect(eleventh?.queued).toBe(false);
    await g.host.tick();
    // Someone drops out: no automatic queue promotion happens; seats are the leaders' call.
    const third = await g.host.ok<Signup>(people[2]!, 'signup-get', { eventId: raid.id });
    await g.host.ok(people[2]!, 'signup-set', {
      eventId: raid.id,
      characterId: third.characterId,
      status: 'declined',
    });
    await g.host.tick();
    const notices = g.host
      .sentTo(SIGNUP_CHANNEL)
      .filter((m) => m.message.content?.includes('a spot opened up'));
    expect(notices).toHaveLength(0);
  });

  it('J19 · on raid day, the site says when signups lock, what to bring, and where I am in line', async () => {
    const { wed } = await scheduleRaidNights(g);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    const [next] = await g.host.ok<{ event: RaidEvent; myStatus: string; locksAt: number }[]>(
      g.aeryn,
      'raid-list',
      {},
    );
    expect(next).toMatchObject({ myStatus: 'accepted', locksAt: wed.startsAt - 2 * HOUR });

    // What to bring: Rook writes the raid's notes; the card the site reads carries them, and the
    // Discord post is edited to show them.
    const notes = 'Fire resist and flasks.\n\nOn at 7:45 for buffs.';
    await g.host.ok(g.rook, 'raid-update', { eventId: wed.id, notes });
    const [noted] = await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list', {});
    expect(noted?.event).toMatchObject({ id: wed.id, startsAt: wed.startsAt, notes });
    const editsBefore = g.host.editsTo(SIGNUP_CHANNEL).length;
    await g.host.tick();
    const edits = g.host.editsTo(SIGNUP_CHANNEL);
    expect(edits.length).toBeGreaterThan(editsBefore);
    const card = edits.at(-1)!.message.embeds?.[0]?.description ?? '';
    expect(card).toContain('> Fire resist and flasks.\n\n> On at 7:45 for buffs.');
    // A raider can read the notes but not change them.
    expect(
      await g.host.run(g.aeryn, 'raid-update', { eventId: wed.id, notes: 'mine' }),
    ).toMatchObject({ error: { code: 'COMMAND_NOT_FOUND' } });

    // A full dungeon: the sixth and seventh to answer wait in line, and the list says where.
    const sm = await g.host.ok<RaidEvent>(g.rook, 'raid-create', {
      name: 'Cathedral run',
      instance: 'Scarlet Monastery',
      kind: 'dungeon',
      size: 5,
      startsAt: WED,
      roleTargets: { tank: 1, healer: 1, dps: 3 },
    });
    const order: [Caller, string][] = [
      [g.ana, 'ana'],
      [g.rook, 'rook'],
      [g.aeryn, 'aeryn'],
      [g.bram, 'bram'],
      [g.cade, 'cade'],
      [g.dara, 'dara'],
    ];
    for (const [who, key] of order) {
      await answer(g, who, key, sm.id, 'accepted');
      g.host.clock.advance(60 * 1000);
    }
    const rows = await g.host.ok<(Signup & { queuePosition: number | null })[]>(
      g.dara,
      'signup-list',
      { eventId: sm.id },
    );
    expect(rows.every((s) => s.queuePosition === null)).toBe(true);
    const got = await g.host.ok<{ locksAt: number }>(g.dara, 'raid-get', { eventId: sm.id });
    expect(got.locksAt).toBe(WED - 2 * HOUR);
  });

  it('J14 · signedUpAt stays as a record when changing answers (no place in line)', async () => {
    const { wed } = await scheduleRaidNights(g);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    g.host.clock.advance(HOUR);
    await answer(g, g.cade, 'cade', wed.id, 'accepted');
    g.host.clock.advance(HOUR);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'tentative');
    g.host.clock.advance(HOUR);
    await answer(g, g.aeryn, 'aeryn', wed.id, 'accepted');
    const list = await g.host.ok<Signup[]>(g.dara, 'signup-list', { eventId: wed.id });
    expect(list.map((x) => x.characterName)).toEqual(['Aeryn', 'Cadence']);
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
    // Switch character (with one character, it still offers New character…), Change spec (the
    // warrior's specs with their roles), and Role.
    expect(menus(accepted).map((m) => m.custom_id)).toEqual([
      `signup-char:${wed.id}`,
      `signup-spec:${wed.id}`,
      `signup-role:${wed.id}`,
      `signup-also:${wed.id}`,
    ]);
    expect(menus(accepted)[0]!.options.map((o) => o.label)).toEqual(['Aeryn', 'New character…']);
    expect(menus(accepted)[1]!.options.map((o) => `${o.label}: ${o.description}`)).toEqual([
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

    // Late opens 5 / 15 / 30 min buttons; Flex Raider (Bramble) on a guild raid lands on Standby
    // while keeping lateMinutes so leads see how late before seating them.
    const lateAsk = await ui.click(g.bram.discordId!, `signup:${wed.id}:late`);
    expect(content(lateAsk)).toContain('Later than 30 minutes? Press Absent instead.');
    const late = await ui.click(g.bram.discordId!, `signup-late:${wed.id}:${g.chars.bram}:15`);
    expect(await g.host.ok<Signup>(g.bram, 'signup-get', { eventId: wed.id })).toMatchObject({
      status: 'bench',
      lateMinutes: 15,
    });
    expect(content(late)).toMatch(
      /\*\*Standby\*\* for Raid night as \*\*Bramble\*\* \(Holy Priest, healer\): your main\./,
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
      'Add it and sign up with it in one go',
    ]);
    const daraChars = await g.host.ok<{ id: string; name: string }[]>(g.dara, 'character-list', {});
    const alt = daraChars.find((c) => c.name === 'Daraheal')!;
    const picked = await ui.pick(g.dara.discordId!, `signup-pick:${wed.id}:accepted`, alt.id);
    expect(picked).toMatchObject({ type: 7 });
    expect(content(picked)).toMatch(/\*\*Accepted\*\* for Raid night as \*\*Daraheal\*\*/);
    expect(menus(picked).map((m) => m.custom_id)).toEqual([
      `signup-char:${wed.id}`,
      `signup-spec:${wed.id}`,
      `signup-role:${wed.id}`,
      `signup-also:${wed.id}`,
    ]);
    // Next time, their signed-up character is used without asking.
    const again = await ui.click(g.dara.discordId!, `signup:${wed.id}:bench`);
    expect(content(again)).toMatch(/\*\*Standby\*\* for Raid night as \*\*Daraheal\*\*/);
    expect(content(again)).toMatch(/your signup for this raid/);
    // Marking absent offers only "Absent more days" (no character/spec/role menus, J57).
    expect(
      menus(await ui.click(g.dara.discordId!, `signup:${wed.id}:declined`)).map((m) => m.custom_id),
    ).toEqual(['absence-more-days']);

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

    // Thursday, the same schedule: her main still wins over last night (the main is set on
    // purpose; Bloodfen, 2026-10-27), so she switches again.
    expect(content(await ui.click(g.aeryn.discordId!, `signup:${thu.id}:accepted`))).toMatch(
      /as \*\*Aeryn\*\* .*: your main\./,
    );
    const thursday = await ui.pick(g.aeryn.discordId!, `signup-char:${thu.id}`, bark);
    expect(content(thursday)).toMatch(/as \*\*Aerbark\*\* \(Feral Druid, tank\)\./);
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
    expect(content(await ui.click(g.aeryn.discordId!, `signup:${thu.id}:late`))).toContain(
      'Later than 30 minutes? Press Absent instead.',
    );
    await ui.click(g.aeryn.discordId!, `signup-late:${thu.id}:${bark}:15`);
    expect(await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: thu.id })).toMatchObject({
      status: 'late',
      lateMinutes: 15,
      spec: 'feral',
    });
    await ui.pick(g.aeryn.discordId!, `signup-char:${thu.id}`, g.chars.aeryn!);
    expect(await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: thu.id })).toMatchObject({
      characterName: 'Aeryn',
      spec: 'protection',
      role: 'tank',
      status: 'late',
    });

    // With no main, history decides: Cade removed his main and keeps two alts. Wednesday he
    // picks one; Thursday (the same schedule) Accept uses it and says why.
    const cadebark = (
      await g.host.ok<{ id: string }>(g.cade, 'character-add', {
        name: 'Cadebark',
        class: 'druid',
        spec: 'balance',
      })
    ).id;
    await g.host.ok(g.cade, 'character-add', {
      name: 'Cadeshot',
      class: 'hunter',
      spec: 'survival',
    });
    await g.host.ok(g.cade, 'character-remove', { characterId: g.chars.cade });
    expect(content(await ui.click(g.cade.discordId!, `signup:${wed.id}:accepted`))).toMatch(
      /Which character/,
    );
    await ui.pick(g.cade.discordId!, `signup-pick:${wed.id}:accepted`, cadebark);
    expect(content(await ui.click(g.cade.discordId!, `signup:${thu.id}:accepted`))).toMatch(
      /as \*\*Cadebark\*\* \(Balance Druid, ranged DPS\): your last Molten Core night\./,
    );
  });

  it('J40 · a raider manages their characters from Discord and signs up with a new alt', async () => {
    const { wed } = await scheduleRaidNights(g);
    const chars = g.host.characterUi;
    const ui = g.host.discordUi;
    const dara = g.dara.discordId!;
    const content = (r: unknown) => (r as { data?: { content?: string } }).data?.content ?? '';
    const choices = (r: unknown) =>
      ((r as { data?: { choices?: { name: string; value: string }[] } }).data?.choices ?? []).map(
        (c) => c.value,
      );

    // Spec suggestions follow the class chosen so far; names come from her own characters.
    expect(
      choices(
        await chars.autocomplete(dara, 'add', { name: 'spec', value: 'm' }, { class: 'hunter' }),
      ),
    ).toEqual(['beast-mastery', 'marksmanship']);
    expect(choices(await chars.autocomplete(dara, 'main', { name: 'name', value: '' }))).toEqual([
      'Daralis',
    ]);

    // add, list, main: private replies in the commands' words. A typed spec is still checked.
    expect(
      content(
        await chars.slash(dara, 'add', { name: 'darashot', class: 'hunter', spec: 'Survival' }),
      ),
    ).toBe('Added **Darashot** (Survival Hunter, ranged DPS). It shows in the signup picker now.');
    expect(
      content(await chars.slash(dara, 'add', { name: 'Darax', class: 'hunter', spec: 'holy' })),
    ).toMatch(/"holy" is not a hunter spec/);
    const listed = await chars.slash(dara, 'list');
    expect(content(listed)).toContain('**Daralis** · Combat Rogue, melee DPS · main');
    expect(content(listed)).toContain('**Darashot** · Survival Hunter, ranged DPS');
    expect(listed).toMatchObject({ data: { flags: 64 } });
    expect(content(await chars.slash(dara, 'main', { name: 'darashot' }))).toMatch(
      /\*\*Darashot\*\* is your main now/,
    );
    expect(content(await chars.slash(dara, 'main', { name: 'Anarra' }))).toMatch(
      /no character called/,
    );

    // remove asks first, privately, with a Remove button; the click removes it.
    const preview = await chars.slash(dara, 'remove', { name: 'Daralis' });
    expect(content(preview)).toMatch(/Remove \*\*Daralis\*\*.*can't be undone/);
    const confirm = JSON.stringify(preview).match(/"custom_id":"(char-rm:[^"]+)"/)![1]!;
    expect(confirm).toBe(`char-rm:${g.chars.dara}`);
    expect(await g.host.ok<unknown[]>(g.dara, 'character-list', {})).toHaveLength(2);
    // Someone else's click finds nothing of theirs to remove.
    expect(content(await chars.click(g.cade.discordId!, confirm))).toMatch(/No such character/);
    expect(content(await chars.click(dara, confirm))).toBe('Removed **Daralis**.');
    expect(await g.host.ok<unknown[]>(g.dara, 'character-list', {})).toHaveLength(1);

    // She answers Wednesday with her main, then brings a new alt from Switch character: the
    // form saves it and signs up with it in one step, keeping her place in line.
    expect(content(await ui.click(dara, `signup:${wed.id}:accepted`))).toMatch(
      /as \*\*Darashot\*\* .*: your main\./,
    );
    const first = await g.host.ok<Signup>(g.dara, 'signup-get', { eventId: wed.id });
    g.host.clock.advance(HOUR);
    const form = await ui.pick(dara, `signup-char:${wed.id}`, 'new');
    expect(form).toMatchObject({ type: 9, data: { custom_id: `signup-new:${wed.id}:accepted` } });
    const made = await ui.submitNewCharacter(dara, `signup-new:${wed.id}:accepted`, {
      name: 'darafury',
      class: 'warrior',
      spec: 'fury',
    });
    expect(content(made)).toMatch(
      /\*\*Accepted\*\* for Raid night as \*\*Darafury\*\* \(Fury Warrior, melee DPS\): your new character\./,
    );
    expect(await g.host.ok<Signup>(g.dara, 'signup-get', { eventId: wed.id })).toMatchObject({
      id: first.id,
      characterName: 'Darafury',
      signedUpAt: first.signedUpAt,
    });
    // A wrong spec for the class is refused by the command, and nothing is saved.
    const wrong = await ui.submitNewCharacter(dara, `signup-new:${wed.id}:accepted`, {
      name: 'Daraheal',
      class: 'mage',
      spec: 'holy',
    });
    expect(content(wrong)).toMatch(/"holy" is not a mage spec.*\n.*New character…/s);
    expect(await g.host.ok<unknown[]>(g.dara, 'character-list', {})).toHaveLength(2);

    // Someone with no characters goes straight to the form; Tentative asks for its note there too.
    const newcomer = await g.host.discordMember('500000000000000099', 'Newt', [ROLES.raider]);
    const straight = await ui.click(newcomer.discordId!, `signup:${wed.id}:tentative`);
    expect(straight).toMatchObject({
      type: 9,
      data: { custom_id: `signup-new:${wed.id}:tentative` },
    });
    await ui.submitNewCharacter(newcomer.discordId!, `signup-new:${wed.id}:tentative`, {
      name: 'Newt',
      class: 'priest',
      spec: 'holy',
      note: 'after work',
    });
    expect(await g.host.ok<Signup>(newcomer, 'signup-get', { eventId: wed.id })).toMatchObject({
      characterName: 'Newt',
      status: 'tentative',
      note: 'after work',
    });

    // Friends can manage their own characters (for open raids); unranked/unknown accounts cannot.
    const friend = await g.host.discordMember('500000000000000098', 'Pal', [ROLES.friend]);
    expect(content(await chars.slash(friend.discordId!, 'list'))).toMatch(/No characters yet/);
    expect(content(await chars.slash('999', 'list'))).toMatch(/I don't know you yet/);
  });

  it('J41 · a Fury warrior signs up to tank a dungeon', async () => {
    await g.host.configureCoordinator();
    const chars = g.host.characterUi;
    const ui = g.host.discordUi;
    const aeryn = g.aeryn.discordId!;
    const content = (r: unknown) => (r as { data?: { content?: string } }).data?.content ?? '';
    await g.host.eventUi.slash(g.rook.discordId!, 'create', {
      name: 'Cathedral run',
      instance: 'Scarlet Monastery',
      size: 5,
      start: '2026-10-28 7pm',
      kind: 'dungeon',
      tanks: 1,
      healers: 1,
      dps: 3,
    });
    const raids = await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list', {});
    const sm = raids.find((r) => r.event.name === 'Cathedral run')!.event;

    // Her Fury warrior is a guessed melee DPS. She brings it, then picks Tank for this run.
    await chars.slash(aeryn, 'add', { name: 'Aerfury', class: 'warrior', spec: 'fury' });
    await ui.click(aeryn, `signup:${sm.id}:accepted`);
    const fury = (
      await g.host.ok<{ id: string; name: string }[]>(g.aeryn, 'character-list', {})
    ).find((c) => c.name === 'Aerfury')!;
    const switched = await ui.pick(aeryn, `signup-char:${sm.id}`, fury.id);
    const role = menus(switched).find((m) => m.custom_id === `signup-role:${sm.id}`)!;
    expect(role.options.find((o) => o.default)?.label).toBe('Guess from the spec (Melee DPS)');
    const tanking = await ui.pick(aeryn, `signup-role:${sm.id}`, 'tank');
    expect(content(tanking)).toMatch(/as \*\*Aerfury\*\* \(Fury Warrior, tank\)/);
    expect(
      menus(tanking)
        .find((m) => m.custom_id === `signup-role:${sm.id}`)!
        .options.find((o) => o.default)?.label,
    ).toBe('Tank');

    // A spec change keeps the picked role; the saved warrior stays a melee DPS.
    await ui.pick(aeryn, `signup-spec:${sm.id}`, 'arms');
    expect(await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: sm.id })).toMatchObject({
      spec: 'arms',
      role: 'tank',
      rolePicked: true,
    });
    expect(
      (await g.host.ok<{ id: string; role: string }[]>(g.aeryn, 'character-list', {})).find(
        (c) => c.id === fury.id,
      ),
    ).toMatchObject({ role: 'melee' });

    // The card counts her as the tank, and the next person's picker no longer says tanks needed.
    await g.host.tick();
    const card = g.host
      .sentTo(SIGNUP_CHANNEL)
      .concat(g.host.editsTo(SIGNUP_CHANNEL))
      .filter((m) => m.message.embeds?.[0]?.title?.includes('Cathedral run'))
      .at(-1)!.message;
    expect(messageText(card)).toMatch(/Tanks 1\/1/);

    // Thorg saves his Fury warrior as a tank once; every signup then starts as a tank.
    const thorg = await g.host.discordMember('500000000000000097', 'Thorg', [ROLES.raider]);
    expect(
      content(
        await chars.slash(thorg.discordId!, 'add', {
          name: 'Thorg',
          class: 'warrior',
          spec: 'fury',
          role: 'tank',
        }),
      ),
    ).toBe('Added **Thorg** (Fury Warrior, tank) as your main. It shows in the signup picker now.');
    const thorgReply = await ui.click(thorg.discordId!, `signup:${sm.id}:accepted`);
    expect(content(thorgReply)).toMatch(/as \*\*Thorg\*\* \(Fury Warrior, tank\): your main\./);
    // Aeryn is the dungeon's tank, so Thorg's menus don't call for one.
    expect(JSON.stringify(menus(thorgReply))).not.toContain('tanks needed');

    // "Guess from the spec" puts Aeryn back to following Arms: melee DPS.
    await ui.pick(aeryn, `signup-role:${sm.id}`, 'guess');
    expect(await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: sm.id })).toMatchObject({
      spec: 'arms',
      role: 'melee',
      rolePicked: false,
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

  it('J45 · a raid leader makes a dungeon from the New event form, changes the comp, and posts it', async () => {
    await g.host.configureCoordinator();
    const rook = g.rook.discordId!;
    const ui = g.host.eventUi;
    type Seen = {
      type: number;
      data: {
        title?: string;
        content?: string;
        embeds?: {
          title?: string;
          fields?: { name: string; value: string }[];
          footer?: { text: string };
        }[];
        components?: {
          label?: string;
          component?: {
            type: number;
            custom_id: string;
            value?: string;
            options?: { label: string; value: string; default?: boolean }[];
          };
          components?: { type?: number; label?: string; custom_id: string; disabled?: boolean }[];
        }[];
      };
    };
    const seen = (r: unknown) => r as Seen;
    const field = (r: unknown, name: string) =>
      seen(r).data.embeds?.[0]?.fields?.find((f) => f.name === name)?.value ?? '';
    const input = (r: unknown, id: string) =>
      seen(r).data.components?.find((c) => c.component?.custom_id === id)?.component;
    const buttons = (r: unknown) =>
      (seen(r).data.components ?? [])
        .flatMap((row) => row.components ?? [])
        .filter((c) => c.type === 2);
    const message = (r: unknown) => ({ id: 'preview', embeds: seen(r).data.embeds ?? [] });
    // Selects come back as lists, radio groups (`{ radio }`) as one value, boxes as text.
    type Answer = string | string[] | { radio: string };
    const submit = (customId: string, fields: Record<string, Answer>, from?: unknown) =>
      ui.form(rook, {
        type: 5,
        data: {
          custom_id: customId,
          components: Object.entries(fields).map(([id, v]) => ({
            type: 18,
            component: Array.isArray(v)
              ? { type: 3, custom_id: id, values: v }
              : typeof v === 'object'
                ? { type: 21, custom_id: id, value: v.radio }
                : { type: 4, custom_id: id, value: v },
          })),
        },
        ...(from ? { message: message(from) } : {}),
      });
    const click = (customId: string, from: unknown) =>
      ui.form(rook, { data: { custom_id: customId, component_type: 2 }, message: message(from) });
    const choose = (customId: string, values: string[], from: unknown) =>
      ui.form(rook, {
        data: { custom_id: customId, component_type: 3, values },
        message: message(from),
      });

    // The bare command opens the New event form, in the guild's clock.
    const form = await ui.form(rook, {
      type: 2,
      data: {
        name: 'vintage',
        options: [{ name: 'event', type: 2, options: [{ name: 'create', type: 1, options: [] }] }],
      },
    });
    expect(seen(form).data.title).toBe('New event');
    expect(seen(form).data.components?.map((c) => c.label)).toEqual([
      'Name',
      'Kind',
      'Where',
      'Date',
      'Time (New York)',
    ]);
    // Kind is a radio group; the date offers the next 25 days from today (Saturday), and the
    // time starts on the guild's usual 8:00 PM from its Wednesday schedule.
    expect(input(form, 'kind')?.type).toBe(21);
    const dates = input(form, 'date')?.options ?? [];
    expect(dates.slice(0, 2).map((d) => d.label)).toEqual(['Today', 'Tomorrow']);
    expect(dates.find((d) => d.value === '2026-10-28')?.label).toBe('Wed, Oct 28');
    expect(input(form, 'time')?.options?.find((t) => t.default)).toMatchObject({
      label: '8:00 PM',
      value: '20:00',
    });

    // Stage 1: a dungeon on Wednesday at 7:00 PM, then Set up event.
    const first = await submit('evform:new', {
      name: 'Cathedral run',
      kind: { radio: 'dungeon' },
      where: 'Scarlet Monastery',
      date: ['2026-10-28'],
      time: ['19:00'],
    });
    expect(field(first, 'Roles')).toBe('1 tank · 1 healer · 3 DPS (the usual comp)');
    expect(field(first, 'Length')).toBe('3 hours');
    expect(field(first, 'Access')).toBe('Guild only');
    expect(buttons(first).map((b) => b.label)).toEqual([
      'Set up event',
      'Edit details',
      'Open to pugs: Off',
      'Cancel',
    ]);
    // Today at noon has already gone by (it's Saturday noon), so the preview says so.
    const gone = await submit('evform:new', {
      name: 'Cathedral run',
      kind: { radio: 'dungeon' },
      where: 'Scarlet Monastery',
      date: ['2026-10-24'],
      time: ['12:00'],
    });
    expect(field(gone, 'Fix before posting')).toContain('already passed');

    // Stage 2 is built for a dungeon: its one size in the title, tanks/healers/melee/ranged.
    const details = await click('evform:next', first);
    expect(seen(details).data.title).toBe('Dungeon details (5 players)');
    expect(seen(details).data.components?.map((c) => c.label)).toEqual([
      'Tanks',
      'Healers',
      'Melee',
      'Ranged',
    ]);
    // Rook wants two healers, 1 melee, 1 ranged, then picks 2 hours and opens it to pugs on the preview.
    const comped = await submit(
      'evform:kind:dungeon',
      { tanks: '1', healers: '2', melee: '1', ranged: '1' },
      first,
    );
    const sized = await choose('evform:hours', ['2'], comped);
    const preview = await click('evform:access', sized);
    expect(field(preview, 'Roles')).toBe('1 tank · 2 healers · 1 melee · 1 ranged');
    expect(field(preview, 'Length')).toBe('2 hours');
    expect(field(preview, 'Access')).toBe('Open to pugs');
    expect(buttons(preview)[0]).toMatchObject({ label: 'Post event', disabled: false });
    // Edit details reopens stage 1 with Wednesday and 7:00 PM still picked.
    const edit = await click('evform:edit', preview);
    expect(input(edit, 'date')?.options?.find((d) => d.default)?.value).toBe('2026-10-28');
    expect(input(edit, 'time')?.options?.find((t) => t.default)?.value).toBe('19:00');

    // A start typed weeks ahead (with no name) leads the dates, picked.
    const far = await ui.form(rook, {
      type: 2,
      data: {
        name: 'vintage',
        options: [
          {
            name: 'event',
            type: 2,
            options: [
              {
                name: 'create',
                type: 1,
                options: [{ name: 'start', type: 3, value: '2026-12-24 8pm' }],
              },
            ],
          },
        ],
      },
    });
    expect(input(far, 'date')?.options?.[0]).toMatchObject({
      label: 'Thu, Dec 24',
      value: '2026-12-24',
      default: true,
    });
    expect(input(far, 'time')?.options?.find((t) => t.default)?.label).toBe('8:00 PM');

    // A preview from before the pickers (a v1 draft) asks to start again.
    const old = await ui.form(rook, {
      data: { custom_id: 'evform:post', component_type: 2 },
      message: { id: 'old', embeds: [{ footer: { text: 'Only you can see this draft. v1.e30' } }] },
    });
    expect(seen(old).data.content).toContain('That draft is from an older version');

    // Post event: the dungeon is made, the reply says so, and its card goes up with the comp.
    const posted = await click('evform:post', preview);
    expect(seen(posted).data.content).toContain(
      'Made **Cathedral run** (Scarlet Monastery, 5-player dungeon)',
    );
    expect(seen(posted).data.content).toContain(
      'looking for 1 tank · 2 healers · 1 melee · 1 ranged',
    );
    expect(seen(posted).data.components).toEqual([]);
    await g.host.tick();
    const raids = await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list', {});
    const sm = raids.find((r) => r.event.name === 'Cathedral run')!.event;
    expect(sm).toMatchObject({
      kind: 'dungeon',
      access: 'open',
      size: 5,
      durationMinutes: 120,
      roleTargets: { tank: 1, healer: 2, melee: 1, ranged: 1 },
    });
    const card = g.host
      .sentTo(SIGNUP_CHANNEL)
      .find((m) => m.message.embeds?.[0]?.title?.includes('Cathedral run'))!.message;
    expect(messageText(card)).toMatch(/Healers 0\/2/);

    // A raider can't open the form at all.
    const refused = await ui.form(g.aeryn.discordId!, {
      type: 2,
      data: {
        name: 'vintage',
        options: [{ name: 'event', type: 2, options: [{ name: 'create', type: 1, options: [] }] }],
      },
    });
    expect(seen(refused).data.content).toContain('needs the Raid Leader rank');
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
    expect(text).toMatch(/Melee 0/);
    expect(text).toMatch(/Ranged 0/);
    expect(text).toContain('**Missing** 1 healer · 3 dps');
    expect(text).not.toMatch(/MotW|Fort|Mark of the Wild|Fortitude|Arcane Intellect/);

    // Five more answer: the dungeon holds five, so comp-solver seats five and puts the sixth on Standby.
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
    expect(sixth?.queued).toBe(false);
    await g.host.tick();
    const edited = messageText(g.host.editsTo(SIGNUP_CHANNEL).at(-1)!.message);
    expect(edited).toMatch(/\*\*5\*\* going/);
    expect(edited).toMatch(/\*\*1\*\* standby/);
    expect(edited).toMatch(/\*\*Standby\*\* .*Bramble/);
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
    await g.host.ok(g.rook, 'raid-update', { eventId: alt.id, startsAt: saturday + HOUR });
    const moved = await g.host.ok<{ event: RaidEvent }>(g.aeryn, 'raid-get', { eventId: alt.id });
    expect(moved.event.startsAt).toBe(saturday + HOUR);
    expect((await g.host.ok<Signup>(g.aeryn, 'signup-get', { eventId: alt.id })).status).toBe(
      'accepted',
    );

    // Its server event follows: made after the card, moved with the raid, cancelled with it.
    await g.host.tick(); // the card
    await g.host.tick(); // the server event (without VINTAGE_SITE_URL, points to the card in Discord)
    expect(serverEvent('Alt run')).toMatchObject({
      status: ScheduledEventStatus.SCHEDULED,
      data: {
        scheduled_start_time: new Date(saturday + HOUR).toISOString(),
        entity_metadata: { location: 'Barrow Deeps' },
        description: expect.stringContaining('Sign up on the raid card in Discord.'),
      },
    });
    expect(serverEvent('Raid night')).toBeDefined();
    await g.host.ok(g.rook, 'raid-update', { eventId: alt.id, startsAt: saturday + 2 * HOUR });
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

  it("J71 · add a healer to a raid that's already up without changing its schedule", async () => {
    const { wed } = await scheduleRaidNights(g);
    await g.host.configureCoordinator();
    await g.host.tick(); // post the initial signup card
    const beforeSchedules = await g.host.ok<{ id: string; roleTargets: unknown }[]>(
      g.rook,
      'schedule-list',
      {},
    );
    const scheduleId = beforeSchedules[0]!.id;
    // Rook raises Healers from 3 to 4 on this raid only.
    await g.host.ok(g.rook, 'raid-update', {
      eventId: wed.id,
      roleTargets: { tank: 2, healer: 4, melee: 2, ranged: 2 },
    });
    await g.host.tick();
    const edited = messageText(g.host.editsTo(SIGNUP_CHANNEL).at(-1)!.message);
    expect(edited).toMatch(/Healers 0\/4/);

    // The schedule keeps its default targets (null) for future materialized raids.
    const schedules = await g.host.ok<{ id: string; roleTargets: unknown }[]>(
      g.rook,
      'schedule-list',
      {},
    );
    expect(schedules.find((s) => s.id === scheduleId)?.roleTargets).toBeNull();

    // A raider cannot call raid-update.
    expect(
      await g.host.run(g.aeryn, 'raid-update', {
        eventId: wed.id,
        roleTargets: { tank: 2, healer: 3, melee: 3, ranged: 2 },
      }),
    ).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });
  });

  it('J72 · grow a raid before approval and shrink after approval without unseating anyone', async () => {
    await g.host.configureCoordinator();
    const startsAt = WED;
    const zg = await g.host.ok<RaidEvent>(g.rook, 'raid-create', {
      name: "Zul'Gurub",
      instance: "Zul'Gurub",
      kind: 'other',
      size: 2,
      roleTargets: { tank: 1, healer: 1, dps: 0 },
      startsAt,
    });
    await answer(g, g.aeryn, 'aeryn', zg.id, 'accepted');
    await answer(g, g.ana, 'ana', zg.id, 'accepted');
    await answer(g, g.cade, 'cade', zg.id, 'accepted');
    await g.host.tick();
    const beforeGrow = messageText(
      g.host
        .sentTo(SIGNUP_CHANNEL)
        .find((m) => m.message.embeds?.[0]?.title?.includes("Zul'Gurub"))!.message,
    );
    expect(beforeGrow).toMatch(/\*\*2\*\* going/);
    expect(beforeGrow).toMatch(/\*\*1\*\* standby/);

    // Before approval: growing 2 -> 4 seats the overflow player on the next tick.
    await g.host.ok(g.rook, 'raid-update', {
      eventId: zg.id,
      size: 4,
      roleTargets: { tank: 1, healer: 1, dps: 2 },
    });
    await g.host.tick();
    const afterGrow = messageText(g.host.editsTo(SIGNUP_CHANNEL).at(-1)!.message);
    expect(afterGrow).toMatch(/\*\*3\*\* going/);
    expect(afterGrow).toMatch(/\*\*0\*\* standby/);

    // Approve the roster (materializes 3 seated), then shrink 4 -> 2: nobody is unseated.
    await g.host.ok(g.rook, 'roster-approve', { eventId: zg.id });
    await g.host.ok(g.rook, 'raid-update', {
      eventId: zg.id,
      size: 2,
      roleTargets: { tank: 1, healer: 1, dps: 0 },
    });
    const rows = await g.host.ok<Signup[]>(g.rook, 'signup-list', { eventId: zg.id });
    expect(rows.filter((s) => s.roster === 'rostered')).toHaveLength(3);
  });

  it('J73 · two raid nights from Discord: create, list, pause one while the other stays active', async () => {
    await g.host.configureCoordinator();
    const createViaForm = async (name: string, where: string, day: string) => {
      const opened = await g.host.scheduleUi.slash(g.rook.discordId!, 'create');
      expect((opened as { type: number }).type).toBe(9);
      const step1 = (await g.host.scheduleUi.form(g.rook.discordId!, {
        type: 5,
        data: {
          custom_id: 'schedform:new',
          components: [
            { type: 18, component: { type: 4, custom_id: 'name', value: name } },
            { type: 18, component: { type: 3, custom_id: 'kind', values: ['raid'] } },
            { type: 18, component: { type: 4, custom_id: 'where', value: where } },
            { type: 18, component: { type: 3, custom_id: 'weekdays', values: [day] } },
            { type: 18, component: { type: 3, custom_id: 'time', values: ['20:00'] } },
          ],
        },
      })) as { data: { embeds?: { footer?: { text: string } }[] } };
      const step2 = (await g.host.scheduleUi.form(g.rook.discordId!, {
        type: 5,
        message: { id: 'p1', embeds: step1.data.embeds },
        data: {
          custom_id: 'schedform:kind:raid',
          components: [{ type: 18, component: { type: 3, custom_id: 'size', values: ['40'] } }],
        },
      })) as { data: { embeds?: { footer?: { text: string } }[] } };
      return (await g.host.scheduleUi.form(g.rook.discordId!, {
        type: 3,
        message: { id: 'p1', embeds: step2.data.embeds },
        data: { custom_id: 'schedform:save', component_type: 2 },
      })) as { data: { content?: string } };
    };

    const monReply = await createViaForm('Monday MC', 'Molten Core', 'mon');
    expect(monReply.data.content).toContain(
      "Made **Monday MC** (Molten Core, 40-player raid) on Mondays at 8:00 PM. This week's raids are posting now.",
    );
    const wedReply = await createViaForm('Wednesday BWL', 'Blackwing Lair', 'wed');
    expect(wedReply.data.content).toContain(
      "Made **Wednesday BWL** (Blackwing Lair, 40-player raid) on Wednesdays at 8:00 PM. This week's raids are posting now.",
    );

    // Both weeks' signup posts go up on the coordinator tick.
    await g.host.tick();
    const titles = g.host.sentTo(SIGNUP_CHANNEL).map((m) => m.message.embeds?.[0]?.title ?? '');
    expect(titles.some((t) => t.includes('Monday MC'))).toBe(true);
    expect(titles.some((t) => t.includes('Wednesday BWL'))).toBe(true);

    // `/vintage schedule list` shows both with their next raid.
    const listed = (await g.host.scheduleUi.slash(g.aeryn.discordId!, 'list')) as {
      data: { content?: string };
    };
    expect(listed.data.content).toContain('**Monday MC**');
    expect(listed.data.content).toContain('**Wednesday BWL**');

    // Pause Wednesday BWL -> next week materializes Monday MC only.
    const paused = (await g.host.scheduleUi.slash(g.rook.discordId!, 'pause', {
      schedule: 'Wednesday BWL',
    })) as { data: { content?: string } };
    expect(paused.data.content).toBe('Paused **Wednesday BWL**. No new raids until you resume it.');

    g.host.clock.advance(7 * DAY);
    const nextWeek = await g.host.ok<{ created: RaidEvent[] }>(g.rook, 'schedule-materialize', {});
    expect(nextWeek.created.map((e) => e.name)).toEqual(['Monday MC']);
  });

  it('J74 · sign up on the site from the Discord post short link', async () => {
    await g.host.ok(g.ana, 'schedule-create', {
      name: 'Raid night',
      instance: 'Molten Core',
      size: 40,
      weekdays: ['wed'],
      time: '20:00',
      timeZone: 'America/New_York',
    });
    await g.host.configureCoordinator({ serverEvents: true });

    // Tick 1 materializes Wednesday's raid and posts the signup card with the masked short link.
    await g.host.tick({ siteUrl: 'https://vintageguild.gg' });
    const [listed] = await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list', {});
    const wed = listed!.event;
    expect(wed.shortCode).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    const code = wed.shortCode!;
    const shortUrl = `https://vintageguild.gg/r/${code}`;
    const masked = `[vintageguild.gg/r/${code}](${shortUrl})`;

    const signupPost = g.host.sentTo(SIGNUP_CHANNEL)[0]!.message;
    const subtext = signupPost.embeds?.[0]?.description
      ?.split('\n')
      .find((l) => l.startsWith('-# '));
    expect(subtext).toContain(`· ${masked}`);
    const row2 = signupPost.components?.[1] as { components?: { label?: string; url?: string }[] };
    expect(row2?.components).toContainEqual(
      expect.objectContaining({ label: 'Raid page', url: shortUrl }),
    );

    // Tick 2 creates the Discord server event using the same short link.
    await g.host.tick({ siteUrl: 'https://vintageguild.gg' });
    const [serverEvent] = g.host.discord.serverEvents.values();
    expect(serverEvent?.data.description).toContain(`Sign up: ${shortUrl}`);

    // Aeryn opens /r/<code> -> resolves through raid-get({ shortCode }) and answers on the site.
    const resolved = await g.host.ok<{ event: RaidEvent }>(g.aeryn, 'raid-get', {
      shortCode: code.toUpperCase(),
    });
    expect(resolved.event.id).toBe(wed.id);
    await answer(g, g.aeryn, 'aeryn', resolved.event.id, 'accepted');

    // The Discord signup post reflects her answer on the next tick.
    await g.host.tick({ siteUrl: 'https://vintageguild.gg' });
    const refreshed = messageText(g.host.editsTo(SIGNUP_CHANNEL).at(-1)!.message);
    expect(refreshed).toContain('Aeryn');
    expect(refreshed).toContain(masked);

    // A Friend probing this guild raid's short code gets RAID_NOT_FOUND.
    const wren = await g.host.discordMember('900000000000000099', 'Wren', [ROLES.friend]);
    expect(await g.host.run(wren, 'raid-get', { shortCode: code })).toMatchObject({
      success: false,
      error: { code: 'RAID_NOT_FOUND' },
    });

    // At lock without approval, the Final Roster carries the same short link while reminder DMs
    // keep the Discord channel/message link.
    g.host.clock.advance(wed.startsAt - 30 * HOUR - g.host.clock.now());
    await g.host.tick({ siteUrl: 'https://vintageguild.gg' });
    const dm = g.host.discord.sent.find((m) => m.kind === 'dm');
    expect(dm?.message.content).toContain(
      `https://discord.com/channels/${DISCORD_GUILD}/${SIGNUP_CHANNEL}/`,
    );

    g.host.clock.advance(wed.startsAt - 2 * HOUR - g.host.clock.now());
    await g.host.tick({ siteUrl: 'https://vintageguild.gg' });
    const finalPost = g.host
      .sentTo(SIGNUP_CHANNEL)
      .find((m) => m.message.embeds?.[0]?.title?.startsWith('Final roster'));
    expect(finalPost?.message.embeds?.[0]?.description).toContain(`· ${masked}`);
  });

  it('J75 · a leader moves or cancels an event from its signup card', async () => {
    const { wed, thu } = await scheduleRaidNights(g);
    const text = (r: unknown) => (r as { data?: { content?: string } }).data?.content ?? '';
    const click = (who: Caller, customId: string) =>
      g.host.manageUi(who.discordId!, { data: { custom_id: customId, component_type: 2 } });

    // A raider can press Manage but gets a private "ask a raid leader"; nothing changes.
    expect(text(await click(g.aeryn, `manage:${wed.id}`))).toMatch(/needs the Raid Leader rank/);

    // The leader moves Wednesday an hour later with the form's pickers.
    const menu = await click(g.rook, `manage:${wed.id}`);
    expect(text(menu)).toContain('What do you want to change?');
    const form = await click(g.rook, `manage:move:${wed.id}`);
    const date = JSON.stringify(form).match(/"value":"(\d{4}-\d{2}-\d{2})","default":true/)![1];
    const moved = await g.host.manageUi(g.rook.discordId!, {
      type: InteractionType.MODAL_SUBMIT,
      data: {
        custom_id: `manage:when:${wed.id}`,
        components: [
          { type: 18, component: { type: 3, custom_id: 'date', values: [date] } },
          { type: 18, component: { type: 3, custom_id: 'time', values: ['21:00'] } },
        ],
      },
    } as Partial<Interaction>);
    expect(text(moved)).toMatch(/^Moved \*\*Raid night\*\*/);
    const after = await g.host.ok<{ event: RaidEvent }>(g.aeryn, 'raid-get', { eventId: wed.id });
    expect(after.event.startsAt).toBe(WED + HOUR);
    await g.host.tick();
    const wedCard = g.host.editsTo(SIGNUP_CHANNEL).at(-1)!;
    expect(JSON.stringify(wedCard.message)).toContain(`<t:${(WED + HOUR) / 1000}:`);

    // Thursday is cancelled: asked first, then confirmed; its card loses its buttons.
    expect(text(await click(g.rook, `manage:cancel:${thu.id}`))).toMatch(/^Cancel \*\*Raid night/);
    expect(text(await click(g.rook, `manage:confirm:${thu.id}`))).toMatch(/^Cancelled/);
    const gone = await g.host.ok<{ event: RaidEvent }>(g.aeryn, 'raid-get', { eventId: thu.id });
    expect(gone.event.status).toBe('cancelled');
    await g.host.tick();
    const thuCard = g.host.editsTo(SIGNUP_CHANNEL).at(-1)!;
    expect(thuCard.message.embeds?.[0]?.title).toBe('Cancelled · Raid night · Molten Core');
    expect(thuCard.message.components).toEqual([]);
  });
});
