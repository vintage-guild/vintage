import type { Caller, CommandResult } from '@vintage/guild-kit';
import { type Progress, RAIDS_OPEN_AT } from '@vintage/progress/contract';
import { type CommandClient, setCommandClient, type VintageProgressDesk } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureHost, createHostClient } from './fixtures/host';

await import('./pages/officers');

type Page = HTMLElement & {
  loadProgress(): Promise<void>;
  progress: Progress | null;
  progressError: string;
  progressLoaded: boolean;
};

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
});

const page = () => document.createElement('vintage-officers-page') as Page;

/** Three days after the raids unlock. */
const AFTER_UNLOCK = RAIDS_OPEN_AT + 3 * 86_400_000;

describe('the Progress tab’s reads', () => {
  it('records a kill from the desk through the real command, and reads it back', async () => {
    const host = createFixtureHost(undefined, { now: () => AFTER_UNLOCK });
    const leader: Caller = {
      surface: 'web',
      guildId: host.guildId,
      tier: 'leader',
      memberId: 'm-garrick',
    };
    restore = setCommandClient(createHostClient(host, leader));
    const p = page();
    await p.loadProgress();
    expect(p.progress?.open).toBe(true);
    const desk = document.createElement('vintage-progress-desk') as VintageProgressDesk;
    desk.canRecord = true;
    desk.open = true;
    desk.timeZone = 'UTC';
    desk.raids = p.progress?.raids ?? [];
    desk.pickRaid('onyxias-lair');
    const died = new Date(AFTER_UNLOCK - 3_600_000).toISOString();
    desk.edit('date', died.slice(0, 10));
    desk.edit('time', died.slice(11, 16));
    desk.addDrop();
    desk.editDrop(desk.drops[0]!, 'name', 'Head of Onyxia');
    const recorded = await desk.record();
    expect(recorded).toMatchObject({ success: true, data: { first: true } });
    await p.loadProgress();
    expect(p.progressError).toBe('');
    expect(p.progress?.latest).toMatchObject({
      bossName: 'Onyxia',
      killedAt: Date.parse(`${died.slice(0, 16)}Z`),
      loot: [{ name: 'Head of Onyxia', quality: 'epic' }],
    });
  });

  it('keeps the newest ledger when an older read finishes last', async () => {
    const answers: ((r: CommandResult) => void)[] = [];
    restore = setCommandClient({
      read: (() => new Promise<CommandResult>((resolve) => answers.push(resolve))) as never,
      run: async () => ({ success: true }),
    });
    const p = page();
    const older = p.loadProgress();
    const newer = p.loadProgress();
    answers[1]?.({ success: true, data: { killed: 2 } });
    await newer;
    answers[0]?.({ success: true, data: { killed: 1 } });
    await older;
    expect(p.progress?.killed).toBe(2);
    expect(p.progressLoaded).toBe(true);
  });

  it('says why when the ledger can’t be read', async () => {
    restore = setCommandClient({
      read: (async () => ({
        success: false,
        error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command' },
      })) as never,
      run: async () => ({ success: true }),
    });
    const p = page();
    await p.loadProgress();
    expect(p.progressError).toBe('Couldn’t read the ledger: Unknown command.');
    expect(p.progressLoaded).toBe(true);
  });
});
