// The home page's signup card gets signup-suggest's guess and the "needed" hints (#148).
import type { CommandResult } from '@vintage/guild-kit';
import type { RaidEvent, Signup } from '@vintage/raids/contract';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { setSession } from './session';

await import('./pages/home');

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  setSession(null);
});

const event = {
  id: 'r1',
  name: 'Scarlet run',
  instance: 'Scarlet Monastery',
  kind: 'dungeon',
  size: 5,
  startsAt: Date.now() + 86_400_000,
  status: 'open',
  roleTargets: { tank: 1, healer: 1, dps: 3 },
} as RaidEvent;
const signup = (memberId: string, role: Signup['role']) =>
  ({ memberId, role, status: 'accepted', queued: false }) as Signup;

type HomePage = HTMLElement & {
  loadRaids(): Promise<void>;
  guess: { characterId: string; reason: string } | null;
  nextNeeded: string[];
};

function client(read: (name: string, input: unknown) => CommandResult) {
  const reads: string[] = [];
  restore = setCommandClient({
    read: (async (name: string, input?: unknown) => {
      reads.push(name);
      return read(name, input);
    }) as CommandClient['read'],
    run: async () => ({ success: true }),
  });
  return reads;
}

const reader = (name: string): CommandResult => {
  if (name === 'raid-list') {
    return {
      success: true,
      data: [
        {
          event,
          counts: { accepted: 2, late: 0, tentative: 0, bench: 0, declined: 0 },
          myStatus: 'accepted',
        },
      ],
    };
  }
  if (name === 'signup-list') {
    return { success: true, data: [signup('m1', 'tank'), signup('m2', 'healer')] };
  }
  if (name === 'signup-suggest') {
    return { success: true, data: { characterId: 'c2', spec: 'feral', reason: 'your main' } };
  }
  return { success: true, data: null };
};

describe('the home signup card', () => {
  it("reads the guess for the next raid and the roles it's short of, not counting me", async () => {
    const reads = client(reader);
    setSession({ memberId: 'm1', tier: 'raider', rank: 'raider' } as never);
    const page = document.createElement('vintage-home-page') as HomePage;
    await page.loadRaids();
    expect(reads).toContain('signup-suggest');
    expect(page.guess).toMatchObject({ characterId: 'c2', reason: 'your main' });
    // m1's tank signup doesn't count: switching away would leave the raid short of a tank.
    expect(page.nextNeeded).toEqual(['tank', 'dps']);
  });

  it('hands the card a role picked for the raid, and nothing when the role follows the spec', async () => {
    let picked = true;
    client((name) =>
      name === 'signup-list'
        ? {
            success: true,
            data: [{ ...signup('m1', 'tank'), rolePicked: picked }, signup('m2', 'healer')],
          }
        : reader(name),
    );
    setSession({ memberId: 'm1', tier: 'raider', rank: 'raider' } as never);
    const page = document.createElement('vintage-home-page') as HomePage & {
      mySignup: Signup | null;
    };
    await page.loadRaids();
    expect(page.mySignup).toMatchObject({ memberId: 'm1', role: 'tank', rolePicked: true });
    picked = false;
    await page.loadRaids();
    expect(page.mySignup?.rolePicked).toBe(false);
  });

  it('asks for no guess when the viewer cannot sign up', async () => {
    const reads = client(reader);
    setSession({ memberId: 'm9', tier: 'member', rank: 'member' } as never);
    const page = document.createElement('vintage-home-page') as HomePage;
    await page.loadRaids();
    expect(reads).not.toContain('signup-suggest');
    expect(page.guess).toBeNull();
  });
});

describe('the home signup card on raid day', () => {
  it('says when signups lock and hands the card my place in line', async () => {
    const locksAt = event.startsAt - 2 * 3_600_000;
    client((name) => {
      if (name === 'raid-list') {
        const [row] = (reader(name).data as object[]) ?? [];
        return { success: true, data: [{ ...row, locksAt }] };
      }
      if (name === 'signup-list') {
        return {
          success: true,
          data: [
            { ...signup('m2', 'healer'), queuePosition: null },
            { ...signup('m1', 'tank'), queued: true, queuePosition: 2 },
          ],
        };
      }
      return reader(name);
    });
    setSession({ memberId: 'm1', tier: 'raider', rank: 'raider', timezone: 'UTC' } as never);
    const page = document.createElement('vintage-home-page') as HomePage & { lockLabel: string };
    document.body.append(page);
    try {
      await page.loadRaids();
      await new Promise((r) => setTimeout(r, 50));
      expect(page.lockLabel).toMatch(/^signups lock \w{3} \d{1,2}:\d{2}\s?[AP]M UTC$/);
      const card = page.shadowRoot?.querySelector('vintage-signup-card');
      expect(card?.getAttribute('queue-position')).toBe('2');
      expect(card?.getAttribute('lock-label')).toBe(page.lockLabel);
    } finally {
      page.remove();
    }
  });
});
