import { DEFAULT_TIMINGS, type RaidEvent, type Signup } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import {
  diffEventChanges,
  renderDropoutAlert,
  renderLockOpenSeats,
  seatCandidatesFor,
  snapshotForEvent,
} from '../src/domain/changes';
import type { TickEvent, TickMember } from '../src/store';
import {
  buttonLabels,
  createFakeDiscord,
  createFakePolls,
  createFakeRaids,
  createMemoryCoordinatorStore,
  createStateSource,
  messageText,
} from '../src/testing';
import { runTick } from '../src/tick';

const HOUR = 60 * 60 * 1000;
const RAID_START = Date.UTC(2026, 11, 2, 20, 0);

function makeEvent(overrides: Partial<RaidEvent> = {}): RaidEvent {
  return {
    id: 'evt_mc',
    guildId: 'g1',
    scheduleId: null,
    name: 'Raid night',
    instance: 'Molten Core',
    kind: 'raid',
    access: 'guild',
    size: 10,
    roleTargets: { tank: 2, healer: 2, melee: 3, ranged: 3 },
    startsAt: RAID_START,
    durationMinutes: 180,
    status: 'open',
    notes: null,
    lootMethodId: null,
    configVersion: 1,
    rosterApprovedAt: null,
    rosterApprovedBy: null,
    ...overrides,
  };
}

function makeSignup(overrides: Partial<Signup> & { id: string; memberId: string }): Signup {
  return {
    guildId: 'g1',
    eventId: 'evt_mc',
    characterId: `c_${overrides.id}`,
    characterName: overrides.id,
    class: 'warrior',
    spec: 'protection',
    role: 'tank',
    rolePicked: false,
    alsoRoles: [],
    status: 'accepted',
    lateMinutes: null,
    note: null,
    signedUpAt: RAID_START - 48 * HOUR,
    updatedAt: RAID_START - 48 * HOUR,
    updatedBy: overrides.memberId,
    roster: 'pending',
    group: null,
    queued: false,
    promotedAt: null,
    ...overrides,
  };
}

const MEMBERS: TickMember[] = [
  {
    memberId: 'm_rook',
    discordId: 'd_rook',
    displayName: 'Rook',
    rank: 'raid-leader',
    dmOptOut: false,
  },
  {
    memberId: 'm_aeryn',
    discordId: 'd_aeryn',
    displayName: 'Aeryn',
    rank: 'raider',
    dmOptOut: false,
  },
  {
    memberId: 'm_thorgrim',
    discordId: 'd_thor',
    displayName: 'Thorgrim',
    rank: 'raider',
    dmOptOut: false,
  },
  {
    memberId: 'm_ironhide',
    discordId: 'd_iron',
    displayName: 'Ironhide',
    rank: 'flex-raider',
    dmOptOut: false,
  },
  {
    memberId: 'm_moon',
    discordId: 'd_moon',
    displayName: 'Moonglade',
    rank: 'raider',
    dmOptOut: false,
  },
  {
    memberId: 'm_gorrak',
    discordId: 'd_gor',
    displayName: 'Gorrak',
    rank: 'raider',
    dmOptOut: false,
  },
  { memberId: 'm_pip', discordId: 'd_pip', displayName: 'Pip', rank: 'member', dmOptOut: false },
  {
    memberId: 'm_kestrel',
    discordId: 'd_kes',
    displayName: 'Kestrel',
    rank: 'friend',
    dmOptOut: false,
  },
];

describe('#leads post-digest change feed (changes.ts + runTick)', () => {
  it('suppresses group-only moves and batches new signups, late, tentative, switches, and leader seats', () => {
    const event = makeEvent();
    const initialSignups: Signup[] = [
      makeSignup({
        id: 's_aeryn',
        memberId: 'm_aeryn',
        characterName: 'Aeryn',
        group: 1,
        roster: 'rostered',
      }),
      makeSignup({
        id: 's_gorrak',
        memberId: 'm_gorrak',
        characterName: 'Gorrak',
        class: 'rogue',
        spec: 'combat',
        role: 'melee',
      }),
      makeSignup({
        id: 's_pip',
        memberId: 'm_pip',
        characterName: 'Pip',
        class: 'mage',
        spec: 'frost',
        role: 'ranged',
      }),
      makeSignup({
        id: 's_moon',
        memberId: 'm_moon',
        characterName: 'Moonglade',
        class: 'druid',
        spec: 'balance',
        role: 'ranged',
      }),
      makeSignup({
        id: 's_iron',
        memberId: 'm_ironhide',
        characterName: 'Ironhide',
        status: 'bench',
      }),
    ];
    const tickBefore: TickEvent = { event, timings: DEFAULT_TIMINGS, signups: initialSignups };
    const previous = snapshotForEvent('g1', tickBefore, MEMBERS, RAID_START - 24 * HOUR);

    const updatedSignups: Signup[] = [
      // Group-only move (1 -> 2): must NOT produce a change line.
      { ...initialSignups[0]!, group: 2, updatedAt: RAID_START - 20 * HOUR, updatedBy: 'm_rook' },
      // Gorrak changes to Late 15m.
      { ...initialSignups[1]!, status: 'late', lateMinutes: 15, updatedAt: RAID_START - 20 * HOUR },
      // Pip changes to Tentative with reason (no longer seated).
      {
        ...initialSignups[2]!,
        status: 'tentative',
        note: 'depends on work',
        updatedAt: RAID_START - 20 * HOUR,
      },
      // Moonglade switches character + spec + role.
      {
        ...initialSignups[3]!,
        characterName: 'Grovewyn',
        spec: 'restoration',
        role: 'healer',
        updatedAt: RAID_START - 20 * HOUR,
      },
      // Rook seats Ironhide.
      {
        ...initialSignups[4]!,
        status: 'accepted',
        roster: 'rostered',
        group: 1,
        updatedAt: RAID_START - 20 * HOUR,
        updatedBy: 'm_rook',
      },
      // Kestrel (Friend) signs up on Standby.
      makeSignup({
        id: 's_kestrel',
        memberId: 'm_kestrel',
        characterName: 'Kestrel',
        class: 'priest',
        spec: 'holy',
        role: 'healer',
        status: 'bench',
        updatedAt: RAID_START - 20 * HOUR,
      }),
    ];

    const diff = diffEventChanges(
      'g1',
      { event, timings: DEFAULT_TIMINGS, signups: updatedSignups },
      MEMBERS,
      previous,
      RAID_START - 20 * HOUR,
    );

    // Pip was seated and went tentative -> dropout; Aeryn group-only move -> ignored.
    expect(diff.dropouts.map((d) => d.characterName)).toEqual(['Pip']);
    expect(diff.lines).toEqual([
      '**Gorrak** is now Late, 15 minutes.',
      '**Moonglade** switched to Grovewyn (Restoration Druid, healer).',
      '**Rook** seated Ironhide.',
      '**Kestrel** signed up (Friend): Holy Priest, on Standby.',
    ]);
  });

  it('renders a seated dropout alert with Standby-only Seat buttons (capped at 4) and seated flex text (J61)', () => {
    const event = makeEvent({ roleTargets: { tank: 4, healer: 2, melee: 2, ranged: 2 } });
    const sAeryn = makeSignup({
      id: 's_aeryn',
      memberId: 'm_aeryn',
      characterName: 'Aeryn',
      role: 'tank',
      group: 1,
      roster: 'rostered',
    });
    const sThorgrim = makeSignup({
      id: 's_thor',
      memberId: 'm_thorgrim',
      characterName: 'Thorgrim',
      class: 'warrior',
      spec: 'fury',
      role: 'melee',
      alsoRoles: ['tank'],
      roster: 'rostered',
      group: 2,
    });
    const sIronhide = makeSignup({
      id: 's_iron',
      memberId: 'm_ironhide',
      characterName: 'Ironhide',
      role: 'tank',
      status: 'bench',
    });
    const sMoonglade = makeSignup({
      id: 's_moon',
      memberId: 'm_moon',
      characterName: 'Moonglade',
      class: 'druid',
      spec: 'restoration',
      role: 'healer',
      alsoRoles: ['tank'],
      status: 'bench',
    });

    const before: TickEvent = {
      event,
      timings: DEFAULT_TIMINGS,
      signups: [sAeryn, sThorgrim, sIronhide, sMoonglade],
    };
    const previous = snapshotForEvent('g1', before, MEMBERS, RAID_START - 24 * HOUR);
    const after: TickEvent = {
      event,
      timings: DEFAULT_TIMINGS,
      signups: [
        { ...sAeryn, status: 'declined', note: 'family thing', updatedAt: RAID_START - 20 * HOUR },
        sThorgrim,
        sIronhide,
        sMoonglade,
      ],
    };

    const diff = diffEventChanges('g1', after, MEMBERS, previous, RAID_START - 20 * HOUR);
    expect(diff.dropouts).toHaveLength(1);
    const msg = renderDropoutAlert(after, diff.dropouts[0]!, MEMBERS);
    const text = messageText(msg);

    expect(text).toContain('**Aeryn** dropped out of Raid night · Molten Core');
    expect(text).toContain('Tanks 0/4 now.');
    expect(text).toContain('-# family thing');
    expect(text).toContain(
      'Standby who could tank: Ironhide (flex raider), Moonglade (can also tank).',
    );
    expect(text).toContain('Already seated who can tank: Thorgrim.');
    expect(buttonLabels(msg)).toEqual(['Seat Ironhide', 'Seat Moonglade']);
    // Button custom IDs carry event, signup, role, and dropout's group (1).
    const row = msg.components?.[0] as { components: { custom_id: string }[] };
    expect(row.components.map((b) => b.custom_id)).toEqual([
      'seat:evt_mc:s_iron:tank:1',
      'seat:evt_mc:s_moon:tank:1',
    ]);
  });

  it('caps Seat buttons at 4 when more than 4 Standby candidates match', () => {
    const event = makeEvent();
    const extraStandby = Array.from({ length: 6 }, (_, i) =>
      makeSignup({
        id: `s_sb_${i}`,
        memberId: `m_sb_${i}`,
        characterName: `Tank${i}`,
        role: 'tank',
        status: 'bench',
      }),
    );
    const extraMembers: TickMember[] = extraStandby.map((s) => ({
      memberId: s.memberId,
      discordId: `d_${s.id}`,
      displayName: s.characterName,
      rank: 'raider',
      dmOptOut: false,
    }));
    const tick: TickEvent = { event, timings: DEFAULT_TIMINGS, signups: extraStandby };
    const { standby } = seatCandidatesFor(tick, extraMembers, 'tank');
    expect(standby).toHaveLength(6);

    const msg = renderDropoutAlert(
      tick,
      {
        memberId: 'm_aeryn',
        characterName: 'Aeryn',
        role: 'tank',
        group: 1,
        reason: null,
        nextState: snapshotForEvent('g1', tick, extraMembers, RAID_START - 20 * HOUR)[0]!,
      },
      extraMembers,
    );
    expect(buttonLabels(msg)).toHaveLength(4);
  });

  it('stays quiet before digest, seeds announcedState at digest, and posts changes once after digest (J69)', async () => {
    const store = createMemoryCoordinatorStore();
    await store.setConfig(
      'g1',
      { signupChannelId: 'ch_signups', leadsChannelId: 'ch_leads', opsChannelId: 'ch_ops' },
      0,
    );
    const discord = createFakeDiscord();
    const raids = createFakeRaids();
    const polls = createFakePolls();
    const event = makeEvent();
    const signups: Signup[] = [
      makeSignup({ id: 's_aeryn', memberId: 'm_aeryn', characterName: 'Aeryn', group: 1 }),
    ];
    const source = createStateSource(
      () => ({
        guildId: 'g1',
        events: [{ event, timings: DEFAULT_TIMINGS, signups }],
        members: MEMBERS,
      }),
      store,
    );
    const ports = { store, source, raids, discord, polls };

    // T-48h: post goes up, no digest, no change feed.
    await runTick(ports, 'g1', RAID_START - 48 * HOUR);
    signups.push(
      makeSignup({
        id: 's_gorrak',
        memberId: 'm_gorrak',
        characterName: 'Gorrak',
        class: 'rogue',
        spec: 'combat',
        role: 'melee',
      }),
    );
    await runTick(ports, 'g1', RAID_START - 40 * HOUR);
    expect(discord.sent.filter((m) => m.to === 'ch_leads')).toHaveLength(0);

    // T-24h: digest + party-draft post, seeding announcedState (no change feed on the digest tick).
    await runTick(ports, 'g1', RAID_START - 24 * HOUR);
    const leadsAtDigest = discord.sent.filter((m) => m.to === 'ch_leads');
    expect(leadsAtDigest.length).toBeGreaterThanOrEqual(1);
    expect(store.announcedState.size).toBe(2);

    // T-20h: Gorrak changes to Late 15m -> one change-feed post in #leads.
    signups[1] = {
      ...signups[1]!,
      status: 'late',
      lateMinutes: 15,
      updatedAt: RAID_START - 20 * HOUR,
    };
    const leadsPosts = () => discord.sent.filter((m) => m.to === 'ch_leads' && m.kind === 'post');
    const beforeCount = leadsPosts().length;
    await runTick(ports, 'g1', RAID_START - 20 * HOUR);
    const afterLeads = leadsPosts();
    expect(afterLeads.length).toBe(beforeCount + 1);
    expect(messageText(afterLeads.at(-1)!.message)).toContain(
      '**Gorrak** is now Late, 15 minutes.',
    );

    // T-19h: No new changes -> nothing posted again.
    await runTick(ports, 'g1', RAID_START - 19 * HOUR);
    expect(leadsPosts().length).toBe(afterLeads.length);
  });

  it('posts lock-time open-seat suggestions with Standby-only Seat buttons to #leads once (#324)', async () => {
    const store = createMemoryCoordinatorStore();
    await store.setConfig(
      'g1',
      { signupChannelId: 'ch_signups', leadsChannelId: 'ch_leads', opsChannelId: 'ch_ops' },
      0,
    );
    const discord = createFakeDiscord();
    let event = makeEvent({
      size: 10,
      roleTargets: { tank: 2, healer: 2, melee: 3, ranged: 3 },
      rosterApprovedAt: RAID_START - 20 * HOUR,
      rosterApprovedBy: 'm_rook',
    });
    const raids = createFakeRaids(() => {
      event = { ...event, status: 'locked' };
    });
    const polls = createFakePolls();
    const signups: Signup[] = [
      makeSignup({
        id: 's_aeryn',
        memberId: 'm_aeryn',
        characterName: 'Aeryn',
        role: 'tank',
        roster: 'rostered',
        group: 1,
      }),
      makeSignup({
        id: 's_thor',
        memberId: 'm_thorgrim',
        characterName: 'Thorgrim',
        class: 'warrior',
        spec: 'fury',
        role: 'melee',
        alsoRoles: ['tank'],
        roster: 'rostered',
        group: 1,
      }),
      makeSignup({
        id: 's_iron',
        memberId: 'm_ironhide',
        characterName: 'Ironhide',
        role: 'tank',
        status: 'bench',
      }),
      makeSignup({
        id: 's_moon',
        memberId: 'm_moon',
        characterName: 'Moonglade',
        class: 'druid',
        spec: 'restoration',
        role: 'healer',
        alsoRoles: ['tank'],
        status: 'bench',
      }),
    ];

    const preview = renderLockOpenSeats({ event, timings: DEFAULT_TIMINGS, signups }, MEMBERS);
    const previewText = messageText(preview);
    expect(previewText).toContain('locked with **8 open seats** (2/10)');
    expect(previewText).toContain(
      'Standby who could tank: Ironhide (flex raider), Moonglade (can also tank).',
    );
    expect(previewText).toContain('Already seated who can tank: Thorgrim.');
    expect(buttonLabels(preview)).toEqual(['Seat Ironhide', 'Seat Moonglade']);
    const row = preview.components?.[0] as { components: { custom_id: string }[] };
    expect(row.components.map((b) => b.custom_id)).toEqual([
      'seat:evt_mc:s_iron:tank:0',
      'seat:evt_mc:s_moon:tank:0',
    ]);

    const source = createStateSource(
      () => ({
        guildId: 'g1',
        events: [{ event, timings: DEFAULT_TIMINGS, signups }],
        members: MEMBERS,
      }),
      store,
    );
    const ports = { store, source, raids, discord, polls };

    await runTick(ports, 'g1', RAID_START - 48 * HOUR);
    await runTick(ports, 'g1', RAID_START - 2 * HOUR);
    const openSeatPosts = () =>
      discord.sent.filter(
        (m) => m.to === 'ch_leads' && m.kind === 'post' && m.message.content?.includes('open seat'),
      );
    expect(openSeatPosts()).toHaveLength(1);
    expect(buttonLabels(openSeatPosts()[0]!.message)).toEqual(['Seat Ironhide', 'Seat Moonglade']);

    // Re-running after lock does not duplicate the open-seat post.
    await runTick(ports, 'g1', RAID_START - 1 * HOUR);
    expect(openSeatPosts()).toHaveLength(1);
  });
});
