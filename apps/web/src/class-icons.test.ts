// @vitest-environment node
import { readFileSync } from 'node:fs';
import { CLASS_NAMES, SPEC_ICONS } from '@vintage/wow-data';
import { describe, expect, it } from 'vitest';
import { classIcon, professionIcon } from './class-icons';

// The site's spec icons (wow-data SPEC_ICONS, used by the raid post) are the bot's spec emoji.
describe('spec icons', () => {
  it('match the bot’s spec emoji, so the site and the Discord post use the same art', () => {
    const emoji = JSON.parse(
      readFileSync(new URL('../../../scripts/discord-emojis.json', import.meta.url), 'utf8'),
    ) as Record<string, string>;
    const fromEmoji = Object.fromEntries(
      Object.entries(emoji).filter(([key]) => key.startsWith('spec_')),
    );
    const fromData = Object.fromEntries(
      CLASS_NAMES.flatMap((c) =>
        Object.entries(SPEC_ICONS[c]).map(([spec, icon]) => [
          `spec_${c}_${spec.replace(/-/g, '_')}`,
          icon,
        ]),
      ),
    );
    expect(fromData).toEqual(fromEmoji);
  });
});

describe('professionIcon', () => {
  it("points at the profession's icon, and a question mark for an unknown one", () => {
    expect(professionIcon('First Aid')).toBe(
      'https://wow.zamimg.com/images/wow/icons/medium/spell_holy_sealofsacrifice.jpg',
    );
    expect(professionIcon('Jewelcrafting', 'small')).toBe(
      'https://wow.zamimg.com/images/wow/icons/small/inv_misc_questionmark.jpg',
    );
  });
});

describe('classIcon', () => {
  it("points at Wowhead's class icon, whatever the class is written as", () => {
    expect(classIcon('Warrior')).toBe(
      'https://wow.zamimg.com/images/wow/icons/medium/classicon_warrior.jpg',
    );
    expect(classIcon('druid', 'large')).toBe(
      'https://wow.zamimg.com/images/wow/icons/large/classicon_druid.jpg',
    );
  });
});
