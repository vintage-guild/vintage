import { css, html, when } from '@lushly-dev/fast-element';

/** What both OAuth pages share: the state they render from. */
export interface OAuthPageState {
  connected: boolean;
  hasPending: boolean;
  error: string;
}

/** The states before the member can act: no server, or nothing waiting on this page. */
export const unavailable = html<OAuthPageState>`
  ${when(
    (x) => !x.connected,
    html`<p class="lead">Connecting an app needs the guild server, and it couldn't be reached.
      Try again in a moment, starting from your app.</p>`,
  )}
  ${when(
    (x) => x.connected && !x.hasPending,
    html`<p class="lead">There's nothing to approve here. To connect Claude or another app to
      Vintage, start from the app; it brings you back to this page.</p>`,
  )}
`;

/** An action's failure. The signed query can't be retried from here, so the app starts over. */
export const failure = html<OAuthPageState>`
  ${when(
    (x) => x.error,
    html<OAuthPageState>`<div class="error" role="alert">
      <p>${(x) => x.error}</p>
      <p>Start again from your app to get a fresh link.</p>
    </div>`,
  )}
`;

/** Panel, buttons, and notes for the OAuth pages. Tokens only. */
export const oauthStyles = css`
  .page {
    max-inline-size: 36rem;
  }

  .panel {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-lg);
    border: var(--border-width-thin) solid var(--card-border);
    border-radius: var(--desk-control-radius);
    background: var(--card-bg);
  }

  .muted,
  .note {
    color: var(--color-text-secondary);
  }

  .note {
    font-size: var(--font-size-sm);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }

  button {
    font: var(--font-weight-medium) var(--font-size-md) var(--font-family-sans);
    padding: var(--desk-space-sm) var(--space-md);
    border-radius: var(--desk-control-radius);
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  button.primary {
    border-color: var(--button-primary-bg);
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    font-weight: var(--font-weight-bold);
  }

  button.link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-accent);
    font-size: inherit;
    text-decoration: underline;
  }

  button:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  button:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .error {
    display: grid;
    gap: var(--space-xs);
    color: var(--color-text-accent);
  }
`;
