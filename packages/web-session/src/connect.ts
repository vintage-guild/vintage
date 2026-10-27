// The website's connection: a Convex client authenticated by Better Auth's Discord sign-in (#7).
// The site and the auth server are on different origins, so Better Auth's cross-domain plugin
// keeps the session in localStorage and finishes sign-in from the `?ott=` one-time token Discord's
// redirect brings back. Everything Better Auth or Convex stays in here.
import { convexClient, crossDomainClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/client';
import { ConvexClient } from 'convex/browser';
import { type CommandClient, convexCommandClient } from './commands';
import { type AuthFetch, type OAuthActions, oauthActions } from './oauth';
import {
  type AuthUser,
  type MemberMe,
  sameSession,
  toWebSession,
  type WebSession,
} from './session';

export interface ConnectOptions {
  /** The Convex deployment, e.g. https://dusty-sardine-902.convex.cloud. */
  convexUrl: string;
  /** Where Better Auth's routes live; defaults to the deployment's .convex.site URL. */
  convexSiteUrl?: string;
}

export interface SignInOptions {
  /** Where to land after Discord: a path on the site, or a full URL on a trusted origin. Defaults to the current page. */
  returnTo?: string;
}

export interface VintageConnection {
  /** Commands as the signed-in member (or public): install with ui-kit's setCommandClient. */
  commands: CommandClient;
  /** The current session, or null when signed out. */
  session(): WebSession | null;
  /** Called on every change, and once right away with the current value. Returns unsubscribe. */
  onSession(listener: (session: WebSession | null) => void): () => void;
  /** Settles with the first session once sign-in state is known (including a returning redirect). */
  ready: Promise<WebSession | null>;
  /**
   * Re-read the member (after `member-prefs-set`, or to pick up a rank change from role sync).
   * Listeners hear about it only if something changed. Resolves with the session.
   */
  refresh(): Promise<WebSession | null>;
  /** Start Discord sign-in; the page navigates to Discord and comes back to `returnTo`. */
  signIn(options?: SignInOptions): Promise<void>;
  signOut(): Promise<void>;
  /** The site's sign-in and consent pages for MCP clients (Claude, Codex) connecting (#9). */
  oauth: OAuthActions;
  close(): Promise<void>;
}

const ONE_TIME_TOKEN = 'ott';
/** Where Better Auth's cross-domain client keeps the session (its default storage prefix). */
const SESSION_STORAGE_KEY = 'better-auth_cookie';

/** https://x.convex.cloud → https://x.convex.site */
export const siteUrlOf = (convexUrl: string) =>
  convexUrl.replace(/\.convex\.cloud\/?$/, '.convex.site');

export function connectVintage(options: ConnectOptions): VintageConnection {
  const auth = createAuthClient({
    baseURL: options.convexSiteUrl ?? siteUrlOf(options.convexUrl),
    plugins: [convexClient(), crossDomainClient()],
  });
  const convex = new ConvexClient(options.convexUrl);
  const commands = convexCommandClient(convex);
  const fetchToken = async () => (await auth.convex.token()).data?.token ?? null;

  let current: WebSession | null = null;
  let userId: string | null | undefined;
  let user: AuthUser | null = null;
  const listeners = new Set<(session: WebSession | null) => void>();
  const emit = (next: WebSession | null) => {
    current = next;
    for (const listener of listeners) listener(next);
  };

  let resolveReady: (session: WebSession | null) => void = () => {};
  const ready = new Promise<WebSession | null>((resolve) => {
    resolveReady = resolve;
  });

  /** Read who the signed-in user is in the guild, and emit only when something changed. */
  async function readMember(): Promise<WebSession | null> {
    if (!user) return current;
    const next = toWebSession(user, await commands.read<MemberMe>('member-me'));
    if (!sameSession(current, next)) emit(next);
    return current;
  }

  /** The signed-in user changed: re-authenticate Convex, then read them. */
  async function load(next: AuthUser & { id: string }) {
    user = next;
    convex.setAuth(fetchToken);
    return readMember();
  }

  async function start() {
    await finishRedirect();
    auth.useSession.subscribe(({ data, isPending }) => {
      if (isPending) return;
      const next = data?.user ?? null;
      if ((next?.id ?? null) === userId) return;
      userId = next?.id ?? null;
      if (next) {
        void load(next).then(() => resolveReady(current));
      } else {
        // Drop the token Convex already holds: re-running setAuth with a fetcher that now answers
        // null keeps the old one, and commands would still run as the member who signed out.
        user = null;
        convex.client.clearAuth();
        emit(null);
        resolveReady(null);
      }
    });
  }

  /** Coming back from Discord: trade the one-time token for a session and tidy the URL. */
  async function finishRedirect() {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get(ONE_TIME_TOKEN);
    if (!token) return;
    url.searchParams.delete(ONE_TIME_TOKEN);
    window.history.replaceState(window.history.state, '', url);
    const result = await auth.crossDomain.oneTimeToken.verify({ token });
    if (result.data?.session) auth.updateSession();
  }

  void start();

  // Another tab signed in or out: the stored session changed under us. Re-check it, so this tab
  // drops its Convex token (or picks up the new member) instead of acting as whoever was here.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === SESSION_STORAGE_KEY) auth.updateSession();
    });
  }

  return {
    commands,
    session: () => current,
    onSession(listener) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    ready,
    refresh: readMember,
    async signIn({ returnTo } = {}) {
      await auth.signIn.social({
        provider: 'discord',
        callbackURL: returnTo ?? (typeof window === 'undefined' ? '/' : window.location.href),
      });
    },
    async signOut() {
      await auth.signOut();
      auth.updateSession();
    },
    oauth: oauthActions((path, init) => auth.$fetch(path, init) as ReturnType<AuthFetch>, {
      search: () => (typeof window === 'undefined' ? '' : window.location.search),
      assign: (url) => window.location.assign(url),
    }),
    close: () => convex.close(),
  };
}
