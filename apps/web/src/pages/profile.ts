import { FASTElement, html, when } from '@lushly-dev/fast-element';
import { canSignIn, currentSession } from '../session';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <div class="page">
    <h1>Profile</h1>
    ${when(
      () => !currentSession(),
      html`
        <vintage-sign-in-card heading="Your profile" ?available="${() => canSignIn()}">
          Sign in with Discord to see your rank, your permissions, and your raid preferences.
        </vintage-sign-in-card>
      `,
    )}
    ${when(
      () => currentSession(),
      html<Page>`<p class="lead">Signed in as ${() => currentSession()?.displayName}.</p>`,
    )}
  </div>
`;

/** The member's profile. Signed out until Discord sign-in (#7). */
export class Page extends FASTElement {}
await Page.define({ name: 'vintage-profile-page', template, styles: pageStyles });
