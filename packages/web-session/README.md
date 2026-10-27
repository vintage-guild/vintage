# @vintage/web-session

The website's connection to the guild server: Discord sign-in, the signed-in member's session,
and a `CommandClient` over Convex. Better Auth and Convex stay in here; page code sees only
commands and a session.

```ts
import { connectVintage } from '@vintage/web-session';
import { setCommandClient } from '@vintage/ui-kit/client';

const vintage = connectVintage({ convexUrl: import.meta.env.VITE_CONVEX_URL });
setCommandClient(vintage.commands); // commands now run as the signed-in member, or public

vintage.onSession((session) => render(session)); // called now and on every change
await vintage.ready; // first known state, including the return from Discord

signInButton.onclick = () => vintage.signIn(); // navigates to Discord, comes back to this page
signOutButton.onclick = () => vintage.signOut();

await vintage.commands.run('member-prefs-set', { timezone: 'Europe/London' });
await vintage.refresh(); // re-reads member-me; listeners hear only if something changed
```

Before `ready`, the session is null even for a signed-in member, so mount after `ready`. After
that, `onSession` fires when the signed-in user changes, or when `refresh()` finds the member
changed (a new timezone, or a rank from role sync).

`WebSession` is `{ memberId, displayName, tier, rank, avatarUrl?, timezone? }`:

- `memberId` is null when someone is signed in but isn't in the Discord server; they're `public`.
- `tier` decides what the server lets them do. The site only composes by it; commands are gated
  on the server.
- `avatarUrl` is their Discord avatar (or Discord's default one); `timezone` is from
  `member-prefs-set`.

Sign-in starts with a function call, not a link: `signIn({ returnTo })` takes a path or a full
URL on a trusted origin, and defaults to the current page. Coming back from Discord, the URL
carries a one-time `?ott=` token; `connectVintage` trades it for the session and removes it from
the address bar.

## Connecting an MCP client (`vintage.oauth`)

When a member connects Claude or another MCP client, Better Auth sends their browser to the site's
`/oauth/sign-in` page, then to `/oauth/consent`, each with a signed query:

```ts
const pending = vintage.oauth.pending(); // { clientId, scopes, query } | null
await vintage.oauth.continue(); // sign-in page, once signed in: on to consent (or back to the app)
const app = await vintage.oauth.client(pending.clientId); // { name?, uri?, logoUri? } for the screen
await vintage.oauth.consent(true); // consent page: approve (or false to deny), back to the app
```

Don't change the query on those pages: its signature covers every parameter. The helpers pass it
back as `oauth_query` explicitly, and never attach it to sign-in, which keeps Better Auth from
finishing the authorization during the Discord callback.

The server side is `apps/api/convex/auth.ts`; the setup steps (Discord redirect URI, Convex env,
MCP clients) are in `SETUP.md` → Website sign-in.
