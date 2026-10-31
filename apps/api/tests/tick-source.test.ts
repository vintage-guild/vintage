import { describe, expect, it } from 'vitest';
import { cameAndStoodBy } from '../src/tick-source';

describe('the summary post’s attendance', () => {
  it('lists who stood by apart from who came, both credited', () => {
    expect(
      cameAndStoodBy([
        { name: 'Aeryn' },
        { name: 'Cade', stoodBy: true },
        { name: 'Doran-Stonemaul', stoodBy: false },
      ]),
    ).toEqual({ attended: ['Aeryn', 'Doran-Stonemaul'], stoodBy: ['Cade'] });
  });
});
