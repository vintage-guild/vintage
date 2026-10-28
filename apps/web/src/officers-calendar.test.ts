import type { CommandResult } from '@vintage/guild-kit';
import type { RaidEvent, Schedule } from '@vintage/raids/contract';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';

const { calendarRaid, calendarSchedule } = await import('./pages/officers');

const event = (over: Partial<RaidEvent> = {}): RaidEvent => ({
  id: 'r1',
  guildId: 'g',
  scheduleId: 's1',
  name: 'Raid night',
  instance: "Onyxia's Lair",
  kind: 'raid',
  size: 40,
  startsAt: Date.UTC(2026, 10, 5, 1),
  durationMinutes: 180,
  status: 'open',
  roleTargets: null,
  lootMethodId: null,
  notes: null,
  configVersion: 1,
  ...over,
});

const schedule: Schedule = {
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
  notes: null,
  active: true,
  configVersion: 3,
};

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
});

describe('the Calendar tab’s reads', () => {
  it('maps raid-list rows and schedules onto the desk’s shapes', () => {
    expect(
      calendarRaid({
        event: event({ notes: 'Flasks.' }),
        counts: { accepted: 3, late: 1, tentative: 2, bench: 0, declined: 5 },
      }),
    ).toEqual({
      id: 'r1',
      scheduleId: 's1',
      name: 'Raid night',
      instance: "Onyxia's Lair",
      kind: 'raid',
      size: 40,
      startsAt: Date.UTC(2026, 10, 5, 1),
      durationMinutes: 180,
      status: 'open',
      notes: 'Flasks.',
      counts: { accepted: 3, late: 1, tentative: 2, bench: 0 },
    });
    expect(calendarRaid({ event: event() }).counts).toBeNull();
    expect(calendarSchedule(schedule)).not.toHaveProperty('guildId');
    expect(calendarSchedule(schedule).recurrence.weekdays).toEqual(['wed', 'thu']);
    expect(calendarSchedule({ ...schedule, notes: 'On at 7:45.' }).notes).toBe('On at 7:45.');
  });

  it('keeps the newest read when an older one finishes last', async () => {
    const answers: ((r: CommandResult) => void)[] = [];
    restore = setCommandClient({
      read: (name: string) =>
        new Promise<CommandResult>((resolve) => {
          if (name === 'schedule-list') resolve({ success: true, data: [] });
          else answers.push(resolve);
        }) as never,
      run: async () => ({ success: true }),
    });
    const page = document.createElement('vintage-officers-page') as HTMLElement & {
      loadCalendar(): Promise<void>;
      calendarRaids: { name: string }[];
    };
    const older = page.loadCalendar();
    const newer = page.loadCalendar();
    answers[1]?.({ success: true, data: [{ event: event({ name: 'After the change' }) }] });
    await newer;
    answers[0]?.({ success: true, data: [{ event: event({ name: 'Before the change' }) }] });
    await older;
    expect(page.calendarRaids.map((r) => r.name)).toEqual(['After the change']);
  });
});
