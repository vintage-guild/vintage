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
  pitch:
    'Come prepared.\n\n## Guiding principles\n\n- **Show up.** Be there.\n- **Have fun.** Laugh.',
  needs: [
    { wowClass: 'warrior', role: 'tank', specs: 'protection', need: 'high' },
    { wowClass: 'mage', role: 'any', specs: 'any', need: 'medium' },
    { wowClass: 'druid', role: 'healer', specs: 'restoration', need: 'low' },
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
  it('shows the band officers saved: headline, pitch, and each class, role, and demand', async () => {
    client(null);
    const page = await mount();
    try {
      const root = page.shadowRoot!;
      expect(root.querySelector('h1')?.textContent).toBe(BAND.headline);
      // The pitch is markdown, built as elements (never parsed as HTML).
      const pitch = root.querySelector('vintage-markdown.pitch')?.shadowRoot;
      expect(pitch?.querySelector('p')?.textContent).toBe('Come prepared.');
      expect([...(pitch?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
        'Show up. Be there.',
        'Have fun. Laugh.',
      ]);
      expect(pitch?.querySelector('li strong')?.textContent).toBe('Show up.');
      expect(root.querySelector('.eyebrow')?.textContent).toMatch(
        /^Recruiting · updated Nov 2[23]$/,
      );
      expect([...root.querySelectorAll('.needs th')].map((th) => th.textContent)).toEqual([
        'Class',
        'Role',
        'Special notes',
        'Demand',
      ]);
      const rows = [...root.querySelectorAll('.needs tbody tr')].map((tr) =>
        [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
      );
      expect(rows).toEqual([
        ['Warrior', 'Tank', 'protection', 'high'],
        ['Mage', 'Any', '', 'medium'],
        ['Druid', 'Healer', 'restoration', 'low'],
      ]);
      expect(root.querySelector('.page')?.hasAttribute('data-pending')).toBe(false);
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
      expect(
        [...root.querySelectorAll('.actions a')].map((a) => [
          a.textContent,
          a.getAttribute('href'),
        ]),
      ).toEqual([
        ['Apply to raid', '/apply'],
        ['About', '/about'],
        ['Roster', '/roster'],
      ]);
      expect(root.querySelector('.small')?.textContent).toBe(
        'Ask an officer for a Discord invite.',
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
