import { FASTElement, html, observable, when } from '@lushly-dev/fast-element';
import { oauth, oauthError } from '../oauth';
import { canSignIn, currentSession, signOut } from '../session';
import { failure, type OAuthPageState, oauthStyles, unavailable } from './oauth-shared';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <div class="page">
    <h1>Connect an app</h1>
    ${unavailable}
    ${when(
      (x) => x.hasPending && !currentSession(),
      html`
        <vintage-sign-in-card heading="Sign in first" ?available="${() => canSignIn()}">
          Sign in with Discord to connect your app to Vintage. You'll see what it asks for
          before you approve anything.
        </vintage-sign-in-card>
      `,
    )}
    ${when(
      (x) => x.hasPending && currentSession(),
      html<Page>`
        <section class="panel" aria-label="Who is connecting">
          <p>You're signed in to Vintage as <strong>${() => currentSession()?.displayName}</strong>.</p>
          <div class="actions">
            <button type="button" class="primary" ?disabled="${(x) => x.busy}" @click="${(x) => x.continueAs()}">
              Continue as ${() => currentSession()?.displayName}
            </button>
          </div>
          <p class="note">
            Not you?
            <button type="button" class="link" ?disabled="${(x) => x.busy}" @click="${() => signOut()}">Sign out</button>
          </p>
        </section>
      `,
    )}
    ${failure}
  </div>
`;

/**
 * `/oauth/sign-in`: where Better Auth sends a member whose app (Claude, Codex) is connecting to
 * Vintage (#9). Signed out, it starts Discord sign-in, which comes back here with the signed
 * query intact. Signed in, it continues only when the member says so: never on its own, so
 * nobody is connected by opening a link.
 */
export class Page extends FASTElement implements OAuthPageState {
  readonly connected = oauth() !== null;
  readonly hasPending = oauth()?.pending() != null;
  @observable busy = false;
  @observable error = '';

  async continueAs(): Promise<void> {
    const actions = oauth();
    if (!actions || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      // Navigates away: to the consent page, or back to the app if they consented before.
      await actions.continue();
    } catch (cause) {
      this.error = oauthError(cause);
      this.busy = false;
    }
  }
}
await Page.define({
  name: 'vintage-oauth-sign-in-page',
  template,
  styles: [pageStyles, oauthStyles],
});
