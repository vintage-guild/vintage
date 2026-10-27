import type { CommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandTiers, previewClient, previewFrom } from './preview';
import {
  canPreviewAs,
  currentPreview,
  currentSession,
  realSession,
  type Session,
  setPreview,
  setSession,
} from './session';
import { sectionsFor, viewFor } from './view';

const officer: Session = {
  memberId: 'm-ana',
  displayName: 'Ana',
  tier: 'officer',
  rank: 'officer',
};
const leader: Session = { ...officer, tier: 'leader', rank: 'raid-leader' };
const raider: Session = { ...officer, tier: 'raider', rank: 'raider' };

afterEach(() => {
  setPreview(null);
  setSession(null);
});

describe('previewFrom', () => {
  it('takes ?preview=, falls back to the tab, and clears with self', () => {
    expect(previewFrom('?preview=raider', null)).toBe('raider');
    expect(previewFrom('', 'member')).toBe('member');
    expect(previewFrom('?preview=self', 'member')).toBeNull();
    expect(previewFrom('?preview=officer', null)).toBeNull();
    expect(previewFrom('', 'nonsense')).toBeNull();
  });
});

describe('the previewed session', () => {
  it('is the officer at the lower tier, with that tier’s rank, and the view follows', () => {
    setSession(officer);
    setPreview('raider');
    expect(currentPreview()).toBe('raider');
    expect(currentSession()).toMatchObject({ displayName: 'Ana', tier: 'raider', rank: 'raider' });
    expect(viewFor(currentSession())).toBe('member');
    expect(sectionsFor(currentSession()).has('roster')).toBe(true);
    expect(realSession()?.tier).toBe('officer');
  });

  it('is signed out for a visitor preview, so the storefront composes', () => {
    setSession(officer);
    setPreview('visitor');
    expect(currentSession()).toBeNull();
    expect([...sectionsFor(currentSession())]).toEqual(['about', 'recruiting']);
  });

  it('only lets leaders and officers preview, and only below their own tier', () => {
    expect(canPreviewAs(officer, 'leader')).toBe(true);
    expect(canPreviewAs(leader, 'raider')).toBe(true);
    expect(canPreviewAs(leader, 'leader')).toBe(false);
    expect(canPreviewAs(raider, 'member')).toBe(false);
    expect(canPreviewAs(null, 'visitor')).toBe(false);
    setSession(raider);
    setPreview('member');
    expect(currentPreview()).toBeNull();
    expect(currentSession()?.tier).toBe('raider');
  });
});

describe('previewClient', () => {
  const inner: CommandClient = {
    read: vi.fn(async () => ({ success: true, data: 'real' })) as CommandClient['read'],
    run: vi.fn(async () => ({ success: true })) as CommandClient['run'],
  };
  const tiers = {
    'member-list': 'recruit',
    'raid-list': 'member',
    'recruiting-get': 'public',
  } as const;

  it('reads what the tier may read and refuses the rest as the server would', async () => {
    const asMember = previewClient(inner, 'member', tiers);
    expect((await asMember.read('raid-list')).data).toBe('real');
    const roster = await asMember.read('member-list');
    expect(roster.success ? 'OK' : roster.error?.code).toBe('COMMAND_NOT_FOUND');
    const asVisitor = previewClient(inner, 'visitor', tiers);
    expect((await asVisitor.read('recruiting-get')).success).toBe(true);
    expect((await asVisitor.read('raid-list')).success).toBe(false);
    expect((await asVisitor.read('unknown-command')).success).toBe(false);
  });

  it('never runs an action', async () => {
    const result = await previewClient(inner, 'raider', tiers).run('signup-set', {});
    expect(result.success ? 'OK' : result.error?.code).toBe('PREVIEW_ONLY');
    expect(result.success ? '' : result.error?.message).toContain('as a raider');
    expect(inner.run).not.toHaveBeenCalled();
  });
});

describe('commandTiers', () => {
  it('reads each command’s tier from the module lists the server registers', async () => {
    const tiers = await commandTiers();
    expect(tiers['member-list']).toBe('recruit');
    expect(tiers['recruiting-get']).toBe('public');
    expect(tiers['recruiting-set']).toBe('officer');
    expect(Object.keys(tiers).length).toBeGreaterThan(40);
  });
});
