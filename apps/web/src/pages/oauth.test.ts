import { Updates } from '@lushly-dev/fast-element';
import type { OAuthActions, OAuthClientInfo } from '@vintage/web-session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureOAuth } from '../fixtures/oauth';
import { isOAuthPage, returnTarget, scopeWords, setOAuth } from '../oauth';
import { setSession } from '../session';

const SIGNED =
  '?client_id=claude&scope=commands%20offline_access&redirect_uri=https%3A%2F%2Fevil.example%2Fcb&sig=abc';

function useOAuth(
  options: { pending?: boolean; client?: OAuthClientInfo | null; fail?: string } = {},
) {
  const reject = () => Promise.reject(new Error(options.fail));
  const actions = {
    pending: vi.fn(() =>
      options.pending === false
        ? null
        : { clientId: 'claude', scopes: ['commands', 'offline_access'], query: SIGNED.slice(1) },
    ),
    continue: vi.fn(async () => (options.fail ? reject() : undefined)),
    consent: vi.fn(async (_accept: boolean) => (options.fail ? reject() : undefined)),
    client: vi.fn(async () => options.client ?? null),
  } satisfies OAuthActions;
  setOAuth(actions);
  return actions;
}

const signIn = () =>
  setSession({ memberId: 'm1', displayName: 'Bloodfen', tier: 'raider', rank: 'flex-raider' });

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Updates.next();
    await new Promise((r) => setTimeout(r, 0));
  }
};

async function mount(page: 'sign-in' | 'consent') {
  await import(page === 'sign-in' ? './oauth-sign-in' : './oauth-consent');
  const tag = `vintage-oauth-${page}-page`;
  document.body.innerHTML = `<${tag}></${tag}>`;
  await flush();
  const root = document.querySelector(tag)!.shadowRoot!;
  const text = () => root.textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));
  return { root, text, button };
}

beforeEach(() => {
  history.replaceState(null, '', `/oauth/sign-in${SIGNED}`);
});
afterEach(() => {
  setOAuth(null);
  setSession(null);
  document.body.replaceChildren();
  // Neither page may touch the signed query.
  expect(location.search).toBe(SIGNED);
});

describe('/oauth/sign-in', () => {
  it('says there is nothing to approve without a pending query', async () => {
    const actions = useOAuth({ pending: false });
    signIn();
    const { text, button } = await mount('sign-in');
    expect(text()).toContain('nothing to approve');
    expect(button('Continue')).toBeUndefined();
    expect(actions.continue).not.toHaveBeenCalled();
  });

  it('asks a signed-out member to sign in with Discord, and nothing else', async () => {
    const actions = useOAuth();
    const { root } = await mount('sign-in');
    const card = root.querySelector('vintage-sign-in-card');
    expect(card?.textContent).toContain('Sign in with Discord to connect your app');
    expect(actions.continue).not.toHaveBeenCalled();
    expect(actions.client).not.toHaveBeenCalled();
  });

  it('continues as the signed-in member only when they click', async () => {
    const actions = useOAuth();
    signIn();
    const { text, button, root } = await mount('sign-in');
    expect(text()).toContain('Continue as Bloodfen');
    expect(text()).toContain('Not you?');
    expect(root.querySelector('vintage-sign-in-card')).toBeNull();
    expect(actions.continue).not.toHaveBeenCalled();
    button('Continue')!.click();
    await flush();
    expect(actions.continue).toHaveBeenCalledOnce();
  });

  it('shows a rejected continue with the hint to start again', async () => {
    useOAuth({ fail: 'The signed query has expired' });
    signIn();
    const { text, button, root } = await mount('sign-in');
    button('Continue')!.click();
    await flush();
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(text()).toContain('The signed query has expired.');
    expect(text()).toContain('Start again from your app');
    expect(button('Continue')!.disabled).toBe(false);
  });

  it('explains that the live server is needed when none is connected', async () => {
    signIn();
    const { text, button } = await mount('sign-in');
    expect(text()).toContain('needs the guild server');
    expect(button('Continue')).toBeUndefined();
  });
});

describe('/oauth/consent', () => {
  it('says there is nothing to approve without a pending query', async () => {
    const actions = useOAuth({ pending: false });
    signIn();
    const { text, button } = await mount('consent');
    expect(text()).toContain('nothing to approve');
    expect(button('Approve')).toBeUndefined();
    expect(actions.client).not.toHaveBeenCalled();
  });

  it('asks a signed-out member to sign in, without reading the app', async () => {
    const actions = useOAuth({ client: { name: 'Claude' } });
    const { root, button } = await mount('consent');
    expect(root.querySelector('vintage-sign-in-card')).not.toBeNull();
    expect(button('Approve')).toBeUndefined();
    expect(actions.client).not.toHaveBeenCalled();
  });

  it('names the app, explains each scope, and approves or denies on click', async () => {
    const actions = useOAuth({ client: { name: 'Claude', uri: 'https://claude.ai' } });
    signIn();
    const { text, button } = await mount('consent');
    expect(actions.client).toHaveBeenCalledWith('claude');
    expect(text()).toContain('Claude wants to use Vintage as you, Bloodfen');
    expect(text()).toContain(scopeWords('commands'));
    expect(text()).toContain('Stay connected until you disconnect');
    expect(text()).toContain('Your answer goes back to evil.example.');
    expect(text()).toContain('can’t vouch for the name');
    expect(actions.consent).not.toHaveBeenCalled();
    button('Approve')!.click();
    await flush();
    expect(actions.consent).toHaveBeenCalledExactlyOnceWith(true);
    // On its way back to the app: a second answer can't race the first.
    expect(button('Deny')!.disabled).toBe(true);
  });

  it('denies on click', async () => {
    const actions = useOAuth({ client: { name: 'Claude' } });
    signIn();
    const { button } = await mount('consent');
    button('Deny')!.click();
    await flush();
    expect(actions.consent).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('falls back to "An app" when the client has no name', async () => {
    useOAuth({ client: null });
    signIn();
    const { text } = await mount('consent');
    expect(text()).toContain('An app wants to use Vintage as you');
  });

  it('shows a rejected consent with the hint to start again', async () => {
    useOAuth({ client: { name: 'Claude' }, fail: 'The authorization server refused (400)' });
    signIn();
    const { text, button } = await mount('consent');
    button('Deny')!.click();
    await flush();
    expect(text()).toContain('The authorization server refused (400).');
    expect(text()).toContain('Start again from your app');
  });
});

describe('returnTarget', () => {
  it('names the redirect host, loopback, or app link the answer goes to', () => {
    const q = (uri: string) => `client_id=c&redirect_uri=${encodeURIComponent(uri)}&sig=x`;
    expect(returnTarget(q('https://evil.example/cb'))).toBe('evil.example');
    expect(returnTarget(q('http://127.0.0.1:33418/callback'))).toBe('an app on this computer');
    expect(returnTarget(q('http://localhost/cb'))).toBe('an app on this computer');
    expect(returnTarget(q('cursor://anysphere.cursor-mcp/oauth'))).toBe(
      'an app that opens cursor:// links',
    );
    expect(returnTarget('client_id=c&sig=x')).toBe('the address the app registered');
  });
});

describe('fixtureOAuth', () => {
  it('goes from sign-in to consent with the query unchanged', async () => {
    const assign = vi.spyOn(location, 'assign').mockImplementation(() => {});
    try {
      const actions = fixtureOAuth();
      expect(actions.pending()?.clientId).toBe('claude');
      await actions.continue();
      expect(assign).toHaveBeenCalledWith(`/oauth/consent${SIGNED}`);
    } finally {
      assign.mockRestore();
    }
  });
});

describe('isOAuthPage', () => {
  it('matches only the OAuth pages', () => {
    expect(isOAuthPage('/oauth/sign-in')).toBe(true);
    expect(isOAuthPage('/oauth/consent')).toBe(true);
    expect(isOAuthPage('/officers')).toBe(false);
    expect(isOAuthPage('/')).toBe(false);
  });
});
