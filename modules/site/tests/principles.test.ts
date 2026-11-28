// The guiding principles are the GM's words. Wherever the site lists them they read exactly as
// written (TJ, 2026-11-27), so this pins every character, punctuation included.
import { describe, expect, it } from 'vitest';
import {
  GUIDING_PRINCIPLES,
  GUIDING_PRINCIPLES_MARKDOWN,
  RECRUITING_LIMITS,
  STARTER_PROFILE,
  STARTER_RECRUITING,
} from '../src/contract';

const AS_WRITTEN = [
  "Show up. If you're on the raid roster, we built the night around you being there. Can't make it? Say so ahead of time.",
  'Know your shit. Rotation, cooldowns, your own buttons — sort that out before raid. The group is counting on your contributions, not carrying you.',
  "Don't be an asshole. Wipes happen, loot's going to piss someone off eventually, nobody needs to be a dick about either one.",
  "Say something. Have a bad pull, bad rotation, you're burnt out, whatever — tell an officer. We'd rather hear it than watch you quietly check out.",
  "Time is precious. We've got jobs. Some of us have kids. Plan and play in a way that's conscious of others' time.",
  "Have fun. Don't let this game become another job. Laugh, share victories, kick some ass.",
];

describe('the guiding principles', () => {
  it('read word for word as the GM wrote them', () => {
    expect(GUIDING_PRINCIPLES.map((p) => `${p.name} ${p.text}`)).toEqual(AS_WRITTEN);
  });

  it('are listed in full, unchanged, on the About page and in the recruiting pitch', () => {
    const plain = (md: string) => md.replace(/\*\*/g, '');
    const about = STARTER_PROFILE.aboutSections.find((s) => s.heading === 'Guiding principles');
    expect(about?.body).toBe(GUIDING_PRINCIPLES_MARKDOWN);
    for (const line of AS_WRITTEN) {
      expect(plain(about?.body ?? '')).toContain(line);
      expect(plain(STARTER_RECRUITING.pitch)).toContain(line);
    }
  });

  it('fit in the pitch with the text around them', () => {
    expect(STARTER_RECRUITING.pitch.length).toBeLessThanOrEqual(RECRUITING_LIMITS.pitch);
  });
});
