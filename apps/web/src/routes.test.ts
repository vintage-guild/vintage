import { describe, expect, it } from 'vitest';
import { daysUntil, LAUNCH_AT } from './dates';
import { markCurrentLink } from './nav';
import { VintageRoutes } from './routes';
import { currentSession, setSession } from './session';
import {
  consumePendingSection,
  installSectionLinks,
  sectionContext,
  setSiteContext,
  watchSections,
} from './site-context';

describe('VintageRoutes', () => {
  const routes = new VintageRoutes();

  /** The page title the router's render command will set. */
  const titleOf = async (path: string) =>
    ((await routes.recognizeRoute(path))?.command as { title?: string } | undefined)?.title;

  it.each([
    ['', 'Home'],
    ['about', 'About'],
    ['privacy', 'Privacy'],
    ['terms', 'Terms'],
    ['profile', 'Profile'],
    ['characters', 'Characters'],
    ['polls', 'Polls'],
    ['polls/j971cqgtxed9zmwk9nfvwafby18h1hwn', 'Polls'],
    ['officers', 'Officers’ quarters'],
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
        <a href="/">Home</a>
        <a href="/characters">Characters</a>
      </vintage-logo-header>`;
    markCurrentLink('/characters/');
    const current = [...document.querySelectorAll('[aria-current="page"]')].map(
      (a) => a.textContent,
    );
    expect(current).toEqual(['Characters']);

    markCurrentLink('/');
    expect([...document.querySelectorAll('[aria-current]')].map((a) => a.textContent)).toEqual([
      'Home',
    ]);
  });
});

describe('session', () => {
  it('is signed out until sign-in or the dev fixtures set a member', () => {
    expect(currentSession()).toBeNull();
    setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'raider', rank: 'flex-raider' });
    expect(currentSession()?.displayName).toBe('Bloodfen');
    setSession(null);
  });
});

describe('dates', () => {
  it('counts whole days and never goes negative', () => {
    const nov1 = Date.parse('2026-11-01T12:00:00-05:00');
    expect(daysUntil(LAUNCH_AT, nov1)).toBe(3);
    expect(daysUntil(LAUNCH_AT, Date.parse('2026-12-01T00:00:00Z'))).toBe(0);
  });
});

describe('site context', () => {
  it('puts a section context on the header and reads it from data attributes', () => {
    document.body.innerHTML = `
      <vintage-logo-header><a href="/" data-section-link="top">Home</a><a href="/#raids" data-section-link="raids">Raids</a></vintage-logo-header>
      <section id="raids" data-section data-section-eyebrow="Raids" data-section-title="Next on the calendar" data-section-action="Sign up"></section>`;
    const section = document.querySelector('section')!;
    expect(sectionContext(section)).toEqual({
      eyebrow: 'Raids',
      title: 'Next on the calendar',
      actionLabel: 'Sign up',
      actionHref: '#raids',
      sectionId: 'raids',
    });
    const seen: Element[] = [];
    watchSections([section], (s) => seen.push(s));
    expect(seen).toEqual([section]);
    setSiteContext(sectionContext(section));
    const header = document.querySelector('vintage-logo-header') as HTMLElement & {
      contextTitle: string;
    };
    expect(header.contextTitle).toBe('Next on the calendar');
    const current = [...document.querySelectorAll('[data-section-link][aria-current]')].map(
      (a) => a.textContent,
    );
    expect(current).toEqual(['Raids']);
  });

  it('takes section-link clicks before the router and remembers the target', () => {
    document.body.innerHTML = `<a href="/#roster" data-section-link="roster">Roster</a>`;
    const stop = installSectionLinks();
    const link = document.querySelector('a')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    // No home page is mounted, so the target waits for it.
    expect(consumePendingSection()).toBe('roster');
    expect(consumePendingSection()).toBeNull();
    stop();
  });
});
