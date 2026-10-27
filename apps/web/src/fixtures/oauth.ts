// A stand-in for `vintage.oauth` in development, so `/oauth/sign-in` and `/oauth/consent` can be
// built against the fixture member. It reads the query the way the real one does (any `sig` is
// accepted) and walks the same steps: continue goes to consent with the query unchanged, and
// either answer goes "back to the app", which here is the home page.

import { type OAuthActions, pendingAuthorization } from '@vintage/web-session';

export function fixtureOAuth(): OAuthActions {
  const pending = () => pendingAuthorization(location.search);
  const require = () => {
    const p = pending();
    if (!p) throw new Error('No authorization is waiting on this page');
    return p;
  };
  return {
    pending,
    async continue() {
      location.assign(`/oauth/consent?${require().query}`);
    },
    async consent(accept) {
      require();
      console.info(`fixtures: the app was ${accept ? 'approved' : 'denied'}`);
      location.assign('/');
    },
    async client() {
      return { name: 'Claude (fixture)' };
    },
  };
}
