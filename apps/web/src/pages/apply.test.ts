import { Updates } from '@lushly-dev/fast-element';
import type { ApplyCheck } from '@vintage/applications/contract';
import type { CommandResult } from '@vintage/guild-kit';
import { STARTER_PROFILE } from '@vintage/site/contract';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSession } from '../session';

const INVITE = 'https://discord.gg/vintage';
const OK: ApplyCheck = {
  canApply: true,
  reason: null,
  message: null,
  suggestion: null,
  retryAt: null,
};
const blocked = (reason: ApplyCheck['reason'], message: string, suggestion: string) =>
  ({ canApply: false, reason, message, suggestion, retryAt: null }) as ApplyCheck;
const NOT_IN = blocked(
  'not-in-server',
  'Join the Vintage Discord before you apply',
  'Officers answer applications there; join, then apply again',
);

/** A client whose `application-check` answers come from `checks`, one per read (the last repeats). */
function useClient(checks: (ApplyCheck | null)[], own: unknown = null) {
  const queue = [...checks];
  const read = vi.fn(async (name: string): Promise<CommandResult<unknown>> => {
    if (name === 'application-get') return { success: true, data: own };
    if (name === 'application-check') {
      const next = queue.length > 1 ? queue.shift() : queue[0];
      return next
        ? { success: true, data: next }
        : { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } };
    }
    if (name === 'guild-profile-get') {
      return { success: true, data: { ...STARTER_PROFILE, discordInvite: INVITE } };
    }
    return { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'no' } };
  });
  const run = vi.fn(
    async (): Promise<CommandResult<unknown>> => ({ success: true, data: { status: 'current' } }),
  );
  return { previous: setCommandClient({ read, run } as unknown as CommandClient), read, run };
}

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Updates.next();
    await new Promise((r) => setTimeout(r, 0));
  }
};

async function open() {
  setSession({ memberId: null, displayName: 'Kol', tier: 'public' } as never);
  await import('./apply');
  document.body.innerHTML = '<vintage-apply-page></vintage-apply-page>';
  await flush();
  return document.querySelector('vintage-apply-page')!.shadowRoot!;
}

let restore: CommandClient | undefined;
beforeEach(() => {
  history.replaceState(null, '', '/apply');
});
afterEach(() => {
  if (restore) setCommandClient(restore);
  setSession(null);
  document.body.replaceChildren();
});

describe('/apply (#145)', () => {
  it('asks someone outside the Discord to join first, then shows the form once they have', async () => {
    const client = useClient([NOT_IN, OK]);
    restore = client.previous;
    const root = await open();
    expect(root.querySelector('vintage-apply-form')).toBeNull();
    const join = root.querySelector('[data-step="join"]')!;
    expect(join.querySelector('a.join-link')?.getAttribute('href')).toBe(INVITE);

    (join.querySelector('violet-button') as HTMLElement).click();
    await flush();
    expect(client.run).toHaveBeenCalledWith('member-refresh', {});
    expect(root.querySelector('[data-step="join"]')).toBeNull();
    expect(root.querySelector('vintage-apply-form')).not.toBeNull();
  });

  it('says when to try again while the guild limit holds applications, with no form', async () => {
    restore = useClient([
      blocked('busy', 'The application limit has been reached', 'Try again in 7 minutes'),
    ]).previous;
    const root = await open();
    expect(root.querySelector('vintage-apply-form')).toBeNull();
    expect(root.querySelector('[data-step="blocked"]')?.textContent).toBe(
      'The application limit has been reached. Try again in 7 minutes.',
    );
  });

  it('shows the form when the check can’t be read, leaving the refusal to submit', async () => {
    restore = useClient([null]).previous;
    const root = await open();
    expect(root.querySelector('vintage-apply-form')).not.toBeNull();
  });

  it('shows your application where it stands, whatever the check says', async () => {
    restore = useClient(
      [blocked('open', 'Your application is still with the officers', 'Check it')],
      { id: 'a1', status: 'new' },
    ).previous;
    const root = await open();
    expect(root.querySelector('vintage-apply-form')).not.toBeNull();
    expect(root.querySelector('[data-step="blocked"]')).toBeNull();
  });
});
