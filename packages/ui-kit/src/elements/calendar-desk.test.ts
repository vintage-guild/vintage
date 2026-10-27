import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { VintageCalendarDesk } from './calendar-desk';
import type { VintageRaidForm, VintageScheduleForm } from './calendar-forms';
import type { CalendarRaid, CalendarSchedule } from './calendar-shared';
import './calendar-desk';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

function useClient(run: (name: string, input: unknown, token?: string) => CommandResult) {
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown, options?: { confirmToken?: string }) =>
      run(name, input, options?.confirmToken),
    ) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return client;
}

/**
 * Mon 26 Oct 2026, noon UTC: London went back to GMT yesterday, New York stays on EDT until
 * Sunday, so this week's raids land an hour off for Londoners.
 */
const NOW = Date.UTC(2026, 9, 26, 12);
const HOUR = 3_600_000;

const SCHEDULE: CalendarSchedule = {
  id: 's1',
  name: 'Raid night',
  instance: "Onyxia's Lair",
  kind: 'raid',
  size: 40,
  roleTargets: null,
  recurrence: { weekdays: ['wed', 'thu'], time: '20:00', timeZone: 'America/New_York' },
  durationMinutes: 180,
  timings: { leadDays: 7, reminderHours: [72, 24], lockHours: 2 },
  active: true,
};

const raid = (over: Partial<CalendarRaid> = {}): CalendarRaid => ({
  id: 'r1',
  scheduleId: 's1',
  name: 'Raid night',
  instance: "Onyxia's Lair",
  kind: 'raid',
  size: 40,
  startsAt: Date.UTC(2026, 10, 5, 1), // Wed 4 Nov, 20:00 New York (EST)
  durationMinutes: 180,
  status: 'open',
  counts: { accepted: 12, late: 1, tentative: 3, bench: 0 },
  ...over,
});

async function desk(opts: { zone?: string; canEdit?: boolean; raids?: CalendarRaid[] } = {}) {
  const el = await mount<VintageCalendarDesk>(
    `<vintage-calendar-desk time-zone="${opts.zone ?? 'America/New_York'}" ${opts.canEdit === false ? '' : 'can-edit'}></vintage-calendar-desk>`,
  );
  el.now = NOW;
  el.schedules = [SCHEDULE];
  el.raids = opts.raids ?? [raid()];
  await settle();
  return el;
}

const $ = <T extends Element = HTMLElement>(el: Element, s: string) =>
  el.shadowRoot?.querySelector(s) as T;
const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const $$ = (el: Element, s: string) => [...(el.shadowRoot?.querySelectorAll(s) ?? [])];
const button = (el: Element, label: string) =>
  $$(el, 'button').find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

describe('vintage-calendar-desk agenda', () => {
  it('lists raids by day with their counts and where they come from', async () => {
    const el = await desk();
    expect($(el, 'h2').textContent).toBe('1 raid coming up');
    expect($(el, '.day h4').textContent).toMatch(/Wednesday, November 4/);
    const row = text($(el, '.raid'));
    expect(row).toContain('8:00 PM');
    expect(row).toContain('40-player Onyxia');
    expect(row).toContain('Raid night');
    expect(row).toContain('13 of 40 going · 3 tentative');
    expect(row).not.toContain('for the guild');
  });

  it('shows the guild’s clock beside the viewer’s, and the week the clocks disagree', async () => {
    const thisWeek = raid({ id: 'r0', startsAt: Date.UTC(2026, 9, 29, 0) }); // Wed 28 Oct, 20:00 EDT
    const el = await desk({ zone: 'Europe/London', raids: [thisWeek, raid()] });
    const [first, second] = $$(el, '.raid').map((r) => text(r));
    expect(first).toMatch(/12:00 AM GMT/);
    expect(first).toMatch(/Wed, Oct 28, 8:00 PM EDT for the guild/);
    expect(first).toContain('An hour earlier than usual for you');
    expect(second).toMatch(/1:00 AM GMT/);
    expect(second).not.toContain('than usual');
  });

  it('flags live raids that overlap', async () => {
    const el = await desk({
      raids: [
        raid(),
        raid({ id: 'r2', name: 'Alt run', scheduleId: null, startsAt: raid().startsAt + HOUR }),
      ],
    });
    const rows = $$(el, '.raid').map((r) => text(r));
    expect(rows[0]).toContain('Overlaps Alt run');
    expect(rows[1]).toContain('One-off');
  });

  it('folds raids that have ended into Earlier', async () => {
    const past = raid({ id: 'old', status: 'completed', startsAt: NOW - 30 * HOUR });
    const el = await desk({ raids: [past, raid()] });
    expect(text($(el, '.earlier summary'))).toBe('Earlier (1)');
    expect($$(el, '.agenda > .day')).toHaveLength(1);
  });

  it('offers move and cancel before the pull, and mark done once it starts', async () => {
    const started = raid({ id: 'now', startsAt: NOW - HOUR, name: 'Tonight' });
    const el = await desk({ raids: [started, raid()] });
    const [tonight, later] = $$(el, '.raid');
    const labels = (row: Element | undefined) =>
      [...(row?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim());
    expect(labels(tonight)).toEqual(['Mark done', 'Cancel']);
    expect(labels(later)).toEqual(['Move', 'Cancel']);
  });

  it('is read-only without can-edit', async () => {
    const el = await desk({ canEdit: false });
    expect($$(el, '.raid button')).toHaveLength(0);
    expect(button(el, 'Add a one-off raid')).toBeUndefined();
    expect(shadowText(el)).toContain('Raid leaders and officers change the calendar');
  });

  it('switches to the month and back to the agenda on a raid', async () => {
    const el = await desk();
    button(el, 'Month')?.click();
    await settle();
    const month = $(el, 'vintage-raid-month');
    expect(month).toBeTruthy();
    expect(button(el, 'Month')?.getAttribute('aria-pressed')).toBe('true');
    month.shadowRoot?.querySelector<HTMLElement>('[aria-label="Next month"]')?.click();
    await settle();
    month.shadowRoot?.querySelector<HTMLElement>('[data-raid="r1"]')?.click();
    await settle();
    expect(el.view).toBe('agenda');
    expect($(el, '#raid-r1')).toBeTruthy();
  });

  it('says what to do when nothing is coming up', async () => {
    const el = await desk({ raids: [] });
    expect($(el, 'h2').textContent).toBe('No raids coming up');
    expect(text($(el, '.agenda'))).toContain('Create raids now');
  });
});

describe('vintage-calendar-desk actions', () => {
  it('previews a cancel, then cancels with the token', async () => {
    const client = useClient((_name, _input, token) =>
      token
        ? { success: true, data: { cancelled: {} } }
        : { success: true, data: { preview: { signups: 16 }, confirmToken: 't1' } },
    );
    const el = await desk();
    const changed = vi.fn();
    el.addEventListener('calendar-changed', changed);
    ($(el, '.raid') as HTMLElement).querySelector<HTMLButtonElement>('button:last-child')?.click();
    await vi.waitFor(() => expect($(el, '.confirm')).toBeTruthy());
    expect(text($(el, '.confirm'))).toContain('16 people have signed up');
    await settle();
    expect(el.shadowRoot?.activeElement?.textContent?.trim()).toBe('Cancel the raid');
    expect(changed).not.toHaveBeenCalled();
    button(el, 'Cancel the raid')?.click();
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(client.run).toHaveBeenLastCalledWith(
      'raid-cancel',
      { eventId: 'r1' },
      { confirmToken: 't1' },
    );
    await settle();
    expect(text($(el, '.status'))).toBe('Cancelled Raid night');
  });

  it('keeps the raid when the officer backs out', async () => {
    const client = useClient(() => ({
      success: true,
      data: { preview: { signups: 0 }, confirmToken: 't' },
    }));
    const el = await desk();
    await el.cancel('r1');
    await settle();
    expect(text($(el, '.confirm'))).toContain('Nobody has signed up yet');
    button(el, 'Keep it')?.click();
    await settle();
    expect($(el, '.confirm')).toBeNull();
    expect(client.run).toHaveBeenCalledTimes(1);
  });

  it('creates raids now and says how many', async () => {
    useClient(() => ({ success: true, data: { created: [{}, {}] } }));
    const el = await desk();
    button(el, 'Create raids now')?.click();
    await vi.waitFor(() => expect(text($(el, '.status'))).toBe('Created 2 raids'));
  });

  it('shows the server’s refusal with what to do', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'RAID_NOT_STARTED',
        message: 'Raid night hasn’t started yet',
        suggestion: 'Complete it after the raid',
      },
    }));
    const el = await desk();
    await el.complete('r1');
    await settle();
    expect(text($(el, '.status.error'))).toBe(
      'Raid night hasn’t started yet. Complete it after the raid.',
    );
  });

  it('runs a moved raid through raid-reschedule and closes the form', async () => {
    const client = useClient(() => ({ success: true, data: {} }));
    const el = await desk();
    button(el, 'Move')?.click();
    await settle();
    const form = $<VintageRaidForm>(el, 'vintage-raid-form');
    expect(form.date).toBe('2026-11-04');
    expect(form.zone).toBe('America/New_York');
    form.time = '21:00';
    form.shadowRoot?.querySelector('form')?.requestSubmit();
    await vi.waitFor(() =>
      expect(client.run).toHaveBeenCalledWith('raid-reschedule', {
        eventId: 'r1',
        startsAt: Date.UTC(2026, 10, 5, 2),
      }),
    );
    await settle();
    expect($(el, 'vintage-raid-form')).toBeNull();
  });
});

describe('vintage-schedule-form', () => {
  async function form(schedule: CalendarSchedule | null) {
    const el = await desk();
    el.openSchedule(schedule);
    await settle();
    const f = $<VintageScheduleForm>(el, 'vintage-schedule-form');
    const submitted = vi.fn();
    f.addEventListener('form-submit', (e) => submitted((e as CustomEvent).detail));
    return { f, submitted };
  }
  const submit = (f: VintageScheduleForm) => f.shadowRoot?.querySelector('form')?.requestSubmit();

  it('asks for a raid night before adding a schedule', async () => {
    const { f, submitted } = await form(null);
    f.name = 'Raid night';
    f.instance = 'Molten Core';
    submit(f);
    await settle();
    expect(submitted).not.toHaveBeenCalled();
    expect(text(f.shadowRoot?.querySelector('.status') as Element)).toBe(
      'Pick at least one raid night.',
    );
  });

  it('adds a schedule in the guild’s zone with nights in week order', async () => {
    const { f, submitted } = await form(null);
    expect(f.zone).toBe('America/New_York');
    f.name = 'Raid night';
    f.instance = 'Molten Core';
    f.toggleDay('thu', true);
    f.toggleDay('tue', true);
    f.reminders = '24, 72';
    submit(f);
    expect(submitted).toHaveBeenCalledWith({
      command: 'schedule-create',
      input: {
        name: 'Raid night',
        instance: 'Molten Core',
        kind: 'raid',
        size: 40,
        roleTargets: null,
        weekdays: ['tue', 'thu'],
        time: '20:00',
        timeZone: 'America/New_York',
        durationMinutes: 180,
        leadDays: 7,
        lockHours: 2,
        reminderHours: [72, 24],
      },
    });
  });

  it('keeps any length the schedule has', async () => {
    const { f, submitted } = await form({ ...SCHEDULE, durationMinutes: 200 });
    expect(f.shadowRoot?.querySelector<HTMLInputElement>('#duration')?.value).toBe('200');
    f.time = '19:00';
    f.shadowRoot?.querySelector('form')?.requestSubmit();
    expect(submitted).toHaveBeenCalledWith({
      command: 'schedule-update',
      input: { scheduleId: 's1', time: '19:00' },
    });
  });

  it('sends only what changed when editing', async () => {
    const { f, submitted } = await form(SCHEDULE);
    expect(f.weekdays).toEqual(['wed', 'thu']);
    submit(f);
    expect(submitted).not.toHaveBeenCalled();
    expect(f.problem).toBe('Nothing changed.');
    f.time = '19:30';
    f.lockHours = 4;
    submit(f);
    expect(submitted).toHaveBeenCalledWith({
      command: 'schedule-update',
      input: { scheduleId: 's1', time: '19:30', lockHours: 4 },
    });
  });

  it('pre-fills the comp from the kind and size, and follows them until a count is typed', async () => {
    const { f, submitted } = await form(null);
    expect([f.tanks, f.healers, f.dps]).toEqual([4, 10, 26]);
    f.setKind('dungeon');
    expect(f.size).toBe(5);
    expect([f.tanks, f.healers, f.dps]).toEqual([1, 1, 3]);
    await settle();
    expect(f.shadowRoot?.querySelector<HTMLInputElement>('#dps')?.value).toBe('3');
    expect(text(f.shadowRoot?.querySelector('.counts-note') as Element)).toContain(
      '5-player dungeon',
    );
    f.name = 'SM Sundays';
    f.instance = 'Scarlet Monastery';
    f.toggleDay('sun', true);
    submit(f);
    // The usual comp goes out as null, so it keeps following the kind's default.
    expect(submitted).toHaveBeenLastCalledWith({
      command: 'schedule-create',
      input: expect.objectContaining({ kind: 'dungeon', size: 5, roleTargets: null }),
    });

    f.setKind('battleground');
    f.setSize(15);
    expect([f.tanks, f.healers, f.dps]).toEqual([0, 3, 12]);
    f.setCount('healers', 4);
    f.setSize(10);
    expect([f.tanks, f.healers, f.dps]).toEqual([0, 4, 12]);
    submit(f);
    expect(f.problem).toBe('The counts add up to more than 10 players.');
    f.setCount('dps', 6);
    submit(f);
    expect(submitted).toHaveBeenLastCalledWith({
      command: 'schedule-create',
      input: expect.objectContaining({
        kind: 'battleground',
        size: 10,
        roleTargets: { tank: 0, healer: 4, dps: 6 },
      }),
    });
  });

  it('says the counts are set by hand as soon as one is typed', async () => {
    const { f } = await form(null);
    const note = () => text(f.shadowRoot?.querySelector('.counts-note') as Element);
    await settle();
    expect(note()).toBe('The usual comp for a 40-player raid.');
    f.setCount('tanks', 5);
    await settle();
    expect(note()).toContain('Counts set by hand');
  });

  it('refuses a size the kind does not allow', async () => {
    const { f, submitted } = await form(null);
    f.name = 'Fishing';
    f.instance = 'Stranglethorn';
    f.setKind('other');
    f.setSize(41);
    submit(f);
    expect(f.problem).toBe('An event is 1 to 40 players, or leave the size empty for an open one.');
    expect(submitted).not.toHaveBeenCalled();
  });

  it('edits a schedule’s kind and its own counts', async () => {
    const { f, submitted } = await form({
      ...SCHEDULE,
      kind: 'dungeon',
      size: 5,
      roleTargets: { tank: 1, healer: 2, dps: 2 },
    });
    expect(f.kind).toBe('dungeon');
    expect([f.tanks, f.healers, f.dps]).toEqual([1, 2, 2]);
    f.setCount('healers', 1);
    f.setCount('dps', 3);
    submit(f);
    // Back to the dungeon's usual 1/1/3: stored as null, the kind's default.
    expect(submitted).toHaveBeenCalledWith({
      command: 'schedule-update',
      input: { scheduleId: 's1', roleTargets: null },
    });
  });
});

describe('vintage-raid-form', () => {
  it('refuses a time that has passed', async () => {
    const el = await desk();
    el.openRaid(null);
    await settle();
    const f = $<VintageRaidForm>(el, 'vintage-raid-form');
    const submitted = vi.fn();
    f.addEventListener('form-submit', submitted);
    Object.assign(f, {
      name: 'Alt run',
      instance: 'Barrow Deeps',
      date: '2026-10-25',
      time: '20:00',
    });
    f.shadowRoot?.querySelector('form')?.requestSubmit();
    expect(submitted).not.toHaveBeenCalled();
    expect(f.problem).toContain('already passed');
  });

  it('adds a one-off dungeon with its kind and counts', async () => {
    const el = await desk();
    el.openRaid(null);
    await settle();
    const f = $<VintageRaidForm>(el, 'vintage-raid-form');
    const submitted = vi.fn();
    f.addEventListener('form-submit', (e) => submitted((e as CustomEvent).detail));
    f.setKind('dungeon');
    f.setCount('tanks', 1);
    f.setCount('healers', 1);
    f.setCount('dps', 2);
    Object.assign(f, {
      name: 'Cathedral run',
      instance: 'Scarlet Monastery',
      date: '2026-11-04',
      time: '20:00',
    });
    await settle();
    expect(text(f.shadowRoot?.querySelector('button.primary') as Element)).toBe('Add the dungeon');
    f.shadowRoot?.querySelector('form')?.requestSubmit();
    expect(submitted).toHaveBeenCalledWith({
      command: 'raid-create',
      input: expect.objectContaining({
        kind: 'dungeon',
        size: 5,
        roleTargets: { tank: 1, healer: 1, dps: 2 },
      }),
    });
  });

  it('adds an open "other" event with no size or instance', async () => {
    const el = await desk();
    el.openRaid(null);
    await settle();
    const f = $<VintageRaidForm>(el, 'vintage-raid-form');
    const submitted = vi.fn();
    f.addEventListener('form-submit', (e) => submitted((e as CustomEvent).detail));
    f.setKind('other');
    await settle();
    expect(text(f.shadowRoot?.querySelector('label[for="instance"]') as Element)).toBe(
      'Where or what (optional)',
    );
    const size = f.shadowRoot?.querySelector<HTMLInputElement>('#size');
    expect(size?.type).toBe('number');
    size!.value = '';
    size!.dispatchEvent(new Event('input'));
    expect(f.size).toBeNull();
    Object.assign(f, { name: 'Westfall levelling', date: '2026-11-04', time: '20:00' });
    f.shadowRoot?.querySelector('form')?.requestSubmit();
    expect(submitted).toHaveBeenCalledWith({
      command: 'raid-create',
      input: expect.objectContaining({
        kind: 'other',
        instance: '',
        size: null,
        roleTargets: null,
      }),
    });
  });

  it('shows the kind on the agenda for everything but raids', async () => {
    const el = await desk({
      raids: [
        raid(),
        raid({
          id: 'r2',
          kind: 'dungeon',
          size: 5,
          instance: 'Scarlet Monastery',
          scheduleId: null,
        }),
      ],
    });
    const page = text(el.shadowRoot as unknown as Element);
    expect(page).toContain("40-player Onyxia's Lair");
    expect(page).not.toContain('Raid · 40-player');
    expect(page).toContain('Dungeon · 5-player Scarlet Monastery');
  });
});

describe('clockShift', () => {
  it('flags both weeks a year the US and Europe disagree, and nothing else', async () => {
    const { clockShift } = await import('./calendar-shared');
    const at = (y: number, m: number, d: number) => Date.UTC(y, m, d, 0);
    const shift = (ms: number) => clockShift(ms, 'Europe/London', 'America/New_York');
    expect(shift(at(2026, 9, 29))).toMatch(/^An hour earlier/); // Oct 25 to Nov 1
    expect(shift(at(2027, 2, 18))).toMatch(/^An hour earlier/); // Mar 14 to Mar 28, 2027
    expect(shift(at(2026, 10, 12))).toBeNull();
    expect(shift(at(2027, 5, 10))).toBeNull();
    expect(clockShift(at(2026, 9, 29), 'America/New_York', 'America/New_York')).toBeNull();
  });
});
