import type { WebSession } from '@vintage/web-session';
import { describe, expect, it } from 'vitest';
import { needsRemount, PROD_CONVEX_URL, toSession } from './connect';
import type { Session } from './session';

const web = (over: Partial<WebSession> = {}): WebSession => ({
  memberId: 'member_1',
  displayName: 'Bloodfen',
  tier: 'raider',
  rank: 'flex-raider',
  ...over,
});

describe('toSession', () => {
  it('maps the package session to the site session', () => {
    expect(toSession(null)).toBeNull();
    expect(
      toSession(
        web({ avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png', timezone: 'Europe/London' }),
      ),
    ).toEqual({
      memberId: 'member_1',
      displayName: 'Bloodfen',
      tier: 'raider',
      rank: 'flex-raider',
      avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png',
      timezone: 'Europe/London',
    });
  });

  it('keeps someone signed in but not in the guild server: no member id, public', () => {
    expect(toSession(web({ memberId: null, tier: 'public', rank: null }))).toEqual({
      memberId: null,
      displayName: 'Bloodfen',
      tier: 'public',
      rank: null,
    });
  });
});

describe('needsRemount', () => {
  const s = (over: Partial<Session> = {}): Session => ({
    memberId: 'member_1',
    displayName: 'Bloodfen',
    tier: 'raider',
    rank: 'flex-raider',
    ...over,
  });

  it('re-composes when who is signed in, or their tier, changes', () => {
    expect(needsRemount(null, s())).toBe(true); // signed in
    expect(needsRemount(s(), null)).toBe(true); // signed out
    expect(needsRemount(s(), s({ memberId: 'member_2' }))).toBe(true); // another account
    expect(needsRemount(s(), s({ tier: 'leader', rank: 'raid-leader' }))).toBe(true); // promoted
  });

  it('keeps the page for changes the view does not depend on', () => {
    expect(needsRemount(null, null)).toBe(false);
    expect(needsRemount(s(), s())).toBe(false);
    expect(needsRemount(s(), s({ timezone: 'Europe/London' }))).toBe(false);
    expect(needsRemount(s(), s({ avatarUrl: 'https://cdn.discordapp.com/x.png' }))).toBe(false);
  });

  it('points at a Convex cloud deployment by default', () => {
    expect(PROD_CONVEX_URL).toMatch(/^https:\/\/[a-z0-9-]+\.convex\.cloud$/);
  });
});
