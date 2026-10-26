import { describe, expect, it } from 'vitest';
import { markCurrentLink } from './nav';
import { VintageRoutes } from './routes';
import { currentSession } from './session';

describe('VintageRoutes', () => {
  const routes = new VintageRoutes();

  /** The page title the router's render command will set. */
  const titleOf = async (path: string) =>
    ((await routes.recognizeRoute(path))?.command as { title?: string } | undefined)?.title;

  it.each([
    ['', 'About'],
    ['profile', 'Profile'],
    ['characters', 'Characters'],
    ['ui', 'Components'],
  ])('maps /%s', async (path, title) => {
    expect(await titleOf(path)).toBe(title);
  });

  it('falls back to the not-found page', async () => {
    expect(await titleOf('no/such/page')).toBe('Not found');
  });
});

describe('markCurrentLink', () => {
  it('marks only the header link for the current path', () => {
    document.body.innerHTML = `
      <vintage-logo-header>
        <a slot="logo" href="/">logo</a>
        <a href="/">About</a>
        <a href="/characters">Characters</a>
      </vintage-logo-header>`;
    markCurrentLink('/characters/');
    const current = [...document.querySelectorAll('[aria-current="page"]')].map(
      (a) => a.textContent,
    );
    expect(current).toEqual(['Characters']);

    markCurrentLink('/');
    expect([...document.querySelectorAll('[aria-current]')].map((a) => a.textContent)).toEqual([
      'About',
    ]);
  });
});

describe('session', () => {
  it('is signed out until Discord sign-in lands (#7)', () => {
    expect(currentSession()).toBeNull();
  });
});
