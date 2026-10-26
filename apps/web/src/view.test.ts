import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PERSONA, FIXTURE_PERSONAS, isPersona, personaFrom } from './fixtures/persona';
import { type Session, setSession } from './session';
import { canSignUp, currentView, sectionsFor, viewFor } from './view';

const as = (tier: string): Session => ({
  memberId: 'm1',
  displayName: 'Bloodfen',
  tier,
  rank: null,
});

afterEach(() => setSession(null));

describe('viewFor', () => {
  it('composes for visitors, members, and officers by tier', () => {
    expect(viewFor(null)).toBe('visitor');
    expect(viewFor(as('public'))).toBe('visitor');
    expect(['member', 'recruit', 'raider'].map((t) => viewFor(as(t)))).toEqual([
      'member',
      'member',
      'member',
    ]);
    expect(['leader', 'officer'].map((t) => viewFor(as(t)))).toEqual(['officer', 'officer']);
    // An unknown tier never gets more than the storefront.
    expect(viewFor(as('admin'))).toBe('visitor');
  });

  it('follows the signed-in session', () => {
    expect(currentView()).toBe('visitor');
    setSession(as('raider'));
    expect(currentView()).toBe('member');
  });

  it('lets recruits and up answer signups, matching signup-set', () => {
    expect([null, as('public'), as('member')].map(canSignUp)).toEqual([false, false, false]);
    expect(['recruit', 'raider', 'leader', 'officer'].map((t) => canSignUp(as(t)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('the dev "view as" persona', () => {
  it('takes ?as= first, then the one remembered for the tab, then the default', () => {
    expect(personaFrom('?as=officer', 'member')).toBe('officer');
    expect(personaFrom('', 'member')).toBe('member');
    expect(personaFrom('?as=nobody', 'visitor')).toBe('visitor');
    expect(personaFrom('?as=nobody', 'nobody')).toBe(DEFAULT_PERSONA);
    expect(personaFrom('', null)).toBe('raider');
    // The live server is a choice too, not a persona.
    expect(personaFrom('?as=live', 'officer')).toBe('live');
    expect(personaFrom('', 'live')).toBe('live');
    expect(isPersona('live')).toBe(false);
  });

  it('has one persona per tier view, and the visitor signs in nobody', () => {
    expect(FIXTURE_PERSONAS.visitor).toBeNull();
    expect(isPersona('toString')).toBe(false);
    expect(Object.keys(FIXTURE_PERSONAS)).toEqual([
      'visitor',
      'member',
      'recruit',
      'raider',
      'leader',
      'officer',
    ]);
  });
});

describe('sectionsFor', () => {
  const list = (tier: string | null) => [...sectionsFor(tier ? as(tier) : null)].sort();

  it('shows a section only to tiers whose reads it can make', () => {
    expect(list(null)).toEqual(['recruiting']);
    expect(list('public')).toEqual(['recruiting']);
    expect(list('member')).toEqual(['news', 'progress', 'raids', 'recruiting']);
    expect(list('recruit')).toEqual(['news', 'progress', 'raids', 'recruiting', 'roster']);
    expect(list('officer')).toEqual(['news', 'progress', 'raids', 'recruiting', 'roster']);
  });

  it('gives an unknown tier the storefront, never nothing', () => {
    expect(list('admin')).toEqual(['recruiting']);
  });
});
