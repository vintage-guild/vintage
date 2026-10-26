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
import { trackScrollProgress } from './site-context';

if (import.meta.env.DEV) {
  // An in-memory guild behind the real commands, with an example member signed in.
  const { installFixtures } = await import('./fixtures');
  await installFixtures();
}

const session = currentSession();
const chip = document.getElementById('member-chip');
if (chip && session) {
  const rank = session.rank ? session.rank.replace('-', ' ') : 'member';
  chip.replaceChildren(
    Object.assign(document.createElement('b'), { textContent: session.displayName }),
    ` ${rank.charAt(0).toUpperCase()}${rank.slice(1)}`,
  );
  chip.hidden = false;
}

trackScrollProgress();

await fastRouterRegistration;
const router = document.querySelector('fast-router') as HTMLElement & {
  config: VintageRoutes | null;
};
router.config = new VintageRoutes();
