import { type FASTElementConstructor, RouterConfiguration } from '@microsoft/fast-router';
import { markCurrentLink } from './nav';

type PageModule = { Page: FASTElementConstructor };

/** Pages load on first visit; each module registers its element before exporting it. */
const page = (load: () => Promise<PageModule>) => async () => (await load()).Page;

/** The site's routes (FAST-AF router). Paths are relative to the site root. */
export class VintageRoutes extends RouterConfiguration {
  configure(): void {
    this.title = 'Vintage';
    this.routes.map(
      { path: '', title: 'Home', element: page(() => import('./pages/home')) },
      { path: 'about', title: 'About', element: page(() => import('./pages/about')) },
      { path: 'profile', title: 'Profile', element: page(() => import('./pages/profile')) },
      {
        path: 'characters',
        title: 'Characters',
        element: page(() => import('./pages/characters')),
      },
    );
    if (import.meta.env.DEV) {
      // A dev-only gallery of every ui-kit element, for checking both themes.
      this.routes.map({
        path: 'ui',
        title: 'Components',
        element: page(() => import('./pages/gallery')),
      });
    }
    this.routes.fallback({ title: 'Not found', element: page(() => import('./pages/not-found')) });
    this.contributors.push({ commit: () => markCurrentLink(location.pathname) });
  }
}
