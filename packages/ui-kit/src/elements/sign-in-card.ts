import { attr, css, FASTElement, html } from '@lushly-dev/fast-element';
import '../primitives';

const template = html<VintageSignInCard>`
  <violet-card appearance="outline" padding="large" part="card">
    <h2 slot="header" class="title" part="title">${(x) => x.heading}</h2>
    <p class="body" part="body"><slot>Sign in with Discord to see your profile and characters.</slot></p>
    <div slot="footer" class="footer">
      <violet-button appearance="primary" ?disabled="${(x) => !x.href}" @click="${(x) => x.signIn()}">
        Sign in with Discord
      </violet-button>
      <span class="note" part="note">${(x) => (x.href ? '' : x.unavailable)}</span>
    </div>
  </violet-card>
`;

const styles = css`
  :host {
    display: block;
    max-inline-size: 32rem;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    --violet-card-background: var(--card-bg);
    --violet-card-border-color: var(--card-border);
  }

  .title {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--font-size-xl);
    color: var(--color-text-accent);
  }

  .body {
    margin: 0;
    line-height: var(--font-leading-relaxed);
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }

  .note {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  violet-button {
    font-family: var(--font-family-sans);
  }
`;

/**
 * What a member page shows to a signed-out visitor. With no `href` the button is disabled and
 * the `unavailable` note explains why; Discord sign-in (#7) supplies the href.
 *
 * @tagname vintage-sign-in-card
 * @summary Signed-out placeholder with the Discord sign-in button.
 * @slot - Why signing in is needed on this page.
 * @csspart card - The violet-card surface.
 * @csspart title - The heading.
 * @csspart body - The explanation.
 * @csspart note - Shown while sign-in is unavailable.
 */
export class VintageSignInCard extends FASTElement {
  @attr heading = 'Members only';
  /** Where the sign-in button goes. Empty disables it. */
  @attr href = '';
  /** The note shown while there's no sign-in href. */
  @attr unavailable = 'Discord sign-in is coming soon.';

  signIn(): void {
    if (this.href) window.location.assign(this.href);
  }
}

if (!customElements.get('vintage-sign-in-card')) {
  await VintageSignInCard.define({ name: 'vintage-sign-in-card', template, styles });
}
