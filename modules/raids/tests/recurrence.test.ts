import { describe, expect, it } from 'vitest';
import {
  isValidTime,
  isValidTimeZone,
  occurrences,
  wallClock,
  zonedTime,
} from '../src/domain/recurrence';

const NY = 'America/New_York';
const iso = (ms: number) => new Date(ms).toISOString();

describe('zonedTime / wallClock', () => {
  it('round-trips a local time in winter and summer', () => {
    const winter = zonedTime({ year: 2026, month: 1, day: 13, hour: 20, minute: 0 }, NY);
    expect(iso(winter)).toBe('2026-01-14T01:00:00.000Z'); // EST, UTC-5
    const summer = zonedTime({ year: 2026, month: 7, day: 14, hour: 20, minute: 0 }, NY);
    expect(iso(summer)).toBe('2026-07-15T00:00:00.000Z'); // EDT, UTC-4
    expect(wallClock(summer, NY)).toEqual({ year: 2026, month: 7, day: 14, hour: 20, minute: 0 });
  });

  it('works for zones ahead of UTC', () => {
    const berlin = zonedTime(
      { year: 2026, month: 11, day: 10, hour: 20, minute: 30 },
      'Europe/Berlin',
    );
    expect(iso(berlin)).toBe('2026-11-10T19:30:00.000Z');
  });
});

describe('occurrences', () => {
  const tueThu = { weekdays: ['tue', 'thu'] as const, time: '20:00', timeZone: NY };

  it('lists matching weekdays in [from, to)', () => {
    const from = Date.UTC(2026, 10, 2); // Mon 2 Nov 2026
    const to = from + 7 * 24 * 3600 * 1000;
    expect(occurrences({ ...tueThu, weekdays: [...tueThu.weekdays] }, from, to).map(iso)).toEqual([
      '2026-11-04T01:00:00.000Z', // Tue 3 Nov 20:00 EST
      '2026-11-06T01:00:00.000Z', // Thu 5 Nov 20:00 EST
    ]);
  });

  it('keeps 20:00 local across the November DST change', () => {
    // US DST ends Sun 1 Nov 2026: Tue 27 and Thu 29 Oct are EDT, Tue 3 Nov is EST.
    const from = Date.UTC(2026, 9, 27);
    const to = Date.UTC(2026, 10, 5);
    const starts = occurrences({ ...tueThu, weekdays: [...tueThu.weekdays] }, from, to);
    expect(starts.map(iso)).toEqual([
      '2026-10-28T00:00:00.000Z',
      '2026-10-30T00:00:00.000Z',
      '2026-11-04T01:00:00.000Z',
    ]);
    for (const at of starts) expect(wallClock(at, NY).hour).toBe(20);
  });

  it('lands after the gap when the local time does not exist (spring forward)', () => {
    // 2026-03-08 02:30 doesn't exist in New York; the clock jumps 02:00 → 03:00.
    const at = zonedTime({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY);
    expect(wallClock(at, NY)).toMatchObject({ hour: 3, minute: 30 });
  });

  it('picks the first 01:30 when the local time happens twice (fall back)', () => {
    // 2026-11-01 01:30 happens in EDT (05:30Z) and again in EST (06:30Z).
    const at = zonedTime({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NY);
    expect(iso(at)).toBe('2026-11-01T05:30:00.000Z');
  });

  it('excludes `to` and includes `from`', () => {
    const at = zonedTime({ year: 2026, month: 11, day: 3, hour: 20, minute: 0 }, NY);
    const rec = { weekdays: ['tue' as const], time: '20:00', timeZone: NY };
    expect(occurrences(rec, at, at + 1)).toEqual([at]);
    expect(occurrences(rec, at - 1, at)).toEqual([]);
  });

  it('returns nothing for an empty or inverted window', () => {
    const rec = { weekdays: ['tue' as const], time: '20:00', timeZone: NY };
    expect(occurrences(rec, 10, 10)).toEqual([]);
    expect(occurrences(rec, 10, 5)).toEqual([]);
  });
});

describe('validation helpers', () => {
  it('checks HH:MM and IANA zones', () => {
    expect(isValidTime('20:00')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('8:00')).toBe(false);
    expect(isValidTimeZone(NY)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
