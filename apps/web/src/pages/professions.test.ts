// A character's crafting page: `#<profession>` (a profession linked from the roster) scrolls to
// that profession once it has rendered, and each recipe's name takes its item's quality color.
import { vi } from 'vitest';

// A browser's frame is ~16ms away, later than a zero timeout; happy-dom's comes sooner. FAST reads
// requestAnimationFrame when it loads, so set it before the imports.
vi.hoisted(() => {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16) as never;
});

import { Updates } from '@lushly-dev/fast-element';
import type { CharacterRecipes } from '@vintage/armory/contract';
import type { CommandResult } from '@vintage/guild-kit';
import { type CommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';

const character: CharacterRecipes = {
  name: 'Cast',
  surname: 'Iron',
  slug: 'cast-iron',
  level: 25,
  className: 'Warrior',
  profileUrl: null,
  professions: ['Mining', 'Blacksmithing'].map((profession) => ({
    profession,
    skill: 150,
    maxSkill: 150,
    known:
      profession === 'Blacksmithing'
        ? [
            { id: 1, name: 'Lionheart Helm', itemId: 12640, quality: 'epic' },
            { id: 2, name: 'Rough Sharpening Stone', itemId: 2862, quality: 'common' },
            { id: 3, name: 'Not Synced Yet', itemId: null, quality: null },
          ]
        : [],
    missing: [],
  })),
};

let restore: CommandClient | undefined;
afterEach(() => {
  if (restore) setCommandClient(restore);
  restore = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** Open Cast Iron's crafting page at `url`. */
async function open(url: string): Promise<Element | null> {
  restore = setCommandClient({
    read: async <T>() => ({ success: true, data: character }) as CommandResult<T>,
    run: async <T>() => ({ success: false }) as CommandResult<T>,
  });
  history.replaceState(null, '', url);
  await import('./professions');
  document.body.innerHTML = '<vintage-professions-page></vintage-professions-page>';
  return document.querySelector('vintage-professions-page');
}

describe('a character’s crafting page', () => {
  it('scrolls to the profession in the link once it renders', async () => {
    const scrolled: string[] = [];
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      scrolled.push(location.hash);
    });
    const page = await open('/professions/character/cast-iron#blacksmithing');
    const section = () => page?.shadowRoot?.getElementById('blacksmithing');

    for (let i = 0; i < 20 && scrolled.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await Updates.next();
    }
    expect(section()).toBeTruthy();
    expect(scrolled).toEqual(['#blacksmithing']);
  });

  it('colors each recipe name by its item’s quality', async () => {
    const page = await open('/professions/character/cast-iron');
    const links = () => [...(page?.shadowRoot?.querySelectorAll('a.recipe-link') ?? [])];
    for (let i = 0; i < 20 && links().length === 0; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await Updates.next();
    }
    const quality = (name: string) =>
      [...(links().find((a) => a.textContent?.includes(name))?.classList ?? [])].filter((c) =>
        c.startsWith('q-'),
      );
    expect(quality('Lionheart Helm')).toEqual(['q-epic']);
    // Common and unsynced recipes keep the page's text color.
    expect(quality('Rough Sharpening Stone')).toEqual(['q-common']);
    expect(quality('Not Synced Yet')).toEqual([]);
  });
});
