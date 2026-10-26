import { attr, css, FASTElement, html } from '@lushly-dev/fast-element';

const template = html<VintageFigure>`
  <div class="figure" part="figure">
    <b class="value" part="value">${(x) => x.value}<small part="unit">${(x) => x.unit}</small></b>
    <span class="caption" part="caption">${(x) => x.caption}</span>
  </div>
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
 * One big number with a unit and a caption: days to launch, bosses down, names on the rolls.
 * Lay several out in a row in the hero's `figures` slot or any grid.
 *
 * @tagname vintage-figure
 * @summary A big tabular number with a unit and caption.
 * @csspart figure - The block.
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
}

if (!customElements.get('vintage-figure')) {
  await VintageFigure.define({ name: 'vintage-figure', template, styles });
}
