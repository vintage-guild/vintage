import { css, FASTElement, html, observable, when } from '@lushly-dev/fast-element';
import type { ApplyCheck } from '@vintage/applications/contract';
import { type Tier, tierAllows } from '@vintage/guild-kit';
import { getCommandClient, type OwnApplication } from '@vintage/ui-kit';
import { readGuildProfile } from '../guild-profile';
import { canSignIn, currentSession } from '../session';
import { pageStyles } from './page-styles';

/** After "I've joined": how often, and how many times, to ask again while the bot checks. */
export const RECHECK = { everyMs: 2000, tries: 6 };

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
      (x) => currentSession() && !x.raiding && x.loaded && x.showForm,
      html<Page>`
        <vintage-apply-form
          applicant-name="${() => currentSession()?.displayName ?? ''}"
          :application="${(x) => x.application}"
          @application-changed="${(x) => x.load()}"
        ></vintage-apply-form>
      `,
    )}
    ${when(
      (x) => currentSession() && !x.raiding && x.loaded && x.joinFirst,
      html<Page>`
        <violet-card appearance="outline" padding="large" class="join" data-step="join">
          <h2 slot="header">Join the Vintage Discord first</h2>
          <p>
            Officers talk to applicants in the guild's Discord server, so you apply once you're in
            it. Join, come back to this page, and press "I've joined".
          </p>
          <div slot="footer" class="actions">
            ${when(
              (x) => x.invite,
              html<Page>`<a class="join-link" href="${(x) => x.invite ?? ''}" target="_blank" rel="noopener">Join the Discord</a>`,
            )}
            <violet-button
              appearance="${(x) => (x.invite ? 'outline' : 'primary')}"
              ?disabled="${(x) => x.checking}"
              @click="${(x) => x.recheck()}"
            >${(x) => (x.checking ? 'Checking…' : 'I’ve joined')}</violet-button>
          </div>
          ${when((x) => x.note, html<Page>`<p class="note" role="status">${(x) => x.note}</p>`)}
        </violet-card>
      `,
    )}
    ${when(
      (x) => currentSession() && !x.raiding && x.loaded && x.blockedText,
      html<Page>`<p class="lead blocked" role="status" data-step="blocked">${(x) => x.blockedText}</p>`,
    )}
    ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
  </div>
`;

const styles = css`
  .error {
    color: var(--color-text-accent);
  }

  .join {
    max-inline-size: 36rem;
    --violet-card-background: var(--card-bg);
    --violet-card-border-color: var(--card-border);
  }

  .join h2 {
    font-size: var(--font-size-xl);
    color: var(--color-text-accent);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }

  .join-link {
    display: inline-flex;
    align-items: center;
    padding: 0.55rem 1rem;
    border-radius: 0.2rem;
    border: var(--border-width-thin) solid color-mix(in srgb, var(--button-primary-bg) 55%, black);
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-sm);
    text-decoration: none;
  }

  .join-link:hover {
    background: var(--color-verdigris-400);
  }

  .note {
    margin-block-start: var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `/apply`: the application form, or where your application stands (#135). Before the form,
 * `application-check` (#145): someone not in the Vintage Discord is asked to join it first, and
 * nobody fills in a form the server would refuse.
 */
export class Page extends FASTElement {
  @observable application: OwnApplication | null = null;
  @observable check: ApplyCheck | null = null;
  @observable invite: string | null = null;
  @observable loaded = false;
  @observable checking = false;
  @observable note = '';
  @observable error = '';

  get raiding(): boolean {
    const session = currentSession();
    return Boolean(session && tierAllows(session.tier as Tier, 'raider'));
  }

  /**
   * Your application's status, or a fresh form when nothing stands in the way. When the check
   * itself can't be read (a backend from before it), the form shows and submit still refuses.
   */
  get showForm(): boolean {
    return this.application !== null || this.check === null || this.check.canApply;
  }

  get joinFirst(): boolean {
    return this.application === null && this.check?.reason === 'not-in-server';
  }

  /** Any other refusal, in the server's words (the limit says when to try again). */
  get blockedText(): string {
    const check = this.check;
    if (this.application || !check || check.canApply || check.reason === 'not-in-server') return '';
    return `${check.message}. ${check.suggestion}.`;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (currentSession()) void this.load();
  }

  async load(): Promise<void> {
    const client = getCommandClient();
    const [own, check] = await Promise.all([
      client.read<OwnApplication | null>('application-get', {}),
      client.read<ApplyCheck>('application-check', {}),
    ]);
    if (own.success) {
      this.application = own.data ?? null;
      this.error = '';
    } else {
      this.error = own.error?.message ?? 'Could not read your application';
    }
    this.check = check.success ? (check.data ?? null) : null;
    if (this.joinFirst && this.invite === null) {
      this.invite = (await readGuildProfile()).discordInvite ?? null;
    }
    this.loaded = true;
  }

  /** "I've joined": the bot re-reads the membership, then the page asks again until it shows. */
  async recheck(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    this.note = '';
    try {
      const refreshed = await getCommandClient().run<{ status: 'current' | 'checking' }>(
        'member-refresh',
        {},
      );
      const tries = refreshed.data?.status === 'checking' ? RECHECK.tries : 1;
      for (let i = 0; i < tries; i++) {
        if (i > 0 || tries > 1) await wait(RECHECK.everyMs);
        await this.load();
        if (!this.joinFirst) return;
      }
      this.note =
        'Discord doesn’t show you in the server yet. If you just joined, give it a minute and try again.';
    } finally {
      this.checking = false;
    }
  }
}

await Page.define({
  name: 'vintage-apply-page',
  template,
  styles: [pageStyles, styles],
});
