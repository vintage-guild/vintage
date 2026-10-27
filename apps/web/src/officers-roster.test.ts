import type { CommandResult } from '@vintage/guild-kit';
import {
  type CommandClient,
  type RosterDeskMember,
  type RosterDeskRoles,
  setCommandClient,
  type VintageRosterDesk,
} from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { ROLE_IDS } from './fixtures/data';
import { createFixtureHost, createHostClient } from './fixtures/host';
import { seedFixtures } from './fixtures/seed';

await import('./pages/officers');

type Page = HTMLElement & {
  loadRoster(): Promise<void>;
  rosterMembers: RosterDeskMember[];
  rosterRoles: RosterDeskRoles | null;
  rosterError: string;
  rosterLoaded: boolean;
};

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
});

const page = () => document.createElement('vintage-officers-page') as Page;

describe('the Roster tab’s reads', () => {
  it('reads the rolls and the role map, then saves the map through the real preview and confirm', async () => {
    const host = createFixtureHost();
    await seedFixtures(host);
    const aeryn = await host.member('Aeryn');
    if (!aeryn) throw new Error('fixtures: Aeryn is missing');
    restore = setCommandClient(createHostClient(host, host.callerFor(aeryn)));
    const p = page();
    await p.loadRoster();
    expect(p.rosterError).toBe('');
    const recruit = p.rosterMembers.find((m) => m.rank === 'recruit');
    expect(recruit?.rankSince).toEqual(expect.any(Number));
    expect(recruit?.syncedAt).toEqual(expect.any(Number));
    expect(p.rosterRoles?.[ROLE_IDS.officer]).toBe('officer');

    const desk = document.createElement('vintage-roster-desk') as VintageRosterDesk;
    desk.canConfigure = true;
    desk.roles = p.rosterRoles;
    desk.removeRole(desk.rows.find((r) => r.id === ROLE_IDS.member)!);
    const preview = await desk.review();
    expect(preview.success).toBe(true);
    expect(desk.pending?.lines).toEqual([
      `Role ${ROLE_IDS.member} no longer grants Member; its holders lose it`,
    ]);
    expect((await desk.confirm()).success).toBe(true);
    await p.loadRoster();
    expect(p.rosterRoles?.[ROLE_IDS.member]).toBeUndefined();
    expect(p.rosterRoles?.[ROLE_IDS.officer]).toBe('officer');
  });

  it('keeps the newest roster when an older read finishes last', async () => {
    const answers: ((r: CommandResult) => void)[] = [];
    restore = setCommandClient({
      read: ((name: string) =>
        new Promise<CommandResult>((resolve) => {
          if (name === 'member-list') answers.push(resolve);
          else resolve({ success: true, data: {} });
        })) as never,
      run: async () => ({ success: true }),
    });
    const p = page();
    const older = p.loadRoster();
    const newer = p.loadRoster();
    await Promise.resolve();
    answers[1]?.({ success: true, data: [{ id: 'new' }] });
    await newer;
    answers[0]?.({ success: true, data: [{ id: 'old' }] });
    await older;
    expect(p.rosterMembers.map((m) => m.id)).toEqual(['new']);
    expect(p.rosterLoaded).toBe(true);
  });

  it('keeps the members showing and says why when the role map can’t be read', async () => {
    restore = setCommandClient({
      read: (async (name: string) =>
        name === 'guild-roles-get'
          ? { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command' } }
          : { success: true, data: [{ id: 'm1' }] }) as never,
      run: async () => ({ success: true }),
    });
    const p = page();
    await p.loadRoster();
    expect(p.rosterError).toBe('Couldn’t read the roster: Unknown command.');
    expect(p.rosterMembers).toHaveLength(1);
    expect(p.rosterRoles).toBeNull();
  });
});
