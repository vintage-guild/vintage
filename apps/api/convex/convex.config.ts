import identity from '@vintage/identity/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(identity);

export default app;
