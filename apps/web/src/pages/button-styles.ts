import { css } from '@lushly-dev/fast-element';

/** The storefront's buttons (home hero, Recruitment): links styled as buttons. Tokens only. */
export const buttonStyles = css`
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0.7rem 1.1rem;
    border-radius: 0.2rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: color-mix(in srgb, var(--color-surface-canvas) 55%, transparent);
    color: var(--color-text-primary);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-sm);
    text-decoration: none;
    box-shadow: var(--shadow-edge);
  }

  /* Crisp, not glowing: a solid darker rim, a one-pixel highlight inside the top, and a
     one-pixel drop. No blur anywhere, so the edge stays sharp. */
  .btn.primary {
    border-color: color-mix(in srgb, var(--button-primary-bg) 55%, black);
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    box-shadow: var(--shadow-button);
  }

  .btn:hover {
    border-color: var(--color-text-secondary);
  }

  .btn.primary:hover {
    background: var(--color-verdigris-400);
    border-color: color-mix(in srgb, var(--color-verdigris-400) 55%, black);
  }
`;
