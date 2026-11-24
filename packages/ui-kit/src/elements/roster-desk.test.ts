import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import {
  describeRoleDiff,
  isTrialDue,
  type RosterDeskMember,
  SYNC_REREAD_MS,
  TRIAL_LENGTH_DAYS,
  type VintageRosterDesk,
} from './roster-desk';
import './roster-desk';

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

const NOW = Date.UTC(2026, 10, 20, 17);
const DAY = 86_400_000;
const OFFICER_ROLE = '111111111111111111';
const RECRUIT_ROLE = '222222222222222222';

const member = (over: Partial<RosterDeskMember> & { displayName: string }): RosterDeskMember => ({
  id: over.displayName.toLowerCase(),
  rank: 'raider',
  tier: 'raider',
  main: { name: over.displayName, class: 'druid', spec: 'balance', role: 'ranged' },
  rankSince: null,
  syncedAt: NOW - 5 * 60_000,
  ...over,
});

const MEMBERS: RosterDeskMember[] = [
  member({ displayName: 'Aeryn', rank: 'officer', tier: 'officer' }),
  member({ displayName: 'Wren', rank: 'recruit', tier: 'recruit', rankSince: NOW - 12 * DAY }),
  member({
    displayName: 'Pip',
    rank: 'recruit',
    tier: 'recruit',
    rankSince: NOW - 3 * DAY,
    main: null,
  }),
  member({ displayName: 'Old', rank: 'recruit', tier: 'recruit', rankSince: null }),
  member({ displayName: 'Borin', rank: 'raider', rankSince: NOW - 40 * DAY }),
];

async function desk(opts: { configure?: boolean; members?: RosterDeskMember[] } = {}) {
  const el = await mount<VintageRosterDesk>(
    `<vintage-roster-desk time-zone="UTC" ${opts.configure === false ? '' : 'can-configure'}></vintage-roster-desk>`,
  );
  el.now = NOW;
  el.members = opts.members ?? MEMBERS;
  el.roles = { [OFFICER_ROLE]: 'officer', [RECRUIT_ROLE]: 'recruit' };
  await settle();
  return el;
}

const $ = <T extends Element = HTMLElement>(el: Element, s: string) =>
  el.shadowRoot?.querySelector(s) as T;
const $$ = (el: Element, s: string) => [...(el.shadowRoot?.querySelectorAll(s) ?? [])];
const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const button = (el: Element, label: string) =>
  $$(el, 'button').find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

describe('vintage-roster-desk', () => {
  it('lists recruits longest on trial first, with the ones before tracking last', async () => {
    const el = await desk();
    expect(text($(el, '#h-roster'))).toBe('5 members on the rolls');
    const trials = $$(el, '[part="trial"] li').map(text);
    expect(trials).toEqual([
      'Wren on trial 12 days (since Nov 8)',
      'Pip on trial 3 days (since Nov 17) no character yet',
      'Old on trial since before tracking began',
    ]);
    expect($$(el, '[part="trial"] .due')).toHaveLength(0);
    expect(text($(el, '[part="trial"] .note'))).toContain(`Trials run ${TRIAL_LENGTH_DAYS} days`);
  });

  it('flags recruits at or past the two-week trial length as due for review, oldest first (#244)', async () => {
    const el = await desk({
      members: [
        member({ displayName: 'Aeryn', rank: 'officer', tier: 'officer' }),
        member({
          displayName: 'Wren',
          rank: 'recruit',
          tier: 'recruit',
          rankSince: NOW - 12 * DAY,
        }),
        member({
          displayName: 'Tamsin',
          rank: 'recruit',
          tier: 'recruit',
          rankSince: NOW - 14 * DAY,
        }),
        member({
          displayName: 'Bram',
          rank: 'recruit',
          tier: 'recruit',
          rankSince: NOW - 21 * DAY,
          main: null,
        }),
        member({ displayName: 'Old', rank: 'recruit', tier: 'recruit', rankSince: null }),
      ],
    });
    const trials = $$(el, '[part="trial"] li').map(text);
    expect(trials).toEqual([
      'Bram on trial 21 days (since Oct 30) due for review no character yet',
      'Tamsin on trial 14 days (since Nov 6) due for review',
      'Wren on trial 12 days (since Nov 8)',
      'Old on trial since before tracking began',
    ]);
    expect($$(el, '[part="trial"] .due')).toHaveLength(2);
    expect(isTrialDue(NOW - 14 * DAY, NOW)).toBe(true);
    expect(isTrialDue(NOW - 14 * DAY + 1, NOW)).toBe(false);
    expect(isTrialDue(null, NOW)).toBe(false);
  });

  it('names who has no character, and lists everyone by rank with the date they got it', async () => {
    const el = await desk();
    expect(text($(el, '[part="no-character"] p'))).toBe('Pip');
    const rows = $$(el, 'tbody tr').map(text);
    expect(rows[0]).toBe('Aeryn Aeryn · Druid · Ranged DPS Officer before tracking');
    expect(rows[1]).toBe('Borin Borin · Druid · Ranged DPS Raider Oct 11');
    expect(rows.at(-1)).toContain('Wren');
  });

  it('says when Discord last synced, and that the sync stopped when it is an hour old', async () => {
    const el = await desk();
    expect(text($(el, '.head .meta'))).toContain('It runs every 15 minutes.');
    el.members = MEMBERS.map((m) => ({ ...m, syncedAt: NOW - 2 * 3_600_000 }));
    await settle();
    expect($(el, '.head .stale')).toBeTruthy();
    expect(text($(el, '.head .meta'))).toContain('so it has stopped');
  });

  it('reviews the map with the server, then saves it with the preview’s token', async () => {
    const client = useClient((_name, input, token) =>
      token
        ? { success: true, data: { roles: (input as { roles: unknown }).roles } }
        : {
            success: true,
            data: {
              confirmToken: 'tok',
              preview: {
                diff: {
                  added: [{ discordRoleId: '333333333333333333', rank: 'raider' }],
                  removed: [],
                  changed: [],
                  unchanged: 2,
                },
              },
            },
          },
    );
    const el = await desk();
    const changed = vi.fn();
    el.addEventListener('roster-changed', changed);
    el.addRole();
    await settle();
    const inputs = $$(el, '.role input') as HTMLInputElement[];
    inputs[2]!.value = '333333333333333333';
    inputs[2]!.dispatchEvent(new Event('input'));
    const select = $$(el, '.role select')[2] as HTMLSelectElement;
    select.value = 'raider';
    select.dispatchEvent(new Event('change'));
    button(el, 'Review changes')?.click();
    await vi.waitFor(() => expect($(el, '.confirm')).toBeTruthy());
    expect(text($(el, '.confirm ul'))).toBe('Role 333333333333333333 now grants Raider');
    expect(changed).not.toHaveBeenCalled();
    const roles = {
      [OFFICER_ROLE]: 'officer',
      [RECRUIT_ROLE]: 'recruit',
      '333333333333333333': 'raider',
    };
    expect(client.run).toHaveBeenCalledWith('guild-roles-set', { roles });
    button(el, 'Save the role map')?.click();
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(client.run).toHaveBeenLastCalledWith(
      'guild-roles-set',
      { roles },
      { confirmToken: 'tok' },
    );
    await settle();
    expect(text($(el, '.status'))).toContain('Saved.');
  });

  it('refuses a map with no officer role, a bad id, or a duplicate, without asking the server', async () => {
    const client = useClient(() => ({ success: true }));
    const el = await desk();
    el.removeRole(el.rows[0]!);
    await el.review();
    await settle();
    expect(text($(el, '.status'))).toContain('Keep at least one role mapped to Officer');
    el.reset();
    el.addRole();
    el.editRole(el.rows[2]!, 'id', '@Raider');
    await el.review();
    await settle();
    expect(text($(el, '.status'))).toContain('“@Raider” isn’t a Discord role id');
    el.editRole(el.rows[2]!, 'id', RECRUIT_ROLE);
    await el.review();
    await settle();
    expect(text($(el, '.status'))).toBe(`Role ${RECRUIT_ROLE} is listed twice.`);
    expect(client.run).not.toHaveBeenCalled();
  });

  it('keeps an officer’s edits when the page reads again, until they undo', async () => {
    const el = await desk();
    el.addRole();
    el.roles = { [OFFICER_ROLE]: 'officer' };
    await settle();
    expect(el.rows).toHaveLength(3);
    el.reset();
    await settle();
    expect(el.rows).toHaveLength(1);
  });

  it('shows a raid leader the map read-only', async () => {
    const client = useClient(() => ({ success: true }));
    const el = await desk({ configure: false });
    expect($<HTMLFieldSetElement>(el, '.roles fieldset').disabled).toBe(true);
    expect(button(el, 'Review changes')).toBeUndefined();
    expect(button(el, 'Remove')).toBeUndefined();
    expect(button(el, 'Sync now')).toBeUndefined();
    expect(shadowText(el)).toContain('Officers change the role map.');
    expect((await el.review()).success).toBe(false);
    expect((await el.syncNow()).success).toBe(false);
    expect(client.run).not.toHaveBeenCalled();
  });

  it('Sync now schedules a role sync and re-reads the roster once it finishes (#243)', async () => {
    vi.useFakeTimers();
    try {
      const client = useClient(() => ({ success: true, data: { status: 'scheduled' } }));
      const el = await desk();
      const changed = vi.fn();
      el.addEventListener('roster-changed', changed);

      button(el, 'Sync now')?.click();
      await Promise.resolve();
      await settle();
      expect(client.run).toHaveBeenCalledWith('member-sync-request', {});
      expect(shadowText(el)).toContain('Syncing from Discord');
      expect(changed).not.toHaveBeenCalled();

      vi.advanceTimersByTime(SYNC_REREAD_MS);
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Sync now shows the refusal when a sync is already running (#243)', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'SYNC_ALREADY_PENDING',
        message: 'A Discord role sync is already running',
        suggestion: 'Wait a few seconds for it to finish',
      },
    }));
    const el = await desk();
    expect((await el.syncNow()).success).toBe(false);
    await settle();
    expect(shadowText(el)).toContain('A Discord role sync is already running');
    expect(el.syncing).toBe(false);
  });

  it('words a role diff', () => {
    expect(
      describeRoleDiff({
        added: [],
        removed: [{ discordRoleId: '4', rank: 'member' }],
        changed: [{ discordRoleId: '5', from: 'flex-raider', to: 'raider' }],
        unchanged: 0,
      }),
    ).toEqual([
      'Role 5: Flex raider → Raider',
      'Role 4 no longer grants Member; its holders lose it',
    ]);
  });
});
