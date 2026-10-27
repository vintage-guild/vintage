import type { CoordinatorAction } from '@vintage/coordinator/contract';
import type { CommandResult } from '@vintage/guild-kit';
import type { RaidEvent } from '@vintage/raids/contract';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';

const { coordinatorEntry } = await import('./pages/officers');

const action = (over: Partial<CoordinatorAction> = {}): CoordinatorAction => ({
  id: 'a1',
  guildId: 'g',
  eventId: 'r1',
  rule: 'post',
  target: '111111111111111111',
  status: 'sent',
  discordMessageId: 'm1',
  detail: null,
  renderHash: null,
  claimedAt: 100,
  finishedAt: 200,
  ...over,
});

const event = (id: string, name: string): RaidEvent => ({
  id,
  guildId: 'g',
  scheduleId: null,
  name,
  instance: "Onyxia's Lair",
  kind: 'raid',
  size: 40,
  startsAt: Date.now() - 86_400_000,
  durationMinutes: 180,
  status: 'completed',
  roleTargets: null,
  lootMethodId: null,
  configVersion: 1,
});

const CONFIG = {
  signupChannelId: '111111111111111111',
  opsChannelId: null,
  expectedRanks: ['raider'],
  dmReminders: true,
  paused: false,
  updatedAt: 1,
};

type Page = HTMLElement & {
  loadCoordinator(): Promise<void>;
  coordinatorEntries: { eventId: string; raidName: string }[];
  coordinatorConfig: { paused: boolean } | null;
  coordinatorError: string;
};

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
});

describe('the Random tab’s reads', () => {
  it('maps a log row, timing it by when it finished or else when it was claimed', () => {
    expect(coordinatorEntry(action(), 'Raid night')).toEqual({
      id: 'a1',
      eventId: 'r1',
      raidName: 'Raid night',
      rule: 'post',
      status: 'sent',
      detail: null,
      at: 200,
    });
    expect(coordinatorEntry(action({ finishedAt: null }), 'Raid night').at).toBe(100);
  });

  it('logs the upcoming raids and last week’s, each once', async () => {
    const asked: string[] = [];
    restore = setCommandClient({
      read: (async (name: string, input?: { eventId?: string }) => {
        if (name === 'coordinator-status') {
          return {
            success: true,
            data: {
              config: CONFIG,
              upcoming: [
                {
                  eventId: 'r1',
                  name: 'Raid night',
                  startsAt: 0,
                  status: 'open',
                  done: [],
                  dueNow: [],
                  waiting: [],
                },
              ],
            },
          };
        }
        if (name === 'raid-list') {
          return {
            success: true,
            data: [{ event: event('r0', 'Last Wednesday') }, { event: event('r1', 'Raid night') }],
          };
        }
        asked.push(input?.eventId ?? '');
        return {
          success: true,
          data: [action({ id: `a-${input?.eventId}`, eventId: input?.eventId ?? '' })],
        };
      }) as never,
      run: async () => ({ success: true }),
    });
    const page = document.createElement('vintage-officers-page') as Page;
    await page.loadCoordinator();
    expect(asked.sort()).toEqual(['r0', 'r1']);
    expect(page.coordinatorEntries.map((e) => e.raidName).sort()).toEqual([
      'Last Wednesday',
      'Raid night',
    ]);
    expect(page.coordinatorConfig?.paused).toBe(false);
  });

  it('keeps the newest status when an older read finishes last', async () => {
    const answers: ((r: CommandResult) => void)[] = [];
    restore = setCommandClient({
      read: ((name: string) =>
        new Promise<CommandResult>((resolve) => {
          if (name === 'coordinator-status') answers.push(resolve);
          else resolve({ success: true, data: [] });
        })) as never,
      run: async () => ({ success: true }),
    });
    const page = document.createElement('vintage-officers-page') as Page;
    const older = page.loadCoordinator();
    const newer = page.loadCoordinator();
    await Promise.resolve();
    answers[1]?.({ success: true, data: { config: { ...CONFIG, paused: true }, upcoming: [] } });
    await newer;
    answers[0]?.({ success: true, data: { config: CONFIG, upcoming: [] } });
    await older;
    expect(page.coordinatorConfig?.paused).toBe(true);
  });

  it('says why when Random’s status can’t be read', async () => {
    restore = setCommandClient({
      read: (async (name: string) =>
        name === 'coordinator-status'
          ? { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command' } }
          : { success: true, data: [] }) as never,
      run: async () => ({ success: true }),
    });
    const page = document.createElement('vintage-officers-page') as Page;
    await page.loadCoordinator();
    expect(page.coordinatorError).toBe('Couldn’t ask Random how it’s doing: Unknown command.');
  });
});
