import { css } from '@lushly-dev/fast-element';

/** Layout shared by every page. Tokens only. */
export const pageStyles = css`
  :host {
    display: block;
    padding: var(--space-xl) var(--space-inset) var(--space-3xl);
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    font-size: var(--font-size-md);
    line-height: var(--font-leading-relaxed);
  }

  .page {
    display: grid;
    gap: var(--space-xl);
    max-inline-size: 60rem;
    margin-inline: auto;
  }

  h1,
  h2 {
    margin: 0;
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    line-height: var(--font-leading-normal);
    letter-spacing: var(--font-tracking-tight);
    color: var(--color-text-primary);
  }

  h1 {
    font-size: var(--font-size-2xl);
  }

  h2 {
    font-size: var(--font-size-xl);
  }

  p {
    margin: 0;
  }

  /* No widows: browsers that support it rebalance a paragraph's last lines so it never ends on
     one short word, and headings split evenly. Unsupported browsers just wrap as before. */
  p,
  li,
  figcaption,
  blockquote {
    text-wrap: pretty;
  }

  h1,
  h2,
  h3 {
    text-wrap: balance;
  }

  ul {
    margin: 0;
    padding-inline-start: 1.2rem;
    display: grid;
    gap: var(--space-xs);
  }

  code {
    font-family: var(--font-family-mono);
    font-size: 0.9em;
  }

  .lead {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    max-inline-size: 40rem;
  }

  section {
    display: grid;
    gap: var(--space-sm);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  a {
    color: var(--color-text-accent);
  }

  a:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }
`;
