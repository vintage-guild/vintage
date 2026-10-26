import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount, shadowText } from '../test-helpers';
import type { VintageLogoHeader } from './logo-header';
import './logo-header';
import type { VintageSignInCard } from './sign-in-card';
import './sign-in-card';
import type { VintageSignupCard } from './signup-card';
import './signup-card';

afterEach(cleanup);

describe('vintage-logo-header', () => {
  it('renders the wordmark and exposes logo, nav, and action slots', async () => {
    const el = await mount<VintageLogoHeader>(
      '<vintage-logo-header tagline="WoW: Forever guild"><svg slot="logo"></svg><a href="/">About</a></vintage-logo-header>',
    );
    expect(shadowText(el)).toBe('Vintage WoW: Forever guild');
    const slots = [...el.shadowRoot!.querySelectorAll('slot')].map((s) => s.getAttribute('name'));
    expect(slots).toEqual(['logo', null, 'actions']);
    expect(el.shadowRoot!.querySelector('nav')?.getAttribute('aria-label')).toBe('Main');
  });
});

describe('vintage-signup-card', () => {
  it('shows the event, time, and status with its token', async () => {
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card event-title="Molten Core" starts-at="2026-11-06T03:00:00Z" status="tentative"></vintage-signup-card>',
    );
    expect(shadowText(el)).toContain('Molten Core');
    expect(shadowText(el)).toContain('Tentative');
    expect(el.shadowRoot!.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-11-06T03:00:00Z',
    );
    expect(el.shadowRoot!.querySelector('.dot')?.getAttribute('style')).toBe(
      '--_status: var(--color-signup-tentative)',
    );
  });

  it('falls back for unknown status and missing time', async () => {
    const el = await mount<VintageSignupCard>(
      '<vintage-signup-card status="maybe"></vintage-signup-card>',
    );
    expect(el.statusKey).toBe('no-response');
    expect(el.startsLabel).toBe('Time to be announced');
  });

  it('keeps signup buttons disabled until raids exist', async () => {
    const el = await mount<VintageSignupCard>('<vintage-signup-card></vintage-signup-card>');
    const buttons = [...el.shadowRoot!.querySelectorAll('violet-button')];
    expect(buttons).toHaveLength(3);
    expect(buttons.every((b) => b.hasAttribute('disabled'))).toBe(true);
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
