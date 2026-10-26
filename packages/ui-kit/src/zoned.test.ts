import { describe, expect, it } from 'vitest';
import { dayKey, instantFromInputs, offsetMinutes, timeOfDay, zonedInstant } from './zoned';

describe('zonedInstant', () => {
  it('turns a zone’s wall clock into the right instant on both sides of DST', () => {
    // 20:00 New York on Wed 28 Oct 2026 is EDT (UTC-4); on Wed 4 Nov it is EST (UTC-5).
    expect(zonedInstant(2026, 9, 28, 20, 0, 'America/New_York')).toBe(Date.UTC(2026, 9, 29, 0));
    expect(zonedInstant(2026, 10, 4, 20, 0, 'America/New_York')).toBe(Date.UTC(2026, 10, 5, 1));
  });
});

describe('dayKey and timeOfDay', () => {
  it('read the day and time a viewer sees, which can be the next day', () => {
    const raid = Date.UTC(2026, 10, 5, 1); // Wed 20:00 New York
    expect(dayKey(raid, 'America/New_York')).toBe('2026-11-04');
    expect(timeOfDay(raid, 'America/New_York')).toBe('20:00');
    expect(dayKey(raid, 'Europe/London')).toBe('2026-11-05');
    expect(timeOfDay(raid, 'Europe/London')).toBe('01:00');
  });
});

describe('offsetMinutes', () => {
  it('follows DST', () => {
    expect(offsetMinutes(Date.UTC(2026, 9, 29), 'America/New_York')).toBe(-240);
    expect(offsetMinutes(Date.UTC(2026, 10, 5), 'America/New_York')).toBe(-300);
  });
});

describe('instantFromInputs', () => {
  it('reads date and time inputs in a zone', () => {
    expect(instantFromInputs('2026-11-04', '20:00', 'America/New_York')).toBe(
      Date.UTC(2026, 10, 5, 1),
    );
  });

  it('answers null for half-filled inputs', () => {
    expect(instantFromInputs('', '20:00', 'America/New_York')).toBeNull();
    expect(instantFromInputs('2026-11-04', '8pm', 'America/New_York')).toBeNull();
  });
});
