import { css } from '@lushly-dev/fast-element';

/** The officers' desks (recruiting, guild profile): fields, fieldsets, buttons, the status line. */
export const deskStyles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .desk {
    display: grid;
    gap: var(--space-md);
    max-inline-size: 48rem;
  }

  .field {
    display: grid;
    gap: 0.3rem;
  }

  label,
  legend {
    font-weight: var(--font-weight-bold);
  }

  input,
  textarea,
  select {
    font: var(--font-size-md) var(--font-family-sans);
    padding: 0.45rem 0.6rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    max-inline-size: 100%;
    min-inline-size: 0;
  }

  textarea {
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
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.5rem;
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
    font-size: var(--font-size-sm);
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin: 0;
  }

  button {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.5rem 0.9rem;
    border-radius: 0.35rem;
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
