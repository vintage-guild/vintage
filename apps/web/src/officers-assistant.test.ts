// The officers' side panel (#168) against the dev fixtures: the real agent commands and ledger,
// the fixtures' stand-in turn, and the real raids commands behind it.
import type { Caller } from '@vintage/guild-kit';
import type { RaidEvent } from '@vintage/raids/contract';
import { type CommandClient, setCommandClient, type VintageAgentPanel } from '@vintage/ui-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFixtureHost, createHostClient } from './fixtures/host';
import { seedFixtures } from './fixtures/seed';

const { tabFromUrl } = await import('./pages/officers');

let restore: CommandClient | undefined;
afterEach(() => {
  vi.useRealTimers();
  if (restore) setCommandClient(restore);
  restore = undefined;
  document.body.replaceChildren();
});

describe('Random in the officers’ quarters (dev fixtures)', () => {
  it('prepares a lock for the raid in view, and runs it when the officer confirms', async () => {
    expect(tabFromUrl('?tab=tonight')).toBe('tonight');
    const host = createFixtureHost();
    await seedFixtures(host);
    const aeryn = await host.member('Aeryn');
    if (!aeryn) throw new Error('no officer seeded');
    const officer: Caller = host.callerFor(aeryn);
    restore = setCommandClient(createHostClient(host, officer));

    const raids = await host.run<{ event: RaidEvent }[]>(officer, 'raid-list', {});
    const raid = (raids.data ?? []).find((r) => r.event.status === 'open')?.event;
    if (!raid) throw new Error('no open raid seeded');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const panel = document.createElement('vintage-agent-panel') as VintageAgentPanel;
    document.body.append(panel);
    panel.context = {
      page: 'Officers’ quarters · Tonight',
      selection: { kind: 'raid', id: raid.id, label: raid.name },
    };
    const asked = await panel.ask('Lock the roster for this raid');
    expect(asked.success).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    await panel.poll();

    const [turn] = panel.runs;
    expect(turn).toMatchObject({ status: 'answered', notes: [expect.stringContaining('locking')] });
    expect(turn?.toolCalls.map((c) => c.command)).toEqual(['roster-lock']);
    expect(turn?.confirmations).toMatchObject([{ status: 'pending' }]);

    const changed = vi.fn();
    panel.addEventListener('agent-changed', changed);
    const confirmed = await panel.confirm(turn?.confirmations[0]?.id ?? '');
    expect(confirmed.success).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    const after = await host.run<RaidEvent>(officer, 'raid-get', { eventId: raid.id });
    expect(
      (after.data as unknown as { event?: RaidEvent })?.event?.status ??
        (after.data as RaidEvent)?.status,
    ).toBe('locked');
  });
});

describe('the docked panel', () => {
  it('marks the document while open, so the site makes room, and gives it back on leaving', async () => {
    sessionStorage.clear();
    const page = document.createElement('vintage-officers-page') as HTMLElement & {
      toggleAssistant(open?: boolean): void;
      assistantOpen: boolean;
    };
    page.toggleAssistant(true);
    expect(document.documentElement.hasAttribute('data-assistant-open')).toBe(true);
    expect(sessionStorage.getItem('vintage:agent-open')).toBe('1');
    page.toggleAssistant(false);
    expect(document.documentElement.hasAttribute('data-assistant-open')).toBe(false);
    page.toggleAssistant(true);
    document.body.append(page);
    page.remove();
    expect(document.documentElement.hasAttribute('data-assistant-open')).toBe(false);
  });
});
