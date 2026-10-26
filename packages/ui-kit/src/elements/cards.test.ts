import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount, shadowText } from '../test-helpers';
import type { VintageLogoHeader } from './logo-header';
import './logo-header';
import type { VintageSignInCard } from './sign-in-card';
import './sign-in-card';

afterEach(cleanup);

describe('vintage-logo-header', () => {
  it('renders the wordmark and exposes logo, nav, and action slots', async () => {
    const el = await mount<VintageLogoHeader>(
      '<vintage-logo-header tagline="WoW: Forever guild"><svg slot="logo"></svg><a href="/">About</a></vintage-logo-header>',
    );
    expect(shadowText(el)).toBe('Vintage WoW: Forever guild');
    const slots = [...el.shadowRoot!.querySelectorAll('slot')].map((s) => s.getAttribute('name'));
    expect(slots).toEqual(['logo', null, 'member', 'actions']);
    expect(el.shadowRoot!.querySelector('nav')?.getAttribute('aria-label')).toBe('Main');
  });
});

describe('vintage-sign-in-card', () => {
  it('is disabled with a note while there is no sign-in href', async () => {
    const el = await mount<VintageSignInCard>('<vintage-sign-in-card></vintage-sign-in-card>');
    expect(el.shadowRoot!.querySelector('violet-button')?.hasAttribute('disabled')).toBe(true);
    expect(shadowText(el)).toContain('Discord sign-in is coming soon.');
  });

  it('enables the button once an href is set', async () => {
    const el = await mount<VintageSignInCard>(
      '<vintage-sign-in-card href="/auth/discord"></vintage-sign-in-card>',
    );
    expect(el.shadowRoot!.querySelector('violet-button')?.hasAttribute('disabled')).toBe(false);
  });
});
