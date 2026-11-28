// Signed out, the home page tells visitors who we are from the guild profile officers edit.
import type { CommandResult } from '@vintage/guild-kit';
import {
  LAUNCH_BOSS_COUNT,
  LAUNCH_RAIDS,
  type Progress,
  RAIDS_OPEN_AT,
  RAIDS_OPEN_ON,
} from '@vintage/progress/contract';
import { type GuildProfile, STARTER_PROFILE } from '@vintage/site/contract';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { setSession } from './session';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  setSession(null);
});

const PROFILE: GuildProfile = {
  ...STARTER_PROFILE,
  aboutLead: 'Old friends from Vanilla, back for Forever.',
  aboutSections: [
    { heading: 'Our history', body: 'We met in Blackrock.\n\nWe stayed for Naxx.' },
    { heading: 'How we raid', body: 'Prepared, on time, and kind.' },
  ],
  updatedAt: 1,
};

function client() {
  restore = setCommandClient({
    read: (async (name: string): Promise<CommandResult> =>
      name === 'guild-profile-get'
        ? { success: true, data: PROFILE }
        : {
            success: false,
            error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command' },
          }) as never,
    run: async () => ({ success: true }),
  });
}

/** A fresh page element: it composes once, for the session set before it's created. */
async function mountHome() {
  const page = document.createElement('vintage-home-page');
  document.body.append(page);
  await new Promise((r) => setTimeout(r, 50));
  return page;
}

await import('./pages/home');

describe('the home page’s About section', () => {
  it('tells a visitor who we are, from the guild profile', async () => {
    client();
    const page = await mountHome();
    try {
      const about = page.shadowRoot?.querySelector('#about');
      expect(about?.querySelector('.about-lead')?.textContent).toBe(PROFILE.aboutLead);
      expect([...(about?.querySelectorAll('h3') ?? [])].map((h) => h.textContent)).toEqual([
        'Our history',
        'How we raid',
      ]);
      // Each section's body is markdown: blank lines make paragraphs.
      const paras = [...(about?.querySelectorAll('.about-grid vintage-markdown') ?? [])].flatMap(
        (m) => [...(m.shadowRoot?.querySelectorAll('p') ?? [])],
      );
      expect(paras.map((p) => p.textContent)).toEqual([
        'We met in Blackrock.',
        'We stayed for Naxx.',
        'Prepared, on time, and kind.',
      ]);
      expect(about?.querySelector('a[href="/about"]')).toBeTruthy();
    } finally {
      page.remove();
    }
  });

  it('isn’t there for a signed-in member', async () => {
    client();
    setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'raider', rank: 'raider' });
    const page = await mountHome();
    try {
      expect(page.shadowRoot?.querySelector('#about')).toBeNull();
      // Raids sits on the hero's art with the greeting.
      const raids = page.shadowRoot?.querySelector('vintage-hero > #raids');
      expect(raids?.getAttribute('slot')).toBe('after');
    } finally {
      page.remove();
    }
  });
});

describe('the home page’s public Progress section (#340)', () => {
  it('shows signed-out visitors the live progress ledger from progress-get', async () => {
    const killedAt = RAIDS_OPEN_AT + 86_400_000;
    const sampleProgress: Progress = {
      opensAt: RAIDS_OPEN_AT,
      opensOn: RAIDS_OPEN_ON,
      open: true,
      killed: 1,
      total: LAUNCH_BOSS_COUNT,
      raids: LAUNCH_RAIDS.map((raid) => ({
        ...raid,
        killed: raid.id === 'barrow-deeps' ? 1 : 0,
        total: raid.bosses.length,
        nextBossId: raid.id === 'barrow-deeps' ? 'elder-tangleclaw' : raid.bosses[0]!.id,
        bosses: raid.bosses.map((boss) =>
          raid.id === 'barrow-deeps' && boss.id === 'chillhowl'
            ? {
                ...boss,
                firstKillAt: killedAt,
                loot: [{ name: 'Frostfang Greaves', quality: 'epic' }],
              }
            : { ...boss, firstKillAt: null, loot: [] },
        ),
      })),
      latest: {
        raidId: 'barrow-deeps',
        raidName: 'Barrow Deeps',
        bossId: 'chillhowl',
        bossName: 'Chillhowl',
        killedAt,
        loot: [{ name: 'Frostfang Greaves', quality: 'epic' }],
      },
    };
    restore = setCommandClient({
      read: (async (name: string): Promise<CommandResult> => {
        if (name === 'guild-profile-get') return { success: true, data: PROFILE };
        if (name === 'progress-get') return { success: true, data: sampleProgress };
        return {
          success: false,
          error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command' },
        };
      }) as never,
      run: async () => ({ success: true }),
    });

    const page = await mountHome();
    try {
      const section = page.shadowRoot?.querySelector('#progress');
      expect(section).not.toBeNull();
      // The ledger follows the hero on its own: no section heading, no countdown callout.
      expect(section?.querySelector('h2')).toBeNull();
      expect(section?.querySelector('.callout')).toBeNull();
      const ledger = section?.querySelector('vintage-boss-ledger') as
        | (HTMLElement & { open: boolean; latest: { bossName: string } | null })
        | null;
      expect(ledger?.open).toBe(true);
      expect(ledger?.latest?.bossName).toBe('Chillhowl');
      // The visitor hero shows each raid's progress in place of the countdowns.
      const figures = [
        ...(page.shadowRoot?.querySelectorAll('vintage-hero vintage-figure') ?? []),
      ].map((el) => [
        el.getAttribute('caption'),
        el.getAttribute('value'),
        el.getAttribute('unit'),
      ]);
      expect(figures.slice(0, 3)).toEqual(
        LAUNCH_RAIDS.map((raid) => [
          raid.name,
          raid.id === 'barrow-deeps' ? '1' : '0',
          `/ ${raid.bosses.length}`,
        ]),
      );
      expect(figures.some(([caption]) => caption?.startsWith('to '))).toBe(false);
    } finally {
      page.remove();
    }
  });
});

describe('the home page without its roster or recruiting sections', () => {
  it('sends visitors to /recruitment for the open roles, not to a home section', async () => {
    client();
    const page = await mountHome();
    try {
      expect(page.shadowRoot?.querySelector('#recruiting')).toBeNull();
      expect(page.shadowRoot?.querySelector('#roster')).toBeNull();
      const apply = page.shadowRoot?.querySelector('[slot="actions"] a.primary');
      expect(apply?.getAttribute('href')).toBe('/recruitment');
      expect(apply?.hasAttribute('data-section-link')).toBe(false);
    } finally {
      page.remove();
    }
  });

  it('shows a signed-in raider no roster section but keeps the member count', async () => {
    restore = setCommandClient({
      read: (async (name: string): Promise<CommandResult> => {
        if (name === 'guild-profile-get') return { success: true, data: PROFILE };
        if (name === 'member-list') {
          return { success: true, data: [{ memberId: 'm1' }, { memberId: 'm2' }] };
        }
        return {
          success: false,
          error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command' },
        };
      }) as never,
      run: async () => ({ success: true }),
    });
    setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'raider', rank: 'raider' });
    const page = await mountHome();
    try {
      expect(page.shadowRoot?.querySelector('#roster')).toBeNull();
      const members = [
        ...(page.shadowRoot?.querySelectorAll('vintage-hero vintage-figure') ?? []),
      ].find((el) => el.getAttribute('caption')?.startsWith('on the rolls'));
      expect(members?.getAttribute('value')).toBe('2');
    } finally {
      page.remove();
    }
  });
});
