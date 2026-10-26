import { attr, css, FASTElement, html, when } from '@lushly-dev/fast-element';

const template = html<VintageHero>`
  <section class="hero" part="hero">
    ${when(
      (x) => Boolean(x.artSrc),
      html<VintageHero>`
        <div class="art" part="art" aria-hidden="${(x) => (x.artAlt ? 'false' : 'true')}">
          <img
            src="${(x) => x.artSrc}"
            alt="${(x) => x.artAlt}"
            style="${(x) => `object-position: ${x.artPosition}`}"
          />
        </div>
      `,
    )}
    <div class="content" part="content">
      <div class="eyebrow" part="eyebrow"><slot name="eyebrow"></slot></div>
      <div class="heading" part="heading"><slot></slot></div>
      <div class="standfirst" part="standfirst"><slot name="standfirst"></slot></div>
      <div class="actions" part="actions"><slot name="actions"></slot></div>
      <div class="figures" part="figures"><slot name="figures"></slot></div>
    </div>
  </section>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .hero {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    background: var(--color-surface-canvas);
  }

  /* The art shows clean on the right; the text sits on a dark fade on the left. */
  .art {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--color-surface-canvas);
  }

  .art img {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }

  .art::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(
        90deg,
        color-mix(in srgb, var(--color-surface-canvas) 96%, transparent) 0%,
        color-mix(in srgb, var(--color-surface-canvas) 90%, transparent) 34%,
        color-mix(in srgb, var(--color-surface-canvas) 55%, transparent) 50%,
        transparent 66%
      ),
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--color-surface-canvas) 55%, transparent) 0%,
        transparent 22%,
        transparent 62%,
        var(--color-surface-canvas) 100%
      );
  }

  .content {
    display: grid;
    gap: var(--space-md);
    max-inline-size: 80rem;
    margin-inline: auto;
    padding: var(--space-2xl) var(--space-inset) var(--space-md);
  }

  .eyebrow,
  .heading,
  .standfirst {
    text-shadow: 0 2px 18px rgb(0 0 0 / 55%);
  }

  .eyebrow {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-sm);
  }

  .eyebrow:empty,
  .standfirst:empty,
  .actions:empty,
  .figures:empty {
    display: none;
  }

  /* The page's own h1 rule outranks these; pages restate the size (see apps/web home.ts). */
  ::slotted(h1) {
    margin: 0;
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-heavy);
    font-size: clamp(3rem, 7.4vw, 6.6rem);
    line-height: 0.98;
    letter-spacing: var(--font-tracking-tight);
    max-inline-size: 13ch;
    text-wrap: balance;
  }

  ::slotted([slot='standfirst']) {
    margin: 0;
    font-size: clamp(var(--font-size-md), 1.5vw, 1.25rem);
    line-height: var(--font-leading-relaxed);
    max-inline-size: 46ch;
    color: var(--color-text-secondary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .figures {
    margin-block-start: var(--space-sm);
    padding-inline: var(--space-sm);
    border-radius: 0.4rem;
    background: color-mix(in srgb, var(--color-surface-canvas) 70%, transparent);
    backdrop-filter: blur(6px);
    border-block-start: var(--border-width-thin) solid
      color-mix(in srgb, var(--color-accent-secondary) 55%, transparent);
  }

  ::slotted([slot='figures']) {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }

  @media (max-width: 62rem) {
    .art::after {
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--color-surface-canvas) 80%, transparent) 0%,
        color-mix(in srgb, var(--color-surface-canvas) 72%, transparent) 60%,
        var(--color-surface-canvas) 100%
      );
    }

    ::slotted([slot='figures']) {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 40rem) {
    .content {
      padding-block: var(--space-xl) var(--space-md);
    }
  }
`;

/**
 * The home page opener: full-bleed art under a dark fade, with slots for the eyebrow pills,
 * the heading, a standfirst, actions, and the figures strip along its lower edge.
 *
 * @tagname vintage-hero
 * @summary Full-bleed hero with art, heading, standfirst, actions, and figures.
 * @slot eyebrow - Short labels above the heading (ruleset, raid nights, size).
 * @slot - The heading (`<h1>`).
 * @slot standfirst - One paragraph under the heading.
 * @slot actions - Links or buttons.
 * @slot figures - A row of `vintage-figure` elements.
 * @csspart hero - The band.
 * @csspart art - The art and its fade.
 * @csspart content - The text column.
 * @csspart figures - The figures panel.
 */
export class VintageHero extends FASTElement {
  /** URL of the art. Empty renders a plain band. */
  @attr({ attribute: 'art-src' }) artSrc = '';
  /** Alt text; empty marks the art decorative. */
  @attr({ attribute: 'art-alt' }) artAlt = '';
  /** CSS `object-position` for the art, so the subject stays in the clear right side. */
  @attr({ attribute: 'art-position' }) artPosition = '78% 42%';
}

if (!customElements.get('vintage-hero')) {
  await VintageHero.define({ name: 'vintage-hero', template, styles });
}
