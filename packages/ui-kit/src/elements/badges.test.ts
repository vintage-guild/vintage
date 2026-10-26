import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { VintageClassBadge } from './class-badge';
import './class-badge';
import type { VintageRoleBadge } from './role-badge';
import './role-badge';

afterEach(cleanup);

const swatchStyle = (el: Element) => el.shadowRoot?.querySelector('.swatch')?.getAttribute('style');

describe('vintage-class-badge', () => {
  it('shows the class and spec with the class color token', async () => {
    const el = await mount<VintageClassBadge>(
      '<vintage-class-badge wow-class="druid" spec="feral-tank"></vintage-class-badge>',
    );
    expect(shadowText(el)).toBe('Feral Tank Druid');
    expect(swatchStyle(el)).toBe('--_swatch: var(--color-class-druid)');
    expect(el.shadowRoot?.querySelector('violet-badge')).not.toBeNull();
  });

  it('follows attribute changes', async () => {
    const el = await mount<VintageClassBadge>(
      '<vintage-class-badge wow-class="mage"></vintage-class-badge>',
    );
    el.setAttribute('wow-class', 'priest');
    await settle();
    expect(shadowText(el)).toBe('Priest');
    expect(swatchStyle(el)).toContain('--color-class-priest');
  });

  it('never builds a token name from an unknown class', async () => {
    const el = await mount<VintageClassBadge>(
      '<vintage-class-badge wow-class="red);x:y"></vintage-class-badge>',
    );
    expect(shadowText(el)).toBe('Unknown class');
    expect(swatchStyle(el) ?? '').toBe('');
  });
});

describe('vintage-role-badge', () => {
  it('shows the role with the role color token', async () => {
    const el = await mount<VintageRoleBadge>(
      '<vintage-role-badge raid-role="healer"></vintage-role-badge>',
    );
    expect(shadowText(el)).toBe('Healer');
    expect(swatchStyle(el)).toBe('--_swatch: var(--color-role-healer)');
  });

  it('shows no role for anything outside wow-data', async () => {
    const el = await mount<VintageRoleBadge>(
      '<vintage-role-badge raid-role="dps"></vintage-role-badge>',
    );
    expect(shadowText(el)).toBe('No role');
  });
});
