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
  it('is disabled with a note while sign-in is not available, and asks for nothing', async () => {
    const el = await mount<VintageSignInCard>('<vintage-sign-in-card></vintage-sign-in-card>');
    expect(el.shadowRoot!.querySelector('violet-button')?.hasAttribute('disabled')).toBe(true);
    expect(shadowText(el)).toContain('Discord sign-in isn’t connected here.');
    const asked: Event[] = [];
    document.addEventListener('sign-in-requested', (e) => asked.push(e));
    el.signIn();
    expect(asked).toEqual([]);
  });

  it('when available, asks the app to sign in with an event that leaves the shadow root', async () => {
    const el = await mount<VintageSignInCard>(
      '<vintage-sign-in-card available></vintage-sign-in-card>',
    );
    expect(el.shadowRoot!.querySelector('violet-button')?.hasAttribute('disabled')).toBe(false);
    const asked: Event[] = [];
    document.addEventListener('sign-in-requested', (e) => asked.push(e), { once: true });
    el.signIn();
    expect(asked).toHaveLength(1);
    expect(asked[0]?.composed).toBe(true);
  });
});
