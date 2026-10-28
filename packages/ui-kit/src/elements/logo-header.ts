import {
  attr,
  css,
  FASTElement,
  html,
  nullableNumberConverter,
  when,
} from '@lushly-dev/fast-element';

const template = html<VintageLogoHeader>`
  <header class="bar" part="bar">
    <div class="brand" part="brand">
      <slot name="logo"></slot>
      ${when(
        (x) => Boolean(x.heading || x.tagline),
        html<VintageLogoHeader>`
          <div class="wordmark">
            <span class="heading" part="heading">${(x) => x.heading}</span>
            <span class="tagline" part="tagline">${(x) => x.tagline}</span>
          </div>
        `,
      )}
    </div>
    <nav class="nav" part="nav" aria-label="${(x) => x.navLabel}"><slot></slot></nav>
    <div class="side">
      ${when(
        (x) => Boolean(x.contextTitle),
        html<VintageLogoHeader>`
          <div class="context" part="context" aria-live="polite">
            <span class="eyebrow">${(x) => x.contextEyebrow}</span>
            <span class="title">${(x) => x.contextTitle}</span>
          </div>
        `,
      )}
      ${when(
        (x) => Boolean(x.actionLabel),
        html<VintageLogoHeader>`
          <a class="action" part="action" href="${(x) => x.actionHref || '#'}">${(x) => x.actionLabel}</a>
        `,
      )}
      <div class="member" part="member"><slot name="member"></slot></div>
      <div class="actions" part="actions"><slot name="actions"></slot></div>
    </div>
    <div class="progress" part="progress" style="${(x) => `inline-size: ${x.progressWidth}`}"></div>
  </header>
`;

const styles = css`
  :host {
    display: block;
    position: sticky;
    inset-block-start: 0;
    z-index: 20;
    /* The two-tone logo (assets/brand) reads these; slotted content inherits them. */
    --vintage-logo-ink: var(--logo-ink);
    --vintage-logo-paper: var(--logo-paper);
    background: color-mix(in srgb, var(--color-surface-canvas) 88%, transparent);
    backdrop-filter: blur(10px);
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .bar {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-sm) var(--space-lg);
    min-block-size: 4.1rem;
    padding: var(--space-xs) var(--space-inset);
    max-inline-size: 80rem;
    margin-inline: auto;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  ::slotted([slot='logo']) {
    display: block;
    inline-size: clamp(4rem, 6vw, 5.4rem);
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
    color: var(--color-text-primary);
  }

  .tagline {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .nav {
    display: flex;
    gap: var(--space-md);
    overflow-x: auto;
    scrollbar-width: none;
    min-inline-size: 0;
  }

  ::slotted(a) {
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
    text-decoration: none;
    white-space: nowrap;
    padding-block: var(--space-xs) calc(var(--space-xs) - var(--border-width-thin));
    border-block-end: var(--border-width-thin) solid transparent;
  }

  ::slotted(a:hover) {
    color: var(--color-text-primary);
  }

  ::slotted(a[aria-current='page']) {
    color: var(--color-text-primary);
    border-block-end-color: var(--color-text-accent);
  }

  ::slotted(a:focus-visible) {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .side {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-inline-size: 0;
  }

  .context {
    display: grid;
    text-align: end;
    min-inline-size: 0;
  }

  .context .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .context .title {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .action {
    display: inline-flex;
    align-items: center;
    padding: var(--space-xs) var(--space-sm);
    border-radius: 0.2rem;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    text-decoration: none;
    white-space: nowrap;
    border: var(--border-width-thin) solid color-mix(in srgb, var(--button-primary-bg) 55%, black);
    box-shadow: var(--shadow-button);
  }

  .action:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .member:not(:empty),
  .member:has(::slotted(*)) {
    padding-inline-start: var(--space-sm);
    border-inline-start: var(--border-width-thin) solid var(--color-border-default);
  }

  ::slotted([slot='member']) {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: var(--space-xs);
  }

  .progress {
    position: absolute;
    inset-inline-start: 0;
    inset-block-end: calc(-1 * var(--border-width-thin));
    block-size: var(--border-width-thin);
    inline-size: 0;
    background: var(--color-accent-primary);
    transition: inline-size var(--motion-duration-normal) linear;
  }

  @media (max-width: 62rem) {
    .bar {
      grid-template-columns: auto 1fr;
    }

    .side {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }

    .context {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .progress {
      transition: none;
    }
  }
`;

/**
 * The site header: sticky, with the two-tone Vintage logo, navigation, a context block that
 * names the section the reader is in and offers its action, the signed-in member, and a
 * scroll-progress line. Pages set the context as their sections scroll into view.
 *
 * @tagname vintage-logo-header
 * @summary Sticky site header with the themed logo, nav, section context, and progress line.
 * @slot logo - The two-tone logo SVG (`assets/brand/vintage-logo-two-tone.svg`), usually in a link home.
 * @slot - Navigation links. Mark the current page with `aria-current="page"`.
 * @slot member - The signed-in member (name and rank).
 * @slot actions - Header actions, such as the theme switch.
 * @csspart bar - The header row.
 * @csspart brand - Logo and wordmark.
 * @csspart heading - The guild name (hidden when `heading` is empty).
 * @csspart tagline - The line under the guild name.
 * @csspart nav - The navigation landmark.
 * @csspart context - The section eyebrow and title.
 * @csspart action - The section's action link.
 * @csspart member - The member slot wrapper.
 * @csspart actions - The actions area.
 * @csspart progress - The scroll-progress line.
 * @cssprop --logo-ink - Logo tag and outline color.
 * @cssprop --logo-paper - Logo letter color.
 */
export class VintageLogoHeader extends FASTElement {
  /** The guild name next to the logo; empty hides the wordmark (the logo already says it). */
  @attr heading = 'Vintage';
  /** The line under the guild name. */
  @attr tagline = '';
  /** Accessible name of the navigation landmark. */
  @attr({ attribute: 'nav-label' }) navLabel = 'Main';
  /** Small label above the section title, e.g. "Raids". */
  @attr({ attribute: 'context-eyebrow' }) contextEyebrow = '';
  /** The section the reader is in. Empty hides the context block. */
  @attr({ attribute: 'context-title' }) contextTitle = '';
  /** Label of the section's action. Empty hides it. */
  @attr({ attribute: 'action-label' }) actionLabel = '';
  /** Where the section's action goes. */
  @attr({ attribute: 'action-href' }) actionHref = '';
  /** How far down the page the reader is, 0–100. */
  @attr({ converter: nullableNumberConverter }) progress: number | null = 0;

  get progressWidth(): string {
    const value = Math.min(100, Math.max(0, this.progress ?? 0));
    return `${value}%`;
  }
}

if (!customElements.get('vintage-logo-header')) {
  await VintageLogoHeader.define({ name: 'vintage-logo-header', template, styles });
}
