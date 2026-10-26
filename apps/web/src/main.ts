// Self-hosted faces (OFL): Bitter for display, IBM Plex Sans and Mono for everything else.
import '@fontsource-variable/bitter';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@vintage/design-tokens/css/themes.css';
import '@vintage/ui-kit/violet-bridge.css';
import './styles.css';
import '@vintage/ui-kit';
import { fastRouterRegistration } from '@microsoft/fast-router';
import { VintageRoutes } from './routes';
import { canSignIn, currentSession, signIn, signOut } from './session';
import { installSectionLinks, trackScrollProgress } from './site-context';
import { currentView, HOME_SECTIONS, type HomeSection, sectionsFor } from './view';

/** The guild server: VITE_CONVEX_URL, else production. */
const convexUrl = (): Promise<string> =>
  import('./connect').then((m) => import.meta.env.VITE_CONVEX_URL || m.PROD_CONVEX_URL);

/** Connect for real. If the server can't be reached the site stays up, signed out. */
async function connectLive(): Promise<void> {
  try {
    const { connectSite } = await import('./connect');
    await connectSite(await convexUrl());
  } catch (cause) {
    console.error('Could not reach the guild server; staying signed out.', cause);
  }
}

if (import.meta.env.DEV) {
  // In dev the switch picks an in-memory guild persona
  // (`?as=visitor|member|recruit|raider|leader|officer`, remembered for the tab), or `?as=live`
  // for the real server and Discord sign-in.
  const { choosePersona, installPersonaSwitch, LIVE } = await import('./fixtures/persona');
  const choice = choosePersona();
  if (choice === LIVE) {
    await connectLive();
  } else {
    const { installFixtures } = await import('./fixtures');
    await installFixtures(choice);
  }
  installPersonaSwitch(choice);
} else {
  await connectLive();
}

// The sign-in card and the header button ask; the shell starts Discord sign-in.
document.addEventListener('sign-in-requested', () => signIn());

const session = currentSession();
const menu = document.getElementById('member-menu') as
  | (HTMLElement & { name: string; detail: string; avatarSrc: string })
  | null;
if (menu && session) {
  // Signed in with Discord but not in the guild's server: no rank, `public` tier.
  const rank = session.rank ? session.rank.replace('-', ' ') : 'not in the guild';
  menu.name = session.displayName;
  menu.detail = rank.charAt(0).toUpperCase() + rank.slice(1);
  menu.avatarSrc = session.avatarUrl ?? '';
  menu.hidden = false;
  if (canSignIn()) {
    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'sign-out';
    out.textContent = 'Sign out';
    out.addEventListener('click', () => signOut());
    menu.append(out);
  }
}

const signInButton = document.getElementById('sign-in') as HTMLButtonElement | null;
if (signInButton && !session && canSignIn()) {
  signInButton.hidden = false;
  signInButton.addEventListener('click', () => signIn());
}

// Leaders and officers get the quarters in the header; the page itself also checks the view.
if (currentView() === 'officer') {
  const link = document.createElement('a');
  link.href = '/officers';
  link.textContent = 'Officers';
  document.getElementById('member-menu')?.before(link);
}

const updated = document.getElementById('updated') as HTMLTimeElement | null;
if (updated) {
  const at = new Date(__BUILD_TIME__);
  updated.dateTime = at.toISOString();
  updated.textContent = at.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

trackScrollProgress();
// Header links to home sections this session doesn't see go too, so nothing points at nothing.
const visible = sectionsFor(session);
for (const link of document.querySelectorAll<HTMLAnchorElement>(
  'vintage-logo-header > a[data-section-link]',
)) {
  const target = link.dataset.sectionLink ?? '';
  if (target in HOME_SECTIONS && !visible.has(target as HomeSection)) link.remove();
}

installSectionLinks();

await fastRouterRegistration;
const router = document.querySelector('fast-router') as HTMLElement & {
  config: VintageRoutes | null;
};
router.config = new VintageRoutes();
