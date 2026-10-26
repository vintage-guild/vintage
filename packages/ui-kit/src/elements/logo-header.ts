import { attr, css, FASTElement, html } from '@lushly-dev/fast-element';

const template = html<VintageLogoHeader>`
  <header class="bar" part="bar">
    <div class="brand" part="brand">
      <slot name="logo"></slot>
      <div class="wordmark">
        <span class="heading" part="heading">${(x) => x.heading}</span>
        <span class="tagline" part="tagline">${(x) => x.tagline}</span>
      </div>
    </div>
    <nav class="nav" part="nav" aria-label="${(x) => x.navLabel}"><slot></slot></nav>
    <div class="actions" part="actions"><slot name="actions"></slot></div>
  </header>
`;

const styles = css`
  :host {
    display: block;
    /* The two-tone logo (assets/brand) reads these; slotted content inherits them. */
    --vintage-logo-ink: var(--logo-ink);
    --vintage-logo-paper: var(--logo-paper);
    background: var(--color-surface-sunken);
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    color: var(--color-text-primary);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm) var(--space-lg);
    padding: var(--space-xs) var(--space-inset);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  ::slotted([slot='logo']) {
    display: block;
    inline-size: var(--space-3xl);
  }

  .wordmark {
    display: flex;
    flex-direction: column;
    line-height: var(--font-leading-normal);
  }

  .heading {
    font-family: var(--font-family-display);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    letter-spacing: var(--font-tracking-wide);
    color: var(--color-text-accent);
  }

  .tagline {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    flex: 1;
  }

  ::slotted(a) {
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--font-tracking-wide);
    text-decoration: none;
    border-block-end: var(--border-width-thin) solid transparent;
  }

  ::slotted(a:hover) {
    color: var(--color-text-primary);
  }

  ::slotted(a[aria-current='page']) {
    color: var(--color-text-accent);
    border-block-end-color: var(--color-accent-primary);
  }

  ::slotted(a:focus-visible) {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .actions {
    display: flex;
    gap: var(--space-xs);
  }
`;

/**
 * Site header with the two-tone Vintage logo, wordmark, navigation, and actions. The logo's
 * ink and paper come from the `--logo-ink` / `--logo-paper` tokens, so it follows the theme.
 *
 * @tagname vintage-logo-header
 * @summary Site header with the themed two-tone logo.
 * @slot logo - The two-tone logo SVG (`assets/brand/vintage-logo-two-tone.svg`), usually in a link home.
 * @slot - Navigation links. Mark the current page with `aria-current="page"`.
 * @slot actions - Header actions, such as the theme switch.
 * @csspart bar - The header row.
 * @csspart brand - Logo and wordmark.
 * @csspart heading - The guild name.
 * @csspart tagline - The line under the guild name.
 * @csspart nav - The navigation landmark.
 * @csspart actions - The actions area.
 * @cssprop --logo-ink - Logo tag and outline color.
 * @cssprop --logo-paper - Logo letter color.
 */
export class VintageLogoHeader extends FASTElement {
  /** The guild name next to the logo. */
  @attr heading = 'Vintage';
  /** The line under the guild name. */
  @attr tagline = '';
  /** Accessible name of the navigation landmark. */
  @attr({ attribute: 'nav-label' }) navLabel = 'Main';
}

if (!customElements.get('vintage-logo-header')) {
  await VintageLogoHeader.define({ name: 'vintage-logo-header', template, styles });
}
