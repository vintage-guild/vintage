import { CommandRegistry } from '@lushly-dev/fast-element/command.js';
import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { VintageSignupCard } from './signup-card';
import { ANSWERS, EMPTY_COUNTS } from './signup-card';
import './signup-card';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

function useClient(run: (name: string, input: unknown) => CommandResult) {
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown) => run(name, input)) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return client;
}

const buttons = (el: Element) => [
  ...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.seg button'),
];

describe('vintage-signup-card', () => {
  it('shows the raid, time, counts, and the four answers', async () => {
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" event-title="Launch night" starts-at="2026-11-05T01:00:00Z" status="tentative" character-id="c1" character-label="Bloodfen · Protection"></vintage-signup-card>',
    );
    el.counts = { ...EMPTY_COUNTS, accepted: 27, tentative: 4, tank: 4, healer: 7, dps: 16 };
    await settle();
    const text = shadowText(el);
    expect(text).toContain('Launch night');
    expect(text).toContain('27 Going');
    expect(text).toContain('4 Tanks');
    expect(
      [...el.shadowRoot!.querySelectorAll('.counts span')].map((s) => s.textContent?.trim()),
    ).toEqual(['Going', 'Tanks', 'Healers', 'DPS', 'Tentative']);
    expect(text).toContain('as Bloodfen · Protection');
    expect(el.shadowRoot!.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-11-05T01:00:00Z',
    );
    expect(buttons(el).map((b) => b.textContent?.trim())).toEqual([
      'Going',
      'Late',
      'Tentative',
      "Can't",
    ]);
    expect(buttons(el).map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
  });

  it('falls back for unknown status and missing time', async () => {
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card status="maybe"></vintage-signup-card>',
    );
    expect(el.statusKey).toBe('none');
    expect(el.startsLabel).toBe('Time to be announced');
  });

  it('keeps the answers disabled without a raid and a character', async () => {
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1"></vintage-signup-card>',
    );
    expect(el.answerCanExecute).toBe(false);
    expect(buttons(el).every((b) => b.disabled)).toBe(true);
    const result = await el.answer('accepted');
    expect(result).toMatchObject({ success: false, error: { code: 'COMMAND_DISABLED' } });
  });

  it('answers through signup-set with the character, then reflects the stored signup', async () => {
    const client = useClient(() => ({
      success: true,
      data: { id: 's1', status: 'late', queued: false },
      reasoning: 'Bloodfen: late for Launch night',
    }));
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" character-id="c1"></vintage-signup-card>',
    );
    const seen: unknown[] = [];
    el.addEventListener('signup-changed', (e) => seen.push((e as CustomEvent).detail));

    const result = await el.answer('late');
    await settle();
    expect(result.success).toBe(true);
    expect(client.run).toHaveBeenCalledWith('signup-set', {
      eventId: 'e1',
      characterId: 'c1',
      status: 'late',
    });
    expect(el.status).toBe('late');
    expect(el.statusText).toBe('Bloodfen: late for Launch night');
    expect(seen).toEqual([{ id: 's1', status: 'late', queued: false }]);
    expect(buttons(el)[1]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('reports a refusal from the server without changing the answer', async () => {
    useClient(() => ({
      success: false,
      error: { code: 'RAID_CLOSED', message: 'Launch night is locked', retryable: false },
    }));
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" character-id="c1" status="accepted"></vintage-signup-card>',
    );
    const result = await el.answer('declined');
    await settle();
    expect(result.success).toBe(false);
    expect(el.status).toBe('accepted');
    expect(el.statusKind).toBe('error');
    expect(el.statusText).toContain('Launch night is locked');
  });

  it('rejects an answer that is not one of the four', async () => {
    useClient(() => ({ success: true, data: null }));
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" character-id="c1"></vintage-signup-card>',
    );
    const result = await el.answer('bench');
    expect(result).toMatchObject({ success: false, error: { code: 'INVALID_PARAMETERS' } });
    expect(ANSWERS).not.toContain('bench');
  });

  it('is reachable as vintage.signup-set with the status as its argument', async () => {
    const client = useClient(() => ({ success: true, data: { status: 'accepted' } }));
    await mount<VintageSignupCard>(
      '<vintage-signup-card event-id="e1" character-id="c1"></vintage-signup-card>',
    );
    const result = await CommandRegistry.execute('vintage.signup-set', 'accepted');
    expect(result.success).toBe(true);
    expect(client.run).toHaveBeenCalledTimes(1);
  });
});
