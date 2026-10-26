import { css, FASTElement, html, observable, when } from '@lushly-dev/fast-element';
import type { Character, MemberPrefs } from '@vintage/identity/contract';
import { characterLabel } from '../characters';
import { readMember } from '../member-data';
import { canSignIn, currentSession, refreshSession, setSession } from '../session';
import { pageStyles } from './page-styles';

const rankWords = (rank: string | null | undefined) => {
  const words = (rank ?? 'member').replace('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const template = html<Page>`
  <div class="page">
    <h1>Profile</h1>
    ${when(
      () => !currentSession(),
      html`
        <vintage-sign-in-card heading="Your profile" ?available="${() => canSignIn()}">
          Sign in with Discord to see your rank, your main, and your raid preferences.
        </vintage-sign-in-card>
      `,
    )}
    ${when(
      () => currentSession(),
      html<Page>`
        <section class="who" aria-label="You">
          ${when(
            () => currentSession()?.avatarUrl,
            html`<img class="avatar" src="${() => currentSession()?.avatarUrl ?? ''}" alt="" width="64" height="64" />`,
          )}
          <div>
            <p class="name">${() => currentSession()?.displayName}</p>
            <p class="muted">${(x) => x.standing}</p>
          </div>
        </section>
      `,
    )}
    ${when(
      (x) => currentSession() && x.notInGuild,
      html`<p class="lead">You're signed in with Discord, but not in the guild's server yet, so
        there's nothing to set here. Ask an officer for an invite.</p>`,
    )}
    ${when(
      (x) => currentSession() && !x.notInGuild,
      html<Page>`
        <section aria-labelledby="settings">
          <h2 id="settings">Raid settings</h2>
          ${when((x) => !x.loaded, html`<p class="muted">Loading your settings…</p>`)}
          ${when(
            (x) => x.loaded && x.prefs,
            html<Page>`<vintage-member-prefs
              :characters="${(x) => x.characters}"
              timezone="${(x) => x.prefs?.timezone ?? ''}"
              ?dm-opt-out="${(x) => x.prefs?.dmOptOut ?? false}"
              @prefs-changed="${(x) => x.changed()}"
            ></vintage-member-prefs>`,
          )}
          ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
        </section>
      `,
    )}
  </div>
`;

const styles = css`
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .avatar {
    inline-size: 4rem;
    block-size: 4rem;
    border-radius: 50%;
    border: var(--border-width-thin) solid var(--color-border-strong);
  }

  .name {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-xl);
  }

  .muted {
    color: var(--color-text-secondary);
  }

  .error {
    color: var(--color-text-accent);
  }
`;

/** `/profile`: who you are here, your main, your time zone, and reminder DMs. */
export class Page extends FASTElement {
  @observable characters: Character[] = [];
  @observable prefs: MemberPrefs | null = null;
  @observable loaded = false;
  @observable notInGuild = false;
  @observable error = '';

  /** "Flex raider · Bloodfen Il · Warrior · Tank", or the rank alone without a main. */
  get standing(): string {
    const rank = rankWords(currentSession()?.rank);
    const main = this.characters.find((c) => c.isMain);
    return main ? `${rank} · main ${characterLabel(main)}` : rank;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (currentSession()) void this.load();
  }

  async load(): Promise<void> {
    const read = await readMember();
    if (read.ok) {
      this.characters = read.data.characters;
      this.prefs = read.data.member.prefs;
      this.error = '';
    } else if (read.reason === 'not-in-guild') {
      this.notInGuild = true;
    } else {
      this.error = read.message;
    }
    this.loaded = true;
  }

  /**
   * A setting changed: refresh the session from the server (live sign-in), re-read, and carry
   * the new zone into the session either way, so raid times everywhere follow it now.
   */
  async changed(): Promise<void> {
    await refreshSession();
    await this.load();
    const session = currentSession();
    if (session && this.prefs) {
      const { timezone: _old, ...rest } = session;
      setSession(this.prefs.timezone ? { ...rest, timezone: this.prefs.timezone } : rest);
    }
  }
}

await Page.define({ name: 'vintage-profile-page', template, styles: [pageStyles, styles] });
