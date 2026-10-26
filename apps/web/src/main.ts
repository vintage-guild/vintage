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
import { currentSession } from './session';
import { installSectionLinks, trackScrollProgress } from './site-context';
import { currentView } from './view';

if (import.meta.env.DEV) {
  // An in-memory guild behind the real commands, signed in as the persona the dev switch picks
  // (`?as=visitor|member|recruit|raider|leader|officer`, remembered for the tab).
  const { installFixtures } = await import('./fixtures');
  const { choosePersona, installPersonaSwitch } = await import('./fixtures/persona');
  const persona = choosePersona();
  await installFixtures(persona);
  installPersonaSwitch(persona);
}

const session = currentSession();
const menu = document.getElementById('member-menu') as
  | (HTMLElement & { name: string; detail: string; avatarSrc: string })
  | null;
if (menu && session) {
  const rank = session.rank ? session.rank.replace('-', ' ') : 'member';
  menu.name = session.displayName;
  menu.detail = rank.charAt(0).toUpperCase() + rank.slice(1);
  menu.avatarSrc = session.avatarUrl ?? '';
  menu.hidden = false;
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
installSectionLinks();

await fastRouterRegistration;
const router = document.querySelector('fast-router') as HTMLElement & {
  config: VintageRoutes | null;
};
router.config = new VintageRoutes();
