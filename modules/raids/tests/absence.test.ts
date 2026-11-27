import { type Caller, createGuildRegistry } from '@vintage/guild-kit';
import { describe, expect, it } from 'vitest';
import { raidsCommands } from '../src/commands';
import {
  type Absence,
  absenceCovers,
  excusedAtLock,
  FALLBACK_RAID_TIME,
  FALLBACK_TIME_ZONE,
  localDateOf,
  parseCalendarDate,
  resolveAbsenceCoverage,
  resolveGuildClock,
  weekdayOf,
} from '../src/contract';
import { createMemoryRaidsDeps } from '../src/testing';

const NOW = Date.UTC(2026, 11, 1, 17, 0); // Tue 2026-12-01 12:00 EST (America/New_York)
const WED_RAID = Date.UTC(2026, 11, 3, 1, 0); // Wed 2026-12-02 20:00 EST
const THU_RAID = Date.UTC(2026, 11, 4, 1, 0); // Thu 2026-12-03 20:00 EST
const FRI_AFTER_MIDNIGHT = Date.UTC(2026, 11, 4, 5, 30); // Fri 2026-12-04 00:30 EST

const caller = (tier: Caller['tier'], memberId = 'm-raider', guildId = 'vintage'): Caller => ({
  surface: 'mcp',
  guildId,
  tier,
  memberId,
});

function setup(now = NOW) {
  const deps = createMemoryRaidsDeps(
    [
      {
        id: 'm-raider',
        guildId: 'vintage',
        discordId: 'd-raider',
        displayName: 'Cade',
        roleIds: [],
        inServer: true,
        rank: 'raider',
        tier: 'raider',
        prefs: { dmOptOut: false },
        syncedAt: now,
        rankSince: null,
      },
      {
        id: 'm-other',
        guildId: 'vintage',
        discordId: 'd-other',
        displayName: 'Dara',
        roleIds: [],
        inServer: true,
        rank: 'recruit',
        tier: 'recruit',
        prefs: { dmOptOut: false },
        syncedAt: now,
        rankSince: null,
      },
      {
        id: 'm-leader',
        guildId: 'vintage',
        discordId: 'd-leader',
        displayName: 'Rook',
        roleIds: [],
        inServer: true,
        rank: 'raid-leader',
        tier: 'leader',
        prefs: { dmOptOut: false },
        syncedAt: now,
        rankSince: null,
      },
    ],
    [
      {
        id: 'c-cade',
        guildId: 'vintage',
        memberId: 'm-raider',
        name: 'Cade',
        class: 'mage',
        spec: 'frost',
        role: 'ranged',
        alsoRoles: [],
        isMain: true,
      },
    ],
  );
  const registry = createGuildRegistry({
    commands: raidsCommands,
    confirmSecret: 'test-secret',
    now: () => now,
  });
  return { deps, registry };
}

describe('guild clock', () => {
  it('picks the first active schedule, else the first schedule, else fallbacks', () => {
    expect(resolveGuildClock([])).toEqual({
      zone: FALLBACK_TIME_ZONE,
      time: FALLBACK_RAID_TIME,
    });
    expect(
      resolveGuildClock([
        {
          active: false,
          recurrence: { weekdays: ['wed'], time: '19:30', timeZone: 'Europe/Berlin' },
        },
        {
          active: true,
          recurrence: { weekdays: ['thu'], time: '20:15', timeZone: 'America/Chicago' },
        },
      ]),
    ).toEqual({ zone: 'America/Chicago', time: '20:15' });
    expect(
      resolveGuildClock([
        { active: false, recurrence: { weekdays: ['wed'], time: 'bad', timeZone: 'UTC' } },
      ]),
    ).toEqual({ zone: 'UTC', time: FALLBACK_RAID_TIME });
  });
});

describe('absence coverage math', () => {
  const base: Absence = {
    id: 'a1',
    guildId: 'vintage',
    memberId: 'm-raider',
    kind: 'dates',
    from: '2026-12-03',
    to: '2026-12-07',
    nights: null,
    timeZone: 'America/New_York',
    reason: 'work trip',
    createdBy: 'm-raider',
    createdAt: NOW,
    endedAt: null,
  };

  it('validates calendar dates strictly and computes local date/weekday', () => {
    expect(parseCalendarDate('2026-02-28')).not.toBeNull();
    expect(parseCalendarDate('2026-02-29')).toBeNull();
    expect(parseCalendarDate('2026-13-01')).toBeNull();
    expect(localDateOf(WED_RAID, 'America/New_York')).toBe('2026-12-02');
    expect(weekdayOf(WED_RAID, 'America/New_York')).toBe('wed');
    expect(localDateOf(FRI_AFTER_MIDNIGHT, 'America/New_York')).toBe('2026-12-04');
  });

  it('computes date-range and weekly coverage, ignoring ended absences', () => {
    expect(absenceCovers(base, WED_RAID)).toBeNull();
    expect(absenceCovers(base, THU_RAID)).toBe('away');
    expect(absenceCovers({ ...base, endedAt: NOW + 1000 }, THU_RAID)).toBeNull();

    const weekly: Absence = {
      ...base,
      id: 'a2',
      kind: 'weekly',
      from: null,
      to: null,
      nights: [
        { day: 'wed', type: 'away', lateMinutes: null },
        { day: 'thu', type: 'late', lateMinutes: 15 },
      ],
    };
    expect(absenceCovers(weekly, WED_RAID)).toBe('away');
    expect(absenceCovers(weekly, THU_RAID)).toEqual({ type: 'late', lateMinutes: 15 });
  });

  it('gives away precedence over weekly late when both cover the same raid', () => {
    const weeklyLate: Absence = {
      ...base,
      id: 'a2',
      kind: 'weekly',
      from: null,
      to: null,
      nights: [{ day: 'thu', type: 'late', lateMinutes: 15 }],
      reason: null,
    };
    const resolved = resolveAbsenceCoverage([weeklyLate, base], THU_RAID);
    expect(resolved.coverage).toBe('away');
    expect(resolved.absence?.id).toBe('a1');
  });

  it('evaluates lock-time excuse history even after soft-closing', () => {
    const lockAt = THU_RAID - 2 * 60 * 60 * 1000;
    expect(
      excusedAtLock(
        [{ ...base, createdAt: lockAt - 1000, endedAt: lockAt + 1000 }],
        THU_RAID,
        lockAt,
      ),
    ).toBe(true);
    expect(
      excusedAtLock(
        [{ ...base, createdAt: lockAt - 1000, endedAt: lockAt - 500 }],
        THU_RAID,
        lockAt,
      ),
    ).toBe(false);
    expect(
      excusedAtLock([{ ...base, createdAt: lockAt + 1000, endedAt: null }], THU_RAID, lockAt),
    ).toBe(false);
  });
});

describe('absence commands', () => {
  it('adds a date absence, reports stillSignedUp, and enforces limits & refusals', async () => {
    const { deps, registry } = setup();
    const raidRes = await registry.execute(
      {
        name: 'raid-create',
        input: {
          name: 'Raid night',
          instance: 'Molten Core',
          size: 40,
          startsAt: THU_RAID,
        },
        caller: caller('leader', 'm-leader'),
      },
      deps,
    );
    expect(raidRes.success).toBe(true);
    const eventId = (raidRes.data as { id: string }).id;

    await registry.execute(
      {
        name: 'signup-set',
        input: { eventId, characterId: 'c-cade', status: 'accepted' },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );

    const added = await registry.execute(
      {
        name: 'absence-add',
        input: { from: '2026-12-03', to: '2026-12-07', reason: 'work trip' },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    expect(added.success).toBe(true);
    const data = added.data as { absence: Absence; stillSignedUp: { eventId: string }[] };
    expect(data.absence.timeZone).toBe('America/Chicago');
    expect(data.absence.endedAt).toBeNull();
    expect(data.stillSignedUp.map((s) => s.eventId)).toEqual([eventId]);
    expect(deps.events.emitted.some((e) => e.type === 'absence-changed')).toBe(true);

    // Refusals: past, too long, too far, invalid date, non-leader memberId
    const past = await registry.execute(
      { name: 'absence-add', input: { from: '2026-11-30' }, caller: caller('raider', 'm-raider') },
      deps,
    );
    expect(past.error?.code).toBe('ABSENCE_IN_PAST');

    const tooLong = await registry.execute(
      {
        name: 'absence-add',
        input: { from: '2026-12-03', to: '2027-03-01' },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    expect(tooLong.error?.code).toBe('ABSENCE_TOO_LONG');

    const tooFar = await registry.execute(
      {
        name: 'absence-add',
        input: { from: '2027-07-01' },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    expect(tooFar.error?.code).toBe('ABSENCE_TOO_FAR');

    const badDate = await registry.execute(
      {
        name: 'absence-add',
        input: { from: '2026-12-05', to: '2026-12-03' },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    expect(badDate.error?.code).toBe('INVALID_DATE');

    const forbidden = await registry.execute(
      {
        name: 'absence-add',
        input: { from: '2026-12-10', memberId: 'm-other' },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    expect(forbidden.error?.code).toBe('FORBIDDEN');
  });

  it('sets, replaces (soft-closing old), and clears weekly rules', async () => {
    const { deps, registry } = setup();
    const dup = await registry.execute(
      {
        name: 'absence-weekly-set',
        input: {
          nights: [
            { day: 'wed', type: 'away' },
            { day: 'wed', type: 'late', lateMinutes: 15 },
          ],
        },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    expect(dup.error?.code).toBe('DUPLICATE_NIGHT');

    const missingMin = await registry.execute(
      {
        name: 'absence-weekly-set',
        input: { nights: [{ day: 'thu', type: 'late' }] },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    expect(missingMin.error?.code).toBe('LATE_MINUTES_REQUIRED');

    const first = await registry.execute(
      {
        name: 'absence-weekly-set',
        input: {
          nights: [
            { day: 'wed', type: 'away' },
            { day: 'thu', type: 'late', lateMinutes: 15 },
          ],
          reason: 'class',
        },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    expect(first.success).toBe(true);
    const firstId = (first.data as { absence: Absence }).absence.id;

    // Replace with late-only clears reason and soft-closes old rule
    const second = await registry.execute(
      {
        name: 'absence-weekly-set',
        input: { nights: [{ day: 'thu', type: 'late', lateMinutes: 30 }], reason: 'ignored' },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    expect(second.success).toBe(true);
    expect((second.data as { absence: Absence }).absence.reason).toBeNull();
    const oldRow = await deps.raids.getAbsence('vintage', firstId);
    expect(oldRow?.endedAt).toBe(NOW);

    // Clear with []
    const cleared = await registry.execute(
      { name: 'absence-weekly-set', input: { nights: [] }, caller: caller('raider', 'm-raider') },
      deps,
    );
    expect((cleared.data as { absence: Absence | null }).absence).toBeNull();
  });

  it('hides other members reasons on absence-list eventId and hides others ids on absence-remove', async () => {
    const { deps, registry } = setup();
    const raidRes = await registry.execute(
      {
        name: 'raid-create',
        input: { name: 'Raid night', instance: 'Molten Core', size: 40, startsAt: THU_RAID },
        caller: caller('leader', 'm-leader'),
      },
      deps,
    );
    const eventId = (raidRes.data as { id: string }).id;

    const added = await registry.execute(
      {
        name: 'absence-add',
        input: { from: '2026-12-03', reason: 'hospital' },
        caller: caller('raider', 'm-raider'),
      },
      deps,
    );
    const absenceId = (added.data as { absence: Absence }).absence.id;

    // Recruit sees name, NOT reason
    const asRecruit = await registry.execute(
      { name: 'absence-list', input: { eventId }, caller: caller('recruit', 'm-other') },
      deps,
    );
    expect(asRecruit.success).toBe(true);
    expect(
      (asRecruit.data as { covered: { displayName: string; reason: string | null }[] }).covered,
    ).toEqual([expect.objectContaining({ displayName: 'Cade', reason: null })]);

    // Leader sees name AND reason
    const asLeader = await registry.execute(
      { name: 'absence-list', input: { eventId }, caller: caller('leader', 'm-leader') },
      deps,
    );
    expect(
      (asLeader.data as { covered: { displayName: string; reason: string | null }[] }).covered,
    ).toEqual([expect.objectContaining({ displayName: 'Cade', reason: 'hospital' })]);

    // Other member cannot probe or remove Cade's absence
    const probe = await registry.execute(
      { name: 'absence-remove', input: { absenceId }, caller: caller('recruit', 'm-other') },
      deps,
    );
    expect(probe.error?.code).toBe('ABSENCE_NOT_FOUND');

    // Leader can remove Cade's absence (soft-closed)
    const removed = await registry.execute(
      { name: 'absence-remove', input: { absenceId }, caller: caller('leader', 'm-leader') },
      deps,
    );
    expect(removed.success).toBe(true);
    expect((await deps.raids.getAbsence('vintage', absenceId))?.endedAt).toBe(NOW);
  });
});
