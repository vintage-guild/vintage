import { attr, css, FASTElement, html, when } from '@lushly-dev/fast-element';

const body = html<VintageFigure>`
  <b class="value" part="value">${(x) => x.value}<small part="unit">${(x) => x.unit}</small></b>
  <span class="caption" part="caption">${(x) => x.caption}</span>
`;

/** With `href` the whole figure is a link; the caption is underlined to say so. */
const template = html<VintageFigure>`
  ${when((x) => x.href, html<VintageFigure>`<a class="figure link" part="figure" href="${(x) => x.href}">${body}</a>`)}
  ${when((x) => !x.href, html<VintageFigure>`<div class="figure" part="figure">${body}</div>`)}
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    padding: var(--space-sm) var(--space-sm) var(--space-sm) 0;
  }

  :host(:not(:first-child)) {
    padding-inline-start: var(--space-sm);
    border-inline-start: var(--border-width-thin) solid var(--color-border-default);
  }

  .figure {
    display: grid;
    gap: 0.1rem;
  }

  .value {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-heavy);
    font-size: clamp(2rem, 4vw, 3.4rem);
    line-height: 1;
    letter-spacing: var(--font-tracking-tight);
    font-variant-numeric: tabular-nums;
  }

  :host([tone='good']) .value {
    color: var(--color-verdigris-200);
  }

  :host([tone='accent']) .value {
    color: var(--color-text-accent);
  }

  small {
    margin-inline-start: 0.25em;
    font-family: var(--font-family-sans);
    font-size: 0.42em;
    font-weight: var(--font-weight-medium);
    letter-spacing: 0;
    color: var(--color-text-secondary);
  }

  small:empty {
    display: none;
  }

  .caption {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  a.figure {
    color: inherit;
    text-decoration: none;
  }

  a.figure .caption {
    text-decoration: underline;
    text-underline-offset: 0.2em;
    text-decoration-color: color-mix(in srgb, currentColor 50%, transparent);
  }

  a.figure:hover .caption {
    color: var(--color-text-primary);
    text-decoration-color: currentColor;
  }

  a.figure:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
    border-radius: 0.2rem;
  }

  @media (max-width: 62rem) {
    :host(:nth-child(odd)) {
      padding-inline-start: 0;
      border-inline-start: 0;
    }

    :host(:nth-child(n + 3)) {
      border-block-start: var(--border-width-thin) solid var(--color-border-default);
    }
  }
`;

/**
 * One big number with a unit and a caption: days to the next raid, bosses down, roles we need.
 * Lay several out in a row in the hero's `figures` slot or any grid.
 *
 * @tagname vintage-figure
 * @summary A big tabular number with a unit and caption.
 * @csspart figure - The block (a link when `href` is set).
 * @csspart value - The number.
 * @csspart unit - The unit after the number.
 * @csspart caption - The line under the number.
 */
export class VintageFigure extends FASTElement {
  /** The number, already formatted. */
  @attr value = '';
  /** Shown small after the number: "days", "/ 22". */
  @attr unit = '';
  /** What the number is. */
  @attr caption = '';
  /** `good` tints the number verdigris; `accent` tints it rose. */
  @attr tone: 'default' | 'good' | 'accent' = 'default';
  /** Where the figure leads, such as the list a count is of. Empty: not a link. */
  @attr href = '';
}

if (!customElements.get('vintage-figure')) {
  await VintageFigure.define({ name: 'vintage-figure', template, styles });
}
