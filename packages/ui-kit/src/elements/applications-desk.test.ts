import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { ApplicationsDeskRow, VintageApplicationsDesk } from './applications-desk';
import { labelsText } from './applications-desk';
import './applications-desk';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

type Call = { name: string; input: unknown; confirmToken?: string };

function useClient(answer: (call: Call) => CommandResult) {
  const calls: Call[] = [];
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown, options?: { confirmToken?: string }) => {
      const call = {
        name,
        input,
        ...(options?.confirmToken ? { confirmToken: options.confirmToken } : {}),
      };
      calls.push(call);
      return answer(call);
    }) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return calls;
}

const row = (id: string, status: ApplicationsDeskRow['status'] = 'new'): ApplicationsDeskRow => ({
  id,
  applicantName: `${id}-name`,
  characterName: `Char${id}`,
  wowClass: 'shaman',
  spec: 'restoration',
  role: 'raider',
  about: 'About me.',
  experience: 'MC.',
  availability: 'Tue',
  status,
  labels: { role: 'raider', complete: true, fit: 3 },
  reply: null,
  createdAt: 0,
});

async function desk(rows: ApplicationsDeskRow[]) {
  const el = await mount<VintageApplicationsDesk>(
    '<vintage-applications-desk></vintage-applications-desk>',
  );
  el.applications = rows;
  await settle();
  return el;
}

const button = (el: Element, text: string) =>
  [...(el.shadowRoot?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;

describe('vintage-applications-desk', () => {
  it('lists open applications, selects the first, and shows its labels', async () => {
    const el = await desk([row('1'), row('2', 'accepted')]);
    expect(el.visible().map((a) => a.id)).toEqual(['1']);
    expect(shadowText(el)).toContain('reads as raider · complete · fit strong');
    expect(shadowText(el)).toContain('About me.');
    el.filter(true);
    await settle();
    expect(el.visible().map((a) => a.id)).toEqual(['1', '2']);
  });

  it('accepts with the written reply and asks the page to re-read', async () => {
    const calls = useClient(() => ({ success: true, data: {} }));
    const el = await desk([row('1')]);
    let changed = 0;
    el.addEventListener('applications-changed', () => changed++);
    el.replyText = 'Welcome!';
    button(el, 'Accept')?.click();
    await settle();
    expect(calls).toEqual([
      {
        name: 'application-review',
        input: { applicationId: '1', status: 'accepted', reply: 'Welcome!' },
      },
    ]);
    expect(changed).toBe(1);
    expect(el.statusText).toMatch(/give them the recruit role in Discord/);
  });

  it('declines only on the second click, with the preview token', async () => {
    const calls = useClient((c) =>
      c.confirmToken
        ? { success: true, data: {} }
        : { success: true, data: { confirmToken: 'tok-1' } },
    );
    const el = await desk([row('1')]);
    await el.decline();
    await settle();
    expect(button(el, 'Confirm decline')).toBeTruthy();
    expect(calls).toHaveLength(1);
    await el.decline();
    expect(calls[1]).toEqual({
      name: 'application-decline',
      input: { applicationId: '1' },
      confirmToken: 'tok-1',
    });
    expect(el.statusText).toBe('Declined.');
  });

  it('says why an action failed', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'APPLICATION_CLOSED',
        message: 'This application is already accepted',
        retryable: false,
      },
    }));
    const el = await desk([row('1')]);
    await el.accept();
    expect(el.statusKind).toBe('error');
    expect(el.statusText).toMatch(/already accepted/);
  });

  it('has no actions for a closed application, and an empty message', async () => {
    const el = await desk([row('2', 'declined')]);
    expect(shadowText(el)).toContain('No open applications.');
    el.filter(true);
    el.select('2');
    await settle();
    expect(button(el, 'Accept')).toBeUndefined();
  });

  it('words labels, including unsure ones', () => {
    expect(labelsText(null)).toBe('Not labeled');
    expect(labelsText({ role: null, complete: false, fit: null })).toBe(
      'role unsure · incomplete · fit unsure',
    );
  });
});
