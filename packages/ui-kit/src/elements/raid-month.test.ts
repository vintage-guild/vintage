import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, mount, settle } from '../test-helpers';
import type { CalendarRaid } from './calendar-shared';
import { monthWeeks, shiftMonth, type VintageRaidMonth } from './raid-month';
import './raid-month';

afterEach(cleanup);

/** Mon 2 Nov 2026, noon UTC. */
const NOW = Date.UTC(2026, 10, 2, 12);

const raid = (over: Partial<CalendarRaid> = {}): CalendarRaid => ({
  id: 'r1',
  scheduleId: 's1',
  name: 'Raid night',
  instance: "Onyxia's Lair",
  size: 40,
  startsAt: Date.UTC(2026, 10, 5, 1), // Wed 4 Nov, 20:00 New York
  durationMinutes: 180,
  status: 'open',
  counts: null,
  ...over,
});

describe('monthWeeks', () => {
  it('lays November 2026 out Sunday first with blanks around it', () => {
    const weeks = monthWeeks('2026-11', [], 'America/New_York', '2026-11-02');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.[0]?.day).toBe(1); // Nov 1 2026 is a Sunday
    expect(weeks[4]?.[1]?.day).toBe(30);
    expect(weeks[4]?.[2]?.key).toBe('');
    expect(weeks[0]?.[1]?.today).toBe(true);
  });

  it('puts a raid on the day the viewer sees it', () => {
    const ny = monthWeeks('2026-11', [raid()], 'America/New_York', '');
    const london = monthWeeks('2026-11', [raid()], 'Europe/London', '');
    expect(ny[0]?.[3]?.raids.map((r) => r.id)).toEqual(['r1']);
    expect(ny[0]?.[3]?.label).toMatch(/Wednesday, November 4, 1 raid$/);
    expect(london[0]?.[4]?.raids[0]?.time).toMatch(/1:00/);
  });
});

describe('shiftMonth', () => {
  it('crosses years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('vintage-raid-month', () => {
  async function month() {
    const el = await mount<VintageRaidMonth>(
      '<vintage-raid-month time-zone="America/New_York" min="2026-10" max="2026-12"></vintage-raid-month>',
    );
    el.now = NOW;
    el.raids = [
      raid(),
      raid({ id: 'r2', status: 'cancelled', startsAt: Date.UTC(2026, 10, 6, 1) }),
    ];
    await settle();
    return el;
  }
  const $ = (el: Element, s: string) => el.shadowRoot?.querySelector(s) as HTMLElement;

  it('captions the month, marks today, and names cancelled raids', async () => {
    const el = await month();
    expect($(el, '.title').textContent).toBe('November 2026');
    expect($(el, 'caption').textContent).toContain('New York');
    expect($(el, '[aria-current="date"] .sr').textContent).toContain('today');
    expect($(el, '.chip.cancelled').textContent).toContain('Cancelled');
  });

  it('raises raid-selected for a chip', async () => {
    const el = await month();
    const picked = vi.fn();
    el.addEventListener('raid-selected', (e) => picked((e as CustomEvent).detail));
    ($(el, '[data-raid="r1"] .name') as HTMLElement).click();
    expect(picked).toHaveBeenCalledWith({ id: 'r1' });
  });

  it('stops the arrows at the loaded months', async () => {
    const el = await month();
    $(el, '[aria-label="Next month"]').click();
    await settle();
    expect($(el, '.title').textContent).toBe('December 2026');
    expect(($(el, '[aria-label="Next month"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
