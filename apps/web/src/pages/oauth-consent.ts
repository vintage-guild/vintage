import { FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { oauth, oauthError, returnTarget, scopeWords } from '../oauth';
import { canSignIn, currentSession } from '../session';
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
          Sign in with Discord to see what this app is asking for.
        </vintage-sign-in-card>
      `,
    )}
    ${when(
      (x) => x.hasPending && currentSession() && !x.loaded,
      html`<p class="muted">Loading the app’s details…</p>`,
    )}
    ${when(
      (x) => x.hasPending && currentSession() && x.loaded,
      html<Page>`
        <section class="panel" aria-labelledby="asks">
          <p class="lead" id="asks"><strong>${(x) => x.appName}</strong> wants to use
            Vintage as you, ${() => currentSession()?.displayName}. It will be able to:</p>
          <ul>
            ${repeat((x) => x.scopes, html<string>`<li>${(s) => scopeWords(s)}</li>`)}
          </ul>
          <p>Your answer goes back to <strong>${(x) => x.target}</strong>.</p>
          <p class="note">Apps name themselves, so Vintage can’t vouch for the name. Check where
            your answer goes, and approve only an app you just started connecting.</p>
          <div class="actions">
            <button type="button" class="primary" ?disabled="${(x) => x.busy}" @click="${(x) => x.answer(true)}">Approve</button>
            <button type="button" ?disabled="${(x) => x.busy}" @click="${(x) => x.answer(false)}">Deny</button>
          </div>
        </section>
      `,
    )}
    ${failure}
  </div>
`;

/**
 * `/oauth/consent`: the member approves or denies an app (Claude, Codex) connecting to Vintage
 * as them (#9). Apps register themselves, so the name shown is whatever the app said: no
 * verified styling, and "An app" when it gave none. Where the answer goes (the redirect address
 * in the signed query) shows beside it: an impostor can borrow a name, not hide its address.
 */
export class Page extends FASTElement implements OAuthPageState {
  readonly connected = oauth() !== null;
  readonly pending = oauth()?.pending() ?? null;
  readonly hasPending = this.pending !== null;
  readonly scopes = this.pending?.scopes ?? [];
  readonly target = returnTarget(this.pending?.query ?? '');
  @observable appName = 'An app';
  @observable loaded = false;
  @observable busy = false;
  @observable error = '';

  connectedCallback(): void {
    super.connectedCallback();
    // The one read before the member acts: the app's name, which needs them signed in.
    if (this.pending && currentSession() && !this.loaded)
      void this.loadClient(this.pending.clientId);
  }

  async loadClient(clientId: string): Promise<void> {
    try {
      const client = await oauth()?.client(clientId);
      if (client?.name) this.appName = client.name;
    } catch {
      // No name is no reason to block the choice; the fallback stands.
    }
    this.loaded = true;
  }

  async answer(accept: boolean): Promise<void> {
    const actions = oauth();
    if (!actions || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      // Navigates back to the app either way.
      await actions.consent(accept);
    } catch (cause) {
      this.error = oauthError(cause);
      this.busy = false;
    }
  }
}
await Page.define({
  name: 'vintage-oauth-consent-page',
  template,
  styles: [pageStyles, oauthStyles],
});
