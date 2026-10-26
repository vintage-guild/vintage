import { css } from '@lushly-dev/fast-element';

/** Shared look for the class and role badges: an outline violet-badge with a color swatch. */
export const badgeStyles = css`
  :host {
    display: inline-flex;
    vertical-align: middle;
  }

  violet-badge::part(content) {
    gap: calc(var(--space-xs) / 2);
  }

  .swatch {
    display: inline-block;
    inline-size: 0.6em;
    block-size: 0.6em;
    border-radius: 50%;
    background: var(--_swatch, var(--color-text-secondary));
    box-shadow: 0 0 0 1px var(--color-border-strong);
  }

  .label {
    color: var(--color-text-primary);
  }

  .detail {
    color: var(--color-text-secondary);
  }
`;
