import type { CommandResult } from '@vintage/guild-kit';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { setSession } from './session';

const { tabFromUrl } = await import('./pages/officers');
await import('./pages/apply');

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  setSession(null);
});

function client(read: (name: string, input: unknown) => CommandResult) {
  restore = setCommandClient({
    read: (async (name: string, input?: unknown) => read(name, input)) as CommandClient['read'],
    run: async () => ({ success: true }),
  });
}

const session = (tier: string) => ({
  memberId: 'm1',
  displayName: 'Gwendolyn',
  tier,
  rank: null,
  avatarUrl: null,
  timezone: null,
});

describe('the quarters’ Applications tab', () => {
  it('opens from ?tab=applications', () => {
    expect(tabFromUrl('?tab=applications')).toBe('applications');
  });

  it('reads application-list, and tells raid leaders it is for officers', async () => {
    const page = document.createElement('vintage-officers-page') as HTMLElement & {
      loadApplications(): Promise<void>;
      applications: { id: string }[];
      applicationsError: string;
    };
    client((name) =>
      name === 'application-list'
        ? { success: true, data: [{ id: 'app-1' }] }
        : { success: false, error: { code: 'X', message: 'x', retryable: false } },
    );
    await page.loadApplications();
    expect(page.applications.map((a) => a.id)).toEqual(['app-1']);

    client(() => ({
      success: false,
      error: { code: 'COMMAND_NOT_FOUND', message: 'nope', retryable: false },
    }));
    await page.loadApplications();
    expect(page.applications).toEqual([]);
    expect(page.applicationsError).toMatch(/Officers review applications/);
  });
});

describe('/apply', () => {
  it('reads the member’s own application, and knows raiders don’t apply', async () => {
    const reads: string[] = [];
    client((name) => {
      reads.push(name);
      return { success: true, data: { id: 'app-1', status: 'new' } };
    });
    setSession(session('member') as never);
    const page = document.createElement('vintage-apply-page') as HTMLElement & {
      load(): Promise<void>;
      application: { id: string } | null;
      loaded: boolean;
      raiding: boolean;
    };
    await page.load();
    expect(reads).toEqual(['application-get']);
    expect(page.application?.id).toBe('app-1');
    expect(page.loaded).toBe(true);
    expect(page.raiding).toBe(false);
    setSession(session('raider') as never);
    expect(page.raiding).toBe(true);
  });
});
