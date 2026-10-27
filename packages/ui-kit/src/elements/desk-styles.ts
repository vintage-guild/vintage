import { css } from '@lushly-dev/fast-element';

/**
 * The officers' desks (calendar, recruiting, guild profile, applications, Random): fields,
 * fieldsets, buttons, the status line. Desks are a working surface, so inside one the page
 * spacing scale maps onto the denser desk scale (`--desk-*` tokens) and every control shares one
 * height, which keeps a row of fields lined up even when one of them has a hint under it. A form
 * on a public page adds `pageScaleStyles` after this to keep the page's own scale.
 */
export const deskStyles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    font-size: var(--desk-font-size);
    --space-xs: var(--desk-space-xs);
    --space-sm: var(--desk-space-sm);
    --space-md: var(--desk-space-md);
    --space-lg: var(--desk-space-lg);
  }

  .desk {
    display: grid;
    gap: var(--space-md);
    max-inline-size: 48rem;
  }

  .field {
    display: grid;
    gap: var(--space-xs);
    align-content: start;
  }

  label,
  legend {
    font-weight: var(--font-weight-bold);
    font-size: var(--desk-font-size-label);
  }

  input,
  textarea,
  select {
    box-sizing: border-box;
    font: var(--desk-font-size) var(--font-family-sans);
    padding: 0 var(--desk-control-pad-inline);
    border-radius: var(--desk-control-radius);
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    max-inline-size: 100%;
    min-inline-size: 0;
  }

  input:not([type='checkbox'], [type='radio']),
  select {
    block-size: var(--desk-control-height);
  }

  /* Under 16px, iOS zooms the page when a field takes focus. */
  @media (pointer: coarse) {
    input,
    textarea,
    select {
      font-size: max(1rem, var(--desk-font-size));
    }
  }

  textarea {
    padding-block: var(--space-xs);
    resize: vertical;
    line-height: 1.5;
  }

  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  button:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  :disabled {
    opacity: 0.7;
  }

  fieldset {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: var(--space-sm) var(--space-md) var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: var(--desk-control-radius);
    min-inline-size: 0;
  }

  legend {
    padding-inline: var(--space-xs);
  }

  small,
  .meta,
  .note {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin: 0;
  }

  button {
    box-sizing: border-box;
    min-block-size: var(--desk-control-height);
    font: var(--font-weight-medium) var(--desk-font-size) var(--font-family-sans);
    padding: 0 var(--space-sm);
    border-radius: var(--desk-control-radius);
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  button.primary {
    background: var(--color-accent-secondary);
    border-color: transparent;
    color: var(--color-surface-canvas);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .error {
    margin: 0;
    color: var(--color-feedback-danger);
    text-wrap: pretty;
  }

  .status {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .status:empty {
    display: none;
  }

  .status.error {
    color: var(--color-feedback-danger);
  }

  .status.success {
    color: var(--color-feedback-success);
  }
`;

/**
 * For a desk-styled form on a public page (the /apply form): undo the desk density so it matches
 * the page around it. Goes after `deskStyles`.
 */
export const pageScaleStyles = css`
  :host {
    font-size: inherit;
    --space-xs: inherit;
    --space-sm: inherit;
    --space-md: inherit;
    --space-lg: inherit;
  }

  label,
  legend {
    font-size: inherit;
  }

  input,
  textarea,
  select {
    font-size: var(--font-size-md);
    padding: 0.45rem 0.6rem;
  }

  input:not([type='checkbox'], [type='radio']),
  select {
    block-size: auto;
  }

  button {
    font-size: var(--font-size-sm);
    padding: 0.5rem 0.9rem;
  }

  small,
  .meta,
  .note {
    font-size: var(--font-size-sm);
  }
`;
