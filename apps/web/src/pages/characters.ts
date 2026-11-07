import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import type { Character } from '@vintage/identity/contract';
import type { ArmoryCardEntry } from '@vintage/ui-kit';
import { ARMORY_POLL_MS, ARMORY_POLL_TRIES, inFlight, readArmory } from '../armory';
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
              @character-edit="${(x, c) => x.edit((c.event as CustomEvent<Character>).detail)}"
            ></vintage-character-list>`,
          )}
          ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
        </section>
        ${when(
          (x) => x.loaded && x.characters.length > 0,
          html<Page>`
            <section aria-labelledby="armory">
              <h2 id="armory">Armory</h2>
              <p class="muted">
                What the WoW: Forever armory says about each character: level, item level, and
                gear, refreshed twice a day. Linking one is your word that it's yours.
              </p>
              <div class="cards">
                ${repeat(
                  (x) => x.sortedCharacters,
                  html<Character, Page>`<vintage-armory-card
                    :character="${(c) => c}"
                    :entry="${(c, ctx) => ctx.parent.armory[c.id] ?? null}"
                    :now="${(_, ctx) => ctx.parent.now}"
                    @armory-changed="${(_, ctx) => ctx.parent.armoryEdited()}"
                  ></vintage-armory-card>`,
                )}
              </div>
              ${when(
                (x) => x.armoryError,
                html<Page>`<p class="error" role="alert">${(x) => x.armoryError}</p>`,
              )}
            </section>
          `,
        )}
        <section aria-labelledby="add">
          <h2 id="add">${(x) => (x.editing ? `Edit ${x.editing.name}` : 'Add a character')}</h2>
          <vintage-character-form
            :character="${(x) => x.editing}"
            @character-added="${(x) => x.load()}"
            @character-saved="${(x) => x.saved()}"
            @edit-cancelled="${(x) => {
              x.editing = null;
            }}"
          ></vintage-character-form>
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

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
    gap: var(--space-md);
  }
`;

/**
 * `/characters`: the member's characters, with edit, make-main and remove, and the add form
 * (which becomes the edit form while a character is being edited).
 */
export class Page extends FASTElement {
  @observable characters: Character[] = [];
  /** The character open in the form, or null while the form adds a new one. */
  @observable editing: Character | null = null;
  @observable loaded = false;
  @observable notInGuild = false;
  @observable error = '';
  /** Your armory links by character id (`armory-list`). */
  @observable armory: Record<string, ArmoryCardEntry> = {};
  @observable armoryError = '';
  /** When the armory was last read, for the cards' "checked 5 minutes ago". */
  @observable now = Date.now();
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private pollsLeft = 0;
  /** Bumped per armory read, so an older read that finishes last changes nothing. */
  private armoryRead = 0;

  connectedCallback(): void {
    super.connectedCallback();
    if (currentSession()) void this.load();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.pollsLeft = 0;
    this.armoryRead++;
    clearTimeout(this.pollTimer);
  }

  /** Main first, then by name, as the list above shows them. */
  get sortedCharacters(): Character[] {
    return [...this.characters].sort(
      (a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name),
    );
  }

  /**
   * Re-read the armory now, then poll while a fetch is in flight (it lands seconds later). Not
   * `armoryChanged`: FAST calls `<observable>Changed` on every change to `armory`, which would
   * re-read forever.
   */
  armoryEdited(): void {
    this.pollsLeft = ARMORY_POLL_TRIES;
    void this.loadArmory();
  }

  async loadArmory(): Promise<void> {
    clearTimeout(this.pollTimer);
    const mine = ++this.armoryRead;
    const read = await readArmory();
    // A newer read (or leaving the page) supersedes this one: no overwrite, no second poll chain.
    if (mine !== this.armoryRead) return;
    this.now = Date.now();
    if (!read.ok) {
      this.armoryError = read.message;
      return;
    }
    this.armory = read.byCharacter;
    this.armoryError = '';
    if (this.pollsLeft > 0 && Object.values(read.byCharacter).some(inFlight)) {
      this.pollsLeft--;
      this.pollTimer = setTimeout(() => void this.loadArmory(), ARMORY_POLL_MS);
    }
  }

  /** Open a character in the form and bring the form into view. */
  edit(character: Character): void {
    this.editing = character;
    this.shadowRoot?.querySelector('#add')?.scrollIntoView?.({ behavior: 'smooth' });
  }

  async saved(): Promise<void> {
    this.editing = null;
    await this.load();
  }

  async load(): Promise<void> {
    const read = await readMember();
    if (read.ok) {
      this.characters = read.data.characters;
      this.error = '';
      this.pollsLeft = ARMORY_POLL_TRIES;
      await this.loadArmory();
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
