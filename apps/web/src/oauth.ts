// The seam for connecting an MCP client (Claude, Codex) to Vintage (#9). Better Auth sends the
// member's browser to `/oauth/sign-in`, then `/oauth/consent`, each with a signed query; the
// pages act through `vintage.oauth` from @vintage/web-session, which `src/connect.ts` installs
// here. In development the fixtures install a stand-in (`fixtures/oauth.ts`).

import type { OAuthActions } from '@vintage/web-session';

let actions: OAuthActions | null = null;

/** The shell installs the connection's OAuth actions when it connects to the guild server. */
export function setOAuth(next: OAuthActions | null): void {
  actions = next;
}

/** The OAuth actions, or null when the guild server couldn't be reached. */
export function oauth(): OAuthActions | null {
  return actions;
}

/**
 * Whether `pathname` is one of the OAuth pages. Their query is signed over every parameter, so
 * the shell adds nothing there that could rewrite it (the dev "View as" switch, "Preview as").
 */
export function isOAuthPage(pathname: string): boolean {
  return /^\/oauth\//.test(pathname);
}

/** What each scope lets the app do, in the member's words. Unknown scopes show as named. */
const SCOPE_WORDS: Record<string, string> = {
  commands: 'Run Vintage commands as you, with your current rank’s permissions',
  offline_access: 'Stay connected until you disconnect',
};

export function scopeWords(scope: string): string {
  return SCOPE_WORDS[scope] ?? scope;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Where the member's answer goes, in words, from the signed query's `redirect_uri`: the host of a
 * web address, "an app on this computer" for loopback, or the scheme of an app link. An app's
 * name is its own say-so; this is where the code really goes, so the consent page shows it.
 */
export function returnTarget(query: string): string {
  const raw = new URLSearchParams(query).get('redirect_uri');
  if (!raw) return 'the address the app registered';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    return LOOPBACK.has(url.hostname) ? 'an app on this computer' : url.host;
  }
  return `an app that opens ${url.protocol}// links`;
}

/** An action's error as a sentence; the page adds how to recover (start again from the app). */
export function oauthError(cause: unknown): string {
  const message = cause instanceof Error && cause.message ? cause.message : String(cause);
  return message.replace(/\.?$/, '.');
}
