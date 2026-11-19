import { describe, expect, it } from 'vitest';
import { classIcon, professionIcon } from './class-icons';

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
