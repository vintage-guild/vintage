import { attr, css, FASTElement, html, when } from '@lushly-dev/fast-element';

const template = html<VintageMemberMenu>`
  <details class="menu" part="menu" @toggle="${(x, c) => x.onToggle(c.event)}">
    <summary class="who" part="summary" aria-label="${(x) => `${x.name}, ${x.detail}. Account menu`}">
      <span class="avatar" part="avatar">
        ${when(
          (x) => x.avatarSrc,
          html<VintageMemberMenu>`<img src="${(x) => x.avatarSrc}" alt="" width="36" height="36" />`,
        )}
        ${when((x) => !x.avatarSrc, html<VintageMemberMenu>`<span class="initial">${(x) => x.initial}</span>`)}
      </span>
      <span class="text">
        <b part="name">${(x) => x.name}</b>
        <span class="detail" part="detail">${(x) => x.detail}</span>
      </span>
    </summary>
    <div class="panel" part="panel">
      <a href="${(x) => x.profileHref}">Profile</a>
      <a href="${(x) => x.charactersHref}">Characters</a>
      <slot></slot>
    </div>
  </details>
`;

const styles = css`
  :host {
    display: inline-block;
    position: relative;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  /* The host's own display would otherwise beat the [hidden] the shell sets while signed out. */
  :host([hidden]) {
    display: none;
  }

  .menu {
    position: relative;
  }

  summary {
    list-style: none;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0.2rem 0.5rem 0.2rem 0.2rem;
    border-radius: 2rem;
    border: var(--border-width-thin) solid transparent;
    cursor: pointer;
    user-select: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover,
  .menu[open] summary {
    border-color: var(--color-border-strong);
    background: color-mix(in srgb, var(--color-surface-raised) 70%, transparent);
  }

  summary:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .avatar {
    display: grid;
    place-items: center;
    inline-size: 2.25rem;
    block-size: 2.25rem;
    border-radius: 50%;
    overflow: hidden;
    background: var(--color-surface-raised);
    box-shadow:
      0 0 0 2px var(--color-surface-canvas),
      0 0 0 3px var(--color-border-strong);
  }

  .avatar img {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }

  .initial {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-md);
  }

  .text {
    display: grid;
    line-height: var(--font-leading-normal);
  }

  b {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }

  .detail {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .panel {
    position: absolute;
    inset-inline-end: 0;
    inset-block-start: calc(100% + var(--space-xs));
    min-inline-size: 11rem;
    display: grid;
    padding: var(--space-xs);
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-raised);
    z-index: 30;
  }

  .panel a,
  ::slotted(a),
  ::slotted(button) {
    padding: var(--space-xs) var(--space-sm);
    border-radius: 0.25rem;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-decoration: none;
  }

  .panel a:hover,
  ::slotted(a:hover),
  ::slotted(button:hover) {
    background: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
  }

  .panel a:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
  }

  @media (max-width: 40rem) {
    .text {
      display: none;
    }
  }
`;

/**
 * The signed-in member in the header: a round avatar (Discord's, once sign-in supplies it;
 * the member's initial until then), their name and rank, and a menu with Profile and
 * Characters. Extra links go in the default slot.
 *
 * @tagname vintage-member-menu
 * @summary Avatar, name, and rank with a Profile / Characters menu.
 * @slot - Extra menu links, such as Sign out.
 * @csspart menu - The details element.
 * @csspart summary - The avatar and name button.
 * @csspart avatar - The round avatar.
 * @csspart name - The display name.
 * @csspart detail - The line under the name (rank).
 * @csspart panel - The dropdown.
 */
export class VintageMemberMenu extends FASTElement {
  /** The member's display name. */
  @attr name = '';
  /** The line under the name, usually the rank. */
  @attr detail = '';
  /** Avatar image URL; empty shows the initial. */
  @attr({ attribute: 'avatar-src' }) avatarSrc = '';
  @attr({ attribute: 'profile-href' }) profileHref = '/profile';
  @attr({ attribute: 'characters-href' }) charactersHref = '/characters';

  get initial(): string {
    return this.name.trim().charAt(0).toUpperCase() || '?';
  }

  private readonly closeOnOutsideClick = (event: Event): void => {
    if (!event.composedPath().includes(this)) this.close();
  };

  onToggle(event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open) document.addEventListener('click', this.closeOnOutsideClick);
    else document.removeEventListener('click', this.closeOnOutsideClick);
  }

  close(): void {
    const details = this.shadowRoot?.querySelector('details');
    if (details) details.open = false;
  }

  disconnectedCallback(): void {
    document.removeEventListener('click', this.closeOnOutsideClick);
    super.disconnectedCallback();
  }
}

if (!customElements.get('vintage-member-menu')) {
  await VintageMemberMenu.define({ name: 'vintage-member-menu', template, styles });
}
