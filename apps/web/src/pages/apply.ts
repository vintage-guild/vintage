import { css, FASTElement, html, observable, when } from '@lushly-dev/fast-element';
import { type Tier, tierAllows } from '@vintage/guild-kit';
import { getCommandClient, type OwnApplication } from '@vintage/ui-kit';
import { canSignIn, currentSession } from '../session';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <div class="page">
    <h1>Apply to raid</h1>
    <p class="lead">
      Vintage takes raiders and flex raiders by application. Tell us who you play and when you
      can raid; officers answer in Discord. Friends and socials don't need to apply: just join
      the Discord.
    </p>
    ${when(
      () => !currentSession(),
      html`
        <vintage-sign-in-card heading="Sign in to apply" ?available="${() => canSignIn()}">
          Applications go with your Discord account, so the officers can answer you there.
        </vintage-sign-in-card>
      `,
    )}
    ${when(
      (x) => currentSession() && x.raiding,
      html`<p class="lead">You already raid with Vintage. Ask an officer if you want to change your rank.</p>`,
    )}
    ${when(
      (x) => currentSession() && !x.raiding && x.loaded,
      html<Page>`
        <vintage-apply-form
          applicant-name="${() => currentSession()?.displayName ?? ''}"
          :application="${(x) => x.application}"
          @application-changed="${(x) => x.load()}"
        ></vintage-apply-form>
      `,
    )}
    ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
  </div>
`;

const styles = css`
  .error {
    color: var(--color-text-accent);
  }
`;

/** `/apply`: the application form, or where your application stands (#135). */
export class Page extends FASTElement {
  @observable application: OwnApplication | null = null;
  @observable loaded = false;
  @observable error = '';

  get raiding(): boolean {
    const session = currentSession();
    return Boolean(session && tierAllows(session.tier as Tier, 'raider'));
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (currentSession()) void this.load();
  }

  async load(): Promise<void> {
    const result = await getCommandClient().read<OwnApplication | null>('application-get', {});
    if (result.success) {
      this.application = result.data ?? null;
      this.error = '';
    } else {
      this.error = result.error?.message ?? 'Could not read your application';
    }
    this.loaded = true;
  }
}

await Page.define({
  name: 'vintage-apply-page',
  template,
  styles: [pageStyles, styles],
});
