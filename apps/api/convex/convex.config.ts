import identity from '@vintage/identity/convex.config';
import raids from '@vintage/raids/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(identity);
app.use(raids);

export default app;
