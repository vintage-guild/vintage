// `/professions/character/<slug>#<profession>`, opened from a profession on the roster, scrolls to
// that profession once the character's crafting has rendered.
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
    known: [],
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

describe('a character’s crafting page', () => {
  it('scrolls to the profession in the link once it renders', async () => {
    restore = setCommandClient({
      read: async <T>() => ({ success: true, data: character }) as CommandResult<T>,
      run: async <T>() => ({ success: false }) as CommandResult<T>,
    });
    history.replaceState(null, '', '/professions/character/cast-iron#blacksmithing');
    const scrolled: string[] = [];
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      scrolled.push(location.hash);
    });
    await import('./professions');
    document.body.innerHTML = '<vintage-professions-page></vintage-professions-page>';
    const page = document.querySelector('vintage-professions-page');
    const section = () => page?.shadowRoot?.getElementById('blacksmithing');

    for (let i = 0; i < 20 && scrolled.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await Updates.next();
    }
    expect(section()).toBeTruthy();
    expect(scrolled).toEqual(['#blacksmithing']);
  });
});
