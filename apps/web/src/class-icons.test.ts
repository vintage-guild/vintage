import { describe, expect, it } from 'vitest';
import { classIcon } from './class-icons';

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
