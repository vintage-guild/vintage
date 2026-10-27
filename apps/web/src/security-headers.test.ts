import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// By path: happy-dom (this file parses index.html with its DOMParser) replaces the global URL.
const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, path), 'utf8');

// connect.ts pulls in the elements and Better Auth, so read the constant from its source.
const PROD_CONVEX_URL = /PROD_CONVEX_URL = '([^']+)'/.exec(read('./connect.ts'))?.[1] ?? '';

// The session token lives in localStorage (@vintage/web-session), so a script injected into the
// page could take it. The Content-Security-Policy in vercel.json only lets our own scripts run
// and only lets the page talk to the guild's Convex deployment; these checks keep it that way.
interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}
const vercel = JSON.parse(read('../vercel.json')) as {
  headers: HeaderRule[];
};
const html = read('../index.html');

const everyPage = vercel.headers.find((r) => r.source === '/(.*)');
const header = (key: string) => everyPage?.headers.find((h) => h.key === key)?.value;

/** The CSP as directive → sources. */
function directives(): Map<string, string[]> {
  const policy = header('Content-Security-Policy') ?? '';
  return new Map(
    policy
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name as string, sources]),
  );
}

describe('security headers', () => {
  it('apply to every path', () => {
    expect(everyPage).toBeDefined();
  });

  it('stop MIME sniffing and keep paths out of cross-origin referrers', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('run only our own scripts: no inline, eval, or third-party script', () => {
    const csp = directives();
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
  });

  it('cannot be framed', () => {
    expect(directives().get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('connects only to the production Convex deployment (HTTPS, its WebSocket, its HTTP routes)', () => {
    const host = new URL(PROD_CONVEX_URL).host;
    const site = host.replace(/\.convex\.cloud$/, '.convex.site');
    expect(directives().get('connect-src')?.sort()).toEqual(
      ["'self'", `https://${host}`, `wss://${host}`, `https://${site}`].sort(),
    );
  });

  it('loads images only from us, Discord avatars, and the class icons', () => {
    expect(directives().get('img-src')?.sort()).toEqual(
      ["'self'", 'data:', 'https://cdn.discordapp.com', 'https://wow.zamimg.com'].sort(),
    );
  });

  it('index.html has no inline script or event handler, which script-src would block', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = [...doc.querySelectorAll('script')];
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script.getAttribute('src'), script.outerHTML).toBeTruthy();
      expect(script.textContent?.trim(), script.outerHTML).toBe('');
    }
    const handlers = [...doc.querySelectorAll('*')].flatMap((el) =>
      el.getAttributeNames().filter((name) => name.startsWith('on')),
    );
    expect(handlers).toEqual([]);
  });
});
