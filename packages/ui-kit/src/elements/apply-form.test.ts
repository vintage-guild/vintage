import type { CommandResult } from '@vintage/guild-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CommandClient, setCommandClient } from '../client';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { OwnApplication, VintageApplyForm } from './apply-form';
import './apply-form';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  cleanup();
});

function useClient(answer: (name: string, input: unknown) => CommandResult) {
  const calls: { name: string; input: unknown }[] = [];
  const client: CommandClient = {
    read: vi.fn(),
    run: vi.fn(async (name: string, input?: unknown) => {
      calls.push({ name, input });
      return answer(name, input);
    }) as CommandClient['run'],
  };
  restore = setCommandClient(client);
  return calls;
}

const mine = (status: OwnApplication['status'], reply: string | null = null): OwnApplication => ({
  id: 'app-1',
  characterName: 'Kol',
  wowClass: 'shaman',
  spec: 'restoration',
  role: 'raider',
  status,
  reply,
});

async function form(application: OwnApplication | null = null) {
  const el = await mount<VintageApplyForm>(
    '<vintage-apply-form applicant-name="Kol"></vintage-apply-form>',
  );
  el.application = application;
  await settle();
  return el;
}

describe('vintage-apply-form', () => {
  it('sends the application with the applicant name, then shows its status', async () => {
    const calls = useClient(() => ({ success: true, data: mine('new') }));
    const el = await form();
    el.set('characterName', ' Kol ');
    el.set('wowClass', 'shaman');
    el.set('spec', 'restoration');
    el.set('about', 'Healer.');
    el.set('experience', 'MC.');
    el.set('availability', 'Tue');
    await el.send();
    expect(calls[0]).toEqual({
      name: 'application-submit',
      input: {
        characterName: 'Kol',
        wowClass: 'shaman',
        spec: 'restoration',
        role: 'raider',
        about: 'Healer.',
        experience: 'MC.',
        availability: 'Tue',
        applicantName: 'Kol',
      },
    });
    await settle();
    expect(shadowText(el)).toContain('The officers have it and will answer in Discord.');
    expect(el.shadowRoot?.querySelector('form')).toBeNull();
  });

  it('shows the officers reply and lets them withdraw while open', async () => {
    const calls = useClient(() => ({ success: true, data: mine('withdrawn') }));
    const el = await form(mine('in-review', 'Can you do Sundays?'));
    expect(shadowText(el)).toContain('Can you do Sundays?');
    await el.withdraw();
    expect(calls[0]).toEqual({ name: 'application-withdraw', input: { applicationId: 'app-1' } });
    await settle();
    expect(shadowText(el)).toContain('You withdrew it.');
    expect(el.shadowRoot?.querySelector('form')).not.toBeNull(); // closed: may apply again
  });

  it('says why a submit was refused', async () => {
    useClient(() => ({
      success: false,
      error: {
        code: 'APPLICATION_OPEN',
        message: 'Your application is still with the officers',
        retryable: false,
      },
    }));
    const el = await form();
    await el.send();
    expect(el.statusKind).toBe('error');
    expect(el.statusText).toMatch(/still with the officers/);
  });
});
