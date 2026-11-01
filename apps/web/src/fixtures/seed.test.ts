import { describe, expect, it } from 'vitest';
import { POLL, RAIDS } from './data';
import { createFixtureHost } from './host';
import { fixtureDates, seedFixtures } from './seed';

const DAY = 24 * 60 * 60 * 1000;

describe('fixture dates', () => {
  it('leaves the dates alone while they are still ahead', () => {
    const before = Date.parse(POLL.closesAt) - 7 * DAY;
    const { weeks, move } = fixtureDates(before);
    expect(weeks).toBe(0);
    expect(move(RAIDS[0]!.startsAt)).toBe(RAIDS[0]!.startsAt);
  });

  it('moves every date forward by whole weeks, keeping weekday and time', () => {
    const later = Date.parse('2027-03-01T12:00:00Z');
    const { weeks, move } = fixtureDates(later);
    expect(weeks).toBeGreaterThan(0);
    const poll = Date.parse(move(POLL.closesAt));
    expect(poll).toBeGreaterThan(later + DAY - 1);
    for (const raid of RAIDS) {
      const moved = move(raid.startsAt);
      expect(moved.slice(10)).toBe(raid.startsAt.slice(10)); // time and offset as written
      expect(new Date(moved).getUTCDay()).toBe(new Date(raid.startsAt).getUTCDay());
    }
  });

  it('seeds on any day, not just the week the fixtures were written', async () => {
    const later = Date.parse('2027-03-01T12:00:00Z');
    const host = createFixtureHost(undefined, { now: () => later });
    await expect(seedFixtures(host)).resolves.toBeUndefined();
  });
});
