// The Recruitment page: the recruiting band officers edit, public, on its own page.
import type { CommandResult } from '@vintage/guild-kit';
import { type Recruiting, STARTER_PROFILE } from '@vintage/site/contract';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
});

const BAND: Recruiting = {
  headline: 'We need a second main tank.',
  pitch: 'Come prepared, be on time, be kind.',
  needs: [
    { wowClass: 'warrior', specs: 'protection', need: 'high' },
    { wowClass: 'mage', specs: 'any', need: 'medium' },
  ],
  updatedAt: Date.UTC(2026, 10, 23, 18),
};

function client(invite: string | null) {
  restore = setCommandClient({
    read: (async (name: string): Promise<CommandResult> => {
      if (name === 'recruiting-get') return { success: true, data: BAND };
      if (name === 'guild-profile-get') {
        return { success: true, data: { ...STARTER_PROFILE, discordInvite: invite } };
      }
      return { success: false, error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command' } };
    }) as never,
    run: async () => ({ success: true }),
  });
}

async function mount() {
  const page = document.createElement('vintage-recruitment-page');
  document.body.append(page);
  await new Promise((r) => setTimeout(r, 50));
  return page;
}

await import('./recruitment');

describe('the Recruitment page', () => {
  it('shows the band officers saved: headline, pitch, and each class it needs', async () => {
    client(null);
    const page = await mount();
    try {
      const root = page.shadowRoot!;
      expect(root.querySelector('h1')?.textContent).toBe(BAND.headline);
      expect(root.querySelector('.pitch')?.textContent).toBe(BAND.pitch);
      expect(root.querySelector('.eyebrow')?.textContent).toMatch(
        /^Recruiting · updated Nov 2[23]$/,
      );
      const rows = [...root.querySelectorAll('.needs tbody tr')].map((tr) =>
        [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
      );
      expect(rows).toEqual([
        ['Warrior', 'protection', 'high'],
        ['Mage', 'any', 'medium'],
      ]);
      expect(root.querySelector('.wrap')?.hasAttribute('data-pending')).toBe(false);
    } finally {
      page.remove();
    }
  });

  it('makes Apply the main button until the GM sets a Discord invite', async () => {
    client(null);
    const page = await mount();
    try {
      const root = page.shadowRoot!;
      expect(root.querySelector('a.primary')?.getAttribute('href')).toBe('/apply');
      expect(root.querySelector('.small')?.textContent).toContain(
        'Discord invites come from an officer',
      );
    } finally {
      page.remove();
    }
  });

  it('leads with the Discord invite once there is one', async () => {
    client('https://discord.gg/vintage');
    const page = await mount();
    try {
      const root = page.shadowRoot!;
      expect(root.querySelector('a.primary')?.getAttribute('href')).toBe(
        'https://discord.gg/vintage',
      );
      expect(root.querySelector('a[href="/apply"]')?.classList.contains('primary')).toBe(false);
      expect(root.querySelector('.small')).toBeNull();
    } finally {
      page.remove();
    }
  });
});
