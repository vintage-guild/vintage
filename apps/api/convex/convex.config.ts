import betterAuth from '@convex-dev/better-auth/convex.config';
import agent from '@vintage/agent/convex.config';
import applications from '@vintage/applications/convex.config';
import coordinator from '@vintage/coordinator/convex.config';
import identity from '@vintage/identity/convex.config';
import polls from '@vintage/polls/convex.config';
import progress from '@vintage/progress/convex.config';
import raids from '@vintage/raids/convex.config';
import site from '@vintage/site/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(betterAuth);
app.use(identity);
app.use(raids);
app.use(coordinator);
app.use(polls);
app.use(progress);
app.use(site);
app.use(agent);
app.use(applications);

export default app;
