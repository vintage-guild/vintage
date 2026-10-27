// Better Auth, installed locally (#9): the component and its schema live here, so plugins that
// add tables (the OAuth provider for /mcp) can be used. Same name as the packaged component it
// replaced, so existing users and sessions stay where they are.
import { defineComponent } from 'convex/server';

const component = defineComponent('betterAuth');

export default component;
