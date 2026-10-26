import { css, FASTElement, html, observable, when } from '@lushly-dev/fast-element';
import type { Character } from '@vintage/identity/contract';
import { readMember } from '../member-data';
import { canSignIn, currentSession } from '../session';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <div class="page">
    <h1>Characters</h1>
    ${when(
      () => !currentSession(),
      html`
        <vintage-sign-in-card heading="Your characters" ?available="${() => canSignIn()}">
          Sign in with Discord to register your main and alts for raid signups.
        </vintage-sign-in-card>
      `,
    )}
    ${when(
      (x) => currentSession() && x.notInGuild,
      html`<p class="lead">You're signed in, but not in the guild's Discord yet. Characters open
        up once an officer adds you.</p>`,
    )}
    ${when(
      (x) => currentSession() && !x.notInGuild,
      html<Page>`
        <section aria-labelledby="yours">
          <h2 id="yours">Yours</h2>
          ${when((x) => !x.loaded, html`<p class="muted">Loading your characters…</p>`)}
          ${when(
            (x) => x.loaded,
            html<Page>`<vintage-character-list
              :characters="${(x) => x.characters}"
              @characters-changed="${(x) => x.load()}"
            ></vintage-character-list>`,
          )}
          ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
        </section>
        <section aria-labelledby="add">
          <h2 id="add">Add a character</h2>
          <vintage-character-form @character-added="${(x) => x.load()}"></vintage-character-form>
        </section>
      `,
    )}
  </div>
`;

const styles = css`
  .muted {
    color: var(--color-text-secondary);
  }

  .error {
    color: var(--color-text-accent);
  }
`;

/** `/characters`: the member's characters, with make-main and remove, and the add form. */
export class Page extends FASTElement {
  @observable characters: Character[] = [];
  @observable loaded = false;
  @observable notInGuild = false;
  @observable error = '';

  connectedCallback(): void {
    super.connectedCallback();
    if (currentSession()) void this.load();
  }

  async load(): Promise<void> {
    const read = await readMember();
    if (read.ok) {
      this.characters = read.data.characters;
      this.error = '';
    } else if (read.reason === 'not-in-guild') {
      this.notInGuild = true;
    } else {
      this.error = read.message;
    }
    this.loaded = true;
  }
}

await Page.define({
  name: 'vintage-characters-page',
  template,
  styles: [pageStyles, styles],
});
