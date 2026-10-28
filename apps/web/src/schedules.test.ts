import type { Schedule } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import { describeNights, describeTimings, lockLabel } from './schedules';

/** Mon 2 Nov 2026, noon UTC: after US and UK clocks both went back, so EST and GMT. */
const NOW = Date.UTC(2026, 10, 2, 12);

const schedule = (over: Partial<Schedule> = {}): Schedule => ({
  id: 's1',
  guildId: 'g',
  name: 'Raid night',
  instance: "Onyxia's Lair",
  kind: 'raid',
  size: 40,
  recurrence: { weekdays: ['wed', 'thu'], time: '20:00', timeZone: 'America/New_York' },
  durationMinutes: 180,
  timings: { leadDays: 7, reminderHours: [72, 24], lockHours: 2 },
  roleTargets: null,
  lootMethodId: null,
  active: true,
  configVersion: 1,
  ...over,
});

describe('describeNights', () => {
  it('names the nights and time in the viewer’s zone', () => {
    expect(describeNights([schedule()], NOW, 'America/New_York')).toBe(
      'Raid nights are Wednesday and Thursday at 8:00 PM EST.',
    );
    expect(describeNights([schedule()], NOW, 'America/Los_Angeles')).toBe(
      'Raid nights are Wednesday and Thursday at 5:00 PM PST.',
    );
  });

  it('moves the weekday with the zone: 8 pm New York is early next morning in London', () => {
    expect(describeNights([schedule()], NOW, 'Europe/London')).toBe(
      'Raid nights are Thursday and Friday at 1:00 AM GMT.',
    );
  });

  it('keeps different start times apart, and skips inactive schedules', () => {
    const late = schedule({
      id: 's2',
      name: 'Sunday Onyxia',
      recurrence: { weekdays: ['sun'], time: '21:30', timeZone: 'America/New_York' },
    });
    const off = schedule({
      id: 's3',
      active: false,
      recurrence: { ...schedule().recurrence, weekdays: ['mon'] },
    });
    expect(describeNights([schedule(), late, off], NOW, 'America/New_York')).toBe(
      'Raid nights are Wednesday and Thursday at 8:00 PM EST and Sunday at 9:30 PM EST.',
    );
    expect(describeNights([off], NOW, 'America/New_York')).toBeNull();
  });
});

describe('describeTimings', () => {
  it('says the shared timings once', () => {
    expect(describeTimings([schedule(), schedule({ id: 's2', name: 'Sunday' })])).toBe(
      'Signups post 7 days ahead and lock 2 hours before the pull; anyone who hasn’t answered is reminded at 72h and 24h.',
    );
  });

  it('names the schedules when their timings differ', () => {
    const quick = schedule({
      id: 's2',
      name: 'Sunday Onyxia',
      timings: { leadDays: 3, reminderHours: [24], lockHours: 1 },
    });
    expect(describeTimings([schedule(), quick])).toBe(
      'For Raid night, signups post 7 days ahead and lock 2 hours before the pull; anyone who hasn’t answered is reminded at 72h and 24h. ' +
        'For Sunday Onyxia, signups post 3 days ahead and lock 1 hour before the pull; anyone who hasn’t answered is reminded at 24h.',
    );
  });

  it('falls back to the one-off raid timings with no schedule', () => {
    expect(describeTimings([])).toContain('Signups post 7 days ahead');
  });
});

describe('lockLabel', () => {
  const locks = Date.UTC(2026, 10, 7, 23); // Sat 7 Nov, 6:00 PM EST
  it('says when signups lock, in the viewer’s zone', () => {
    expect(lockLabel('open', locks, NOW, 'America/New_York')).toBe('signups lock Sat 6:00 PM EST');
  });
  it('says they close any minute once the time has passed, and locked after', () => {
    expect(lockLabel('open', locks, locks + 1, 'UTC')).toBe('signups close any minute');
    expect(lockLabel('locked', locks, locks + 1, 'UTC')).toBe('locked · roster posted');
  });
  it('says nothing without a lock time', () => {
    expect(lockLabel('open', undefined, NOW)).toBe('');
  });
});
