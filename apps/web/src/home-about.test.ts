// Signed out, the home page tells visitors who we are from the guild profile officers edit.
import type { CommandResult } from '@vintage/guild-kit';
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
      expect(about?.querySelectorAll('.about-grid p')).toHaveLength(3);
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
    } finally {
      page.remove();
    }
  });
});
