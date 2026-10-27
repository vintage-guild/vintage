import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { ruleLead, ruleWords } from '../labels';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import {
  type CoordinatorDeskConfig,
  type CoordinatorDeskRaid,
  RUN_REREAD_MS,
  summarizeRules,
  type VintageCoordinatorDesk,
} from './coordinator-desk';
import './coordinator-desk';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  vi.useRealTimers();
  cleanup();
});

function useClient(
  run: (name: string, input: unknown) => CommandResult = () => ({ success: true }),
) {
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown) => run(name, input)) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return client;
}

const SIGNUPS = '111111111111111111';
const OPS = '222222222222222222';

const config = (over: Partial<CoordinatorDeskConfig> = {}): CoordinatorDeskConfig => ({
  signupChannelId: SIGNUPS,
  opsChannelId: OPS,
  expectedRanks: ['officer', 'raid-leader', 'raider', 'flex-raider'],
  dmReminders: true,
  paused: false,
  ...over,
});

const upcoming = (over: Partial<CoordinatorDeskRaid> = {}): CoordinatorDeskRaid => ({
  eventId: 'r1',
  name: 'Raid night',
  startsAt: Date.UTC(2026, 10, 5, 1),
  status: 'open',
  done: [
    { rule: 'post', status: 'sent', at: 1 },
    { rule: 'dm-24h', status: 'sent', at: 2 },
    { rule: 'dm-24h', status: 'sent', at: 3 },
    { rule: 'remind-72h', status: 'skipped', at: 4 },
  ],
  dueNow: ['lock'],
  waiting: [
    { memberId: 'm1', displayName: 'Aeryn' },
    { memberId: 'm2', displayName: 'Borin' },
  ],
  ...over,
});

async function desk(
  opts: {
    act?: boolean;
    configure?: boolean;
    config?: CoordinatorDeskConfig;
    raids?: CoordinatorDeskRaid[];
  } = {},
) {
  const flags = [
    opts.act === false ? '' : 'can-act',
    opts.configure === false ? '' : 'can-configure',
  ];
  const el = await mount<VintageCoordinatorDesk>(
    `<vintage-coordinator-desk time-zone="America/New_York" ${flags.join(' ')}></vintage-coordinator-desk>`,
  );
  el.config = opts.config ?? config();
  el.upcoming = opts.raids ?? [upcoming()];
  el.entries = [
    {
      id: 'a1',
      eventId: 'r1',
      raidName: 'Raid night',
      rule: 'post',
      status: 'sent',
      detail: null,
      at: Date.UTC(2026, 9, 28, 16),
    },
    {
      id: 'a2',
      eventId: 'r1',
      raidName: 'Raid night',
      rule: 'remind-72h',
      status: 'skipped',
      detail: 'Everyone expected has answered',
      at: Date.UTC(2026, 10, 2, 1),
    },
  ];
  await settle();
  return el;
}

const $ = <T extends Element = HTMLElement>(el: Element, s: string) =>
  el.shadowRoot?.querySelector(s) as T;
const $$ = (el: Element, s: string) => [...(el.shadowRoot?.querySelectorAll(s) ?? [])];
const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const button = (el: Element, label: string) =>
  $$(el, 'button').find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const typeInto = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

describe('rule words', () => {
  it('words every rule the coordinator logs, with the lead time where it has one', () => {
    expect(ruleWords('import-string')).toBe('Sent officers the addon import string');
    expect(ruleWords('promoted-s1-123')).toBe('Told the next in line a spot opened');
    expect(ruleWords('mystery-rule')).toBe('Mystery Rule');
    expect(ruleLead('remind-72h')).toBe('72 hours before');
    expect(ruleLead('dm-1h')).toBe('1 hour before');
    expect(ruleLead('lock')).toBe('');
    expect(ruleWords('final-roster', 'todo')).toBe('Post the final roster');
  });

  it('summarizes a raid’s sends by kind, with lead times and per-member counts', () => {
    expect(summarizeRules(['post', 'remind-72h', 'remind-24h', 'dm-24h', 'dm-24h', 'dm-24h'])).toBe(
      'Posted the signups, Reminded the people who haven’t answered (72 and 24 hours before), Sent reminder DMs ×3 (24 hours before)',
    );
    expect(summarizeRules(['lock'], 'todo')).toBe('Lock the roster');
  });
});

describe('vintage-coordinator-desk', () => {
  it('says Random is running and what it did and will do for each raid', async () => {
    const el = await desk();
    expect(text($(el, '#h-state'))).toBe('Random is running');
    const card = text($(el, '.raid'));
    expect(card).toContain('Posted the signups, Sent reminder DMs ×2 (24 hours before)');
    expect(card).not.toContain('Reminded'); // skipped, so not "done"
    expect(card).toContain('Due now Lock the roster');
    expect(card).toContain('2: Aeryn, Borin');
  });

  it('logs newest first with the reason and a flag for anything not sent', async () => {
    const el = await desk();
    const lines = $$(el, '.log .entry').map(text);
    expect(lines[0]).toContain(
      'Reminded the people who haven’t answered (72 hours before) · Raid night',
    );
    expect(lines[0]).toContain('skipped');
    expect(lines[0]).toContain('Everyone expected has answered');
    expect(lines[1]).toContain('Posted the signups · Raid night');
  });

  it('names paused and not-set-up, and only runs a check when running', async () => {
    const paused = await desk({ config: config({ paused: true }) });
    expect(text($(paused, '#h-state'))).toBe('Random is paused');
    expect(button(paused, 'Resume Random')).toBeTruthy();
    expect(button(paused, 'Pause Random')).toBeUndefined();
    expect(button(paused, 'Run a check now')?.disabled).toBe(true);
    cleanup();
    const bare = await desk({ config: config({ signupChannelId: null }), configure: false });
    expect(text($(bare, '#h-state'))).toBe('Random isn’t set up');
    expect(shadowText(bare)).toContain('An officer needs to give it a signup channel');
  });

  it('pauses, then asks the page to read again', async () => {
    const client = useClient();
    const el = await desk();
    const changed = vi.fn();
    el.addEventListener('coordinator-changed', changed);
    button(el, 'Pause Random')?.click();
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(client.run).toHaveBeenCalledWith('coordinator-pause', {});
    expect(text($(el, '.status'))).toContain('Paused');
  });

  it('reads again a few seconds after a check, when the tick has had time to run', async () => {
    vi.useFakeTimers();
    const client = useClient();
    const el = await desk();
    const changed = vi.fn();
    el.addEventListener('coordinator-changed', changed);
    await el.run();
    expect(client.run).toHaveBeenCalledWith('coordinator-run', {});
    expect(changed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RUN_REREAD_MS);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('replaces a signup post only once Random has posted one', async () => {
    const client = useClient();
    const el = await desk({
      raids: [upcoming(), upcoming({ eventId: 'r2', name: 'Alt night', done: [] })],
    });
    const [first, second] = $$(el, '.raid button') as HTMLButtonElement[];
    expect(second?.disabled).toBe(true);
    first?.click();
    await vi.waitFor(() =>
      expect(client.run).toHaveBeenCalledWith('coordinator-repost', { eventId: 'r1' }),
    );
    await settle();
    expect(text($(el, '.status'))).toContain('A fresh signup post for Raid night');
  });

  it('shows a server refusal in the status line', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'COORDINATOR_PAUSED',
        message: 'The coordinator is paused',
        suggestion: 'Run coordinator-resume first',
      },
    }));
    const el = await desk();
    const result = await el.run();
    expect(result.success).toBe(false);
    await settle();
    expect(text($(el, '.status'))).toBe('The coordinator is paused. Run coordinator-resume first.');
  });

  it('saves only the settings that changed', async () => {
    const client = useClient();
    const el = await desk();
    typeInto($<HTMLInputElement>(el, '#ops'), '');
    const ranks = $$(el, '.ranks input') as HTMLInputElement[];
    ranks[4]!.checked = true; // recruits
    ranks[4]!.dispatchEvent(new Event('change'));
    await settle();
    button(el, 'Save settings')?.click();
    await vi.waitFor(() => expect(client.run).toHaveBeenCalled());
    expect(client.run).toHaveBeenCalledWith('coordinator-config-set', {
      opsChannelId: null,
      expectedRanks: ['officer', 'raid-leader', 'raider', 'flex-raider', 'recruit'],
    });
  });

  it('refuses a channel id that isn’t one, and an empty rank list, without asking the server', async () => {
    const client = useClient();
    const el = await desk();
    typeInto($<HTMLInputElement>(el, '#signup'), '#raid-signups');
    await el.save();
    await settle();
    expect(text($(el, '.status'))).toBe(
      'The signup channel id should be 17 to 20 digits, copied from Discord.',
    );
    typeInto($<HTMLInputElement>(el, '#signup'), SIGNUPS);
    for (const r of ['officer', 'raid-leader', 'raider', 'flex-raider']) el.toggleRank(r, false);
    await el.save();
    await settle();
    expect(text($(el, '.status'))).toBe('Pick at least one rank for Random to chase.');
    expect(client.run).not.toHaveBeenCalled();
  });

  it('keeps an officer’s unsaved edits when the page reads again', async () => {
    const el = await desk();
    typeInto($<HTMLInputElement>(el, '#ops'), '333333333333333333');
    el.config = config({ paused: true });
    await settle();
    expect($<HTMLInputElement>(el, '#ops').value).toBe('333333333333333333');
    el.reset();
    await settle();
    expect($<HTMLInputElement>(el, '#ops').value).toBe(OPS);
  });

  it('lets a raid leader run Random but only read its settings', async () => {
    const client = useClient();
    const el = await desk({ configure: false });
    expect(button(el, 'Save settings')).toBeUndefined();
    expect($<HTMLFieldSetElement>(el, '.settings fieldset').disabled).toBe(true);
    expect(shadowText(el)).toContain('Officers change Random’s settings');
    expect((await el.save()).success).toBe(false);
    expect(client.run).not.toHaveBeenCalled();
    expect(button(el, 'Pause Random')).toBeTruthy();
  });

  it('hides the controls without can-act', async () => {
    const el = await desk({ act: false, configure: false });
    expect(button(el, 'Pause Random')).toBeUndefined();
    expect($$(el, '.raid button')).toHaveLength(0);
  });
});
