import '@vintage/design-tokens/css/themes.css';
import '@vintage/ui-kit/violet-bridge.css';
import './styles.css';
import '@vintage/ui-kit';
import { fastRouterRegistration } from '@microsoft/fast-router';
import { VintageRoutes } from './routes';

await fastRouterRegistration;
const router = document.querySelector('fast-router') as HTMLElement & {
  config: VintageRoutes | null;
};
router.config = new VintageRoutes();
