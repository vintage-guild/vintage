import { attr, css, FASTElement, html, when } from '@lushly-dev/fast-element';

const template = html<VintageHero>`
  <section class="hero" part="hero">
    ${when(
      (x) => Boolean(x.artSrc),
      html<VintageHero>`
        <div
          class="${(x) => (x.artPhoneSrc ? 'art phone' : 'art')}"
          part="art"
          aria-hidden="${(x) => (x.artAlt ? 'false' : 'true')}"
        >
          <picture>
            ${when(
              (x) => Boolean(x.artPhoneSrc),
              html<VintageHero>`<source media="(max-width: 40rem)" srcset="${(x) => x.artPhoneSrc}" />`,
            )}
            <img
              src="${(x) => x.artSrc}"
              alt="${(x) => x.artAlt}"
              style="${(x) => `--art-position: ${x.artPosition}; --art-phone-position: ${x.artPhonePosition}`}"
            />
          </picture>
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

  .art picture,
  .art img {
    display: block;
    inline-size: 100%;
    block-size: 100%;
  }

  .art img {
    object-fit: cover;
    object-position: var(--art-position, 78% 42%);
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

  /* Compact: a band for signed-in members, who have read the pitch. The heading stays (the
     page's one h1, now a greeting); the standfirst and actions go, and the art sits behind a
     shorter block. Pages restate the heading size, as for the full hero. */
  :host([compact]) .content {
    gap: var(--space-sm);
    padding-block: var(--space-xl) var(--space-sm);
  }

  :host([compact]) .standfirst,
  :host([compact]) .actions {
    display: none;
  }

  :host([compact]) ::slotted(h1) {
    font-size: clamp(2rem, 4.2vw, 3.4rem);
    max-inline-size: none;
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

    /* With phone art (the .phone class; an empty reflected attribute would still match
       [art-phone-src]) the subject sits in the lower two thirds, so the fade is heaviest at
       the top under the headline and at the foot under the figures, and lets the middle through. */
    .art.phone img {
      object-position: var(--art-phone-position, var(--art-position));
    }

    .art.phone::after {
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--color-surface-canvas) 90%, transparent) 0%,
        color-mix(in srgb, var(--color-surface-canvas) 74%, transparent) 34%,
        color-mix(in srgb, var(--color-surface-canvas) 36%, transparent) 60%,
        color-mix(in srgb, var(--color-surface-canvas) 28%, transparent) 80%,
        color-mix(in srgb, var(--color-surface-canvas) 94%, transparent) 100%
      );
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
 * @slot standfirst - One paragraph under the heading. Hidden when `compact`.
 * @slot actions - Links or buttons. Hidden when `compact`.
 * @slot figures - A row of `vintage-figure` elements.
 * @csspart hero - The band.
 * @csspart art - The art and its fade. `art-phone-src` swaps in a portrait on phones.
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
  /** Art for phones (40rem and under): a portrait composition. Empty keeps the main art. */
  @attr({ attribute: 'art-phone-src' }) artPhoneSrc = '';
  /** `object-position` for the phone art. */
  @attr({ attribute: 'art-phone-position' }) artPhonePosition = '50% 62%';
  /** A short band for signed-in members: heading and figures, no standfirst or actions. */
  @attr({ mode: 'boolean' }) compact = false;
}

if (!customElements.get('vintage-hero')) {
  await VintageHero.define({ name: 'vintage-hero', template, styles });
}
