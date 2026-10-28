import type { RaidEvent } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import { raidFacts, raidHref, raidIdFromPath, refusedNote, rosterComp } from './raids';

const event = {
  id: 'r1',
  name: 'Molten Core',
  instance: 'Molten Core',
  kind: 'raid',
  size: 40,
  startsAt: Date.UTC(2026, 11, 10, 1),
  status: 'locked',
} as RaidEvent;

describe('raid page helpers', () => {
  it('reads the raid id from the path and builds it back', () => {
    expect(raidIdFromPath('/raids/k57abc')).toBe('k57abc');
    expect(raidIdFromPath('/raids/k57abc/')).toBe('k57abc');
    expect(raidIdFromPath('/raids')).toBe('');
    expect(raidIdFromPath('/polls/k57abc')).toBe('');
    expect(raidIdFromPath(raidHref('a b'))).toBe('a b');
  });

  it('says when, where, how many, and the status, in the member’s zone', () => {
    expect(raidFacts(event, 'America/New_York')).toBe(
      'Wed, Dec 9, 8:00 PM EST · Molten Core · 40 players · locked · roster posted',
    );
    expect(raidFacts({ ...event, instance: '', size: null, status: 'open' }, 'UTC')).toBe(
      'Thu, Dec 10, 1:00 AM UTC · open, no cap · signups open',
    );
    // With `locksAt` (lockLabel's line), the lock time says it instead.
    expect(raidFacts({ ...event, status: 'open' }, 'UTC', 'signups lock Wed 11:00 PM UTC')).toBe(
      'Thu, Dec 10, 1:00 AM UTC · Molten Core · 40 players · signups lock Wed 11:00 PM UTC',
    );
  });

  it('turns a refusal for rank into the note, and anything else into what went wrong', () => {
    const ok = { success: true as const, data: [] };
    const tier = { success: false as const, error: { code: 'COMMAND_NOT_FOUND', message: 'x' } };
    const down = { success: false as const, error: { code: 'INTERNAL', message: 'Server down' } };
    expect(refusedNote(ok, 'for raiders', 'the comp')).toBe('');
    expect(refusedNote(tier, 'for raiders', 'the comp')).toBe('for raiders');
    expect(refusedNote(down, 'for raiders', 'the comp')).toBe(
      'Couldn’t read the comp: Server down.',
    );
  });

  it('keeps the solver’s counts and the gaps’ reasons', () => {
    const counts = { selected: 9, raidSize: 10, tank: 2, healer: 2, dps: 5 };
    expect(rosterComp({ counts, gaps: [{ reason: 'need 1 more healer' }] })).toEqual({
      ...counts,
      gaps: ['need 1 more healer'],
    });
  });
});
