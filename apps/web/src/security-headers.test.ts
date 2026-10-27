// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// connect.ts pulls in the elements (which need a DOM), so read the constant from its source.
const PROD_CONVEX_URL =
  /PROD_CONVEX_URL = '([^']+)'/.exec(
    readFileSync(new URL('./connect.ts', import.meta.url), 'utf8'),
  )?.[1] ?? '';

// The session token lives in localStorage (@vintage/web-session), so a script injected into the
// page could take it. The Content-Security-Policy in vercel.json only lets our own scripts run
// and only lets the page talk to the guild's Convex deployment; these checks keep it that way.
interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  headers: HeaderRule[];
};
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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

  it('index.html has no inline script, which script-src would block', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1] ?? '');
    expect(scripts.length).toBeGreaterThan(0);
    for (const attrs of scripts) expect(attrs).toMatch(/\bsrc=/);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });
});
