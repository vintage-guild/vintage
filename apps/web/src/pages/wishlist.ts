import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { type Tier, tierAllows } from '@vintage/guild-kit';
import type { Character } from '@vintage/identity/contract';
import { getCommandClient } from '@vintage/ui-kit';
import type { WishlistEntry } from '@vintage/wishlist/contract';
import { characterLabel } from '../characters';
import { readMember } from '../member-data';
import { canSignIn, currentSession } from '../session';
import { pageStyles } from './page-styles';

interface WishlistGetResult {
  characterId: string;
  characterName: string;
  memberId: string;
  entries: WishlistEntry[];
}

const template = html<Page>`
  <div class="page">
    <h1>Wishlist</h1>
    <p class="lead">
      Rank the drops you want most for each character. Loot council candidates factor these
      rankings in alongside your role and recent wins.
    </p>
    ${when(
      () => !currentSession(),
      html`
        <vintage-sign-in-card heading="Your wishlist" ?available="${() => canSignIn()}">
          Sign in with Discord to rank wanted items for your characters.
        </vintage-sign-in-card>
      `,
    )}
    ${when(
      (x) => currentSession() && x.notInGuild,
      html`<p class="lead">
        You're signed in, but not in the guild's Discord yet. Wishlists open up once an officer adds
        you.
      </p>`,
    )}
    ${when(
      (x) => currentSession() && !x.notInGuild,
      html<Page>`
        ${when((x) => !x.loaded, html`<p class="muted">Loading your characters…</p>`)}
        ${when(
          (x) => x.loaded && x.characters.length === 0,
          html`<p class="muted">
            Add a character on <a href="/characters">Characters</a> before building a wishlist.
          </p>`,
        )}
        ${when(
          (x) => x.loaded && x.characters.length > 0,
          html<Page>`
            <section aria-labelledby="character-pick">
              <h2 id="character-pick">Character</h2>
              <div class="row">
                <label class="field">
                  <span>Active character</span>
                  <select
                    aria-label="Character"
                    :value="${(x) => x.selectedCharacterId}"
                    @change="${(x, c) =>
                      x.selectCharacter((c.event.target as HTMLSelectElement).value)}"
                  >
                    ${repeat(
                      (x) => x.sortedCharacters,
                      html<Character>`<option value="${(c) => c.id}">
                        ${(c) => `${characterLabel(c)}${c.isMain ? ' (main)' : ''}`}
                      </option>`,
                    )}
                  </select>
                </label>
              </div>
            </section>

            <section aria-labelledby="ranked-items">
              <div class="section-head">
                <h2 id="ranked-items">Ranked items</h2>
                ${when(
                  (x) => x.canEdit && x.entries.length > 0,
                  html<Page>`<button
                    type="button"
                    class="ghost"
                    ?disabled="${(x) => x.saving}"
                    @click="${(x) => x.clearAll()}"
                  >
                    Clear list
                  </button>`,
                )}
              </div>
              ${when((x) => x.loadingList, html`<p class="muted">Loading wishlist…</p>`)}
              ${when(
                (x) => !x.loadingList && x.entries.length === 0,
                html`<p class="muted">No items on this character's wishlist yet.</p>`,
              )}
              ${when(
                (x) => !x.loadingList && x.entries.length > 0,
                html<Page>`
                  <ol class="wishlist">
                    ${repeat(
                      (x) => x.entries,
                      html<WishlistEntry, Page>`
                        <li class="entry">
                          <span class="rank">#${(e) => e.rank}</span>
                          <div class="meta">
                            <strong>${(e) => e.itemName ?? `Item #${e.itemId}`}</strong>
                            <span class="item-id">Item #${(e) => e.itemId}</span>
                            ${when(
                              (e) => e.note,
                              html<WishlistEntry>`<span class="note">${(e) => e.note}</span>`,
                            )}
                          </div>
                          ${when(
                            (_, ctx) => ctx.parent.canEdit,
                            html<WishlistEntry, Page>`
                              <div class="actions">
                                <button
                                  type="button"
                                  aria-label="${(e) => `Move ${e.itemName ?? `Item #${e.itemId}`} up`}"
                                  ?disabled="${(e, ctx) =>
                                    ctx.parent.saving ||
                                    ctx.parent.entries[0]?.itemId === e.itemId}"
                                  @click="${(e, ctx) => ctx.parent.moveItem(e.itemId, -1)}"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  aria-label="${(e) => `Move ${e.itemName ?? `Item #${e.itemId}`} down`}"
                                  ?disabled="${(e, ctx) =>
                                    ctx.parent.saving ||
                                    ctx.parent.entries[ctx.parent.entries.length - 1]?.itemId ===
                                      e.itemId}"
                                  @click="${(e, ctx) => ctx.parent.moveItem(e.itemId, 1)}"
                                >
                                  Down
                                </button>
                                <button
                                  type="button"
                                  class="danger"
                                  aria-label="${(e) => `Remove ${e.itemName ?? `Item #${e.itemId}`}`}"
                                  ?disabled="${(_, ctx) => ctx.parent.saving}"
                                  @click="${(e, ctx) => ctx.parent.removeItem(e.itemId)}"
                                >
                                  Remove
                                </button>
                              </div>
                            `,
                          )}
                        </li>
                      `,
                    )}
                  </ol>
                `,
              )}
              ${when(
                (x) => x.status,
                html<Page>`<p class="status" role="status">${(x) => x.status}</p>`,
              )}
              ${when(
                (x) => x.error,
                html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`,
              )}
            </section>

            ${when(
              (x) => x.canEdit,
              html<Page>`
                <section aria-labelledby="add-item">
                  <h2 id="add-item">Add an item</h2>
                  <form class="add-form" @submit="${(x, c) => x.onAdd(c.event as SubmitEvent)}">
                    <label class="field">
                      <span>Item ID</span>
                      <input
                        name="itemId"
                        type="number"
                        min="1"
                        step="1"
                        required
                        placeholder="17103"
                        :value="${(x) => x.itemIdInput}"
                        @input="${(x, c) => {
                          x.itemIdInput = (c.event.target as HTMLInputElement).value;
                        }}"
                      />
                    </label>
                    <label class="field">
                      <span>Item name</span>
                      <input
                        name="itemName"
                        type="text"
                        maxlength="160"
                        placeholder="Azuresong Mageblade"
                        :value="${(x) => x.itemNameInput}"
                        @input="${(x, c) => {
                          x.itemNameInput = (c.event.target as HTMLInputElement).value;
                        }}"
                      />
                    </label>
                    <label class="field">
                      <span>Note (optional)</span>
                      <input
                        name="note"
                        type="text"
                        maxlength="240"
                        placeholder="BiS mainhand, huge upgrade"
                        :value="${(x) => x.noteInput}"
                        @input="${(x, c) => {
                          x.noteInput = (c.event.target as HTMLInputElement).value;
                        }}"
                      />
                    </label>
                    <div class="row">
                      <button type="submit" class="primary" ?disabled="${(x) => x.saving}">
                        Add to wishlist
                      </button>
                    </div>
                  </form>
                </section>
              `,
            )}
            ${when(
              (x) => !x.canEdit,
              html`<p class="muted">
                Recruits and raiders can edit their own character wishlists.
              </p>`,
            )}
          `,
        )}
      `,
    )}
  </div>
`;

const styles = css`
  .muted {
    color: var(--color-text-secondary);
  }

  .status {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .error {
    color: var(--color-text-accent);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .field {
    display: grid;
    gap: 0.25rem;
    font-size: var(--font-size-sm);
  }

  .field span {
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
  }

  input,
  select {
    font: inherit;
    color: var(--color-text-primary);
    background: var(--color-surface-raised);
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.3rem;
    padding: 0.45rem 0.65rem;
    min-inline-size: 14rem;
  }

  .wishlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-xs);
  }

  .entry {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-subtle);
    background: var(--color-surface-raised);
  }

  .rank {
    font-family: var(--font-family-mono);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-accent);
    min-inline-size: 2.25rem;
  }

  .meta {
    display: grid;
    gap: 0.15rem;
  }

  .item-id {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .note {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .add-form {
    display: grid;
    gap: var(--space-sm);
    max-inline-size: 32rem;
    padding: var(--space-md);
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-subtle);
    background: var(--color-surface-raised);
  }

  button {
    font: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    padding: 0.35rem 0.7rem;
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-canvas);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  button.primary {
    background: var(--color-text-accent);
    border-color: var(--color-text-accent);
    color: var(--color-surface-canvas);
  }

  button.ghost {
    background: transparent;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/**
 * `/wishlist`: rank wanted raid drops per character (`wishlist-get` / `wishlist-set`).
 */
export class Page extends FASTElement {
  @observable characters: Character[] = [];
  @observable selectedCharacterId = '';
  @observable entries: WishlistEntry[] = [];
  @observable loaded = false;
  @observable loadingList = false;
  @observable saving = false;
  @observable notInGuild = false;
  @observable status = '';
  @observable error = '';
  @observable itemIdInput = '';
  @observable itemNameInput = '';
  @observable noteInput = '';

  get sortedCharacters(): Character[] {
    return [...this.characters].sort(
      (a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name),
    );
  }

  get canEdit(): boolean {
    const session = currentSession();
    return Boolean(session && tierAllows(session.tier as Tier, 'recruit'));
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (currentSession()) void this.loadCharacters();
  }

  async loadCharacters(): Promise<void> {
    this.error = '';
    const outcome = await readMember();
    this.loaded = true;
    if (!outcome.ok) {
      if (outcome.reason === 'not-in-guild') this.notInGuild = true;
      else this.error = outcome.message;
      return;
    }
    this.characters = outcome.data.characters;
    const sorted = this.sortedCharacters;
    if (!sorted.length) {
      this.selectedCharacterId = '';
      this.entries = [];
      return;
    }
    const existing = sorted.find((c) => c.id === this.selectedCharacterId);
    this.selectedCharacterId = existing ? existing.id : sorted[0]!.id;
    await this.loadWishlist();
  }

  async selectCharacter(characterId: string): Promise<void> {
    this.selectedCharacterId = characterId;
    this.status = '';
    await this.loadWishlist();
  }

  async loadWishlist(): Promise<void> {
    if (!this.selectedCharacterId) return;
    this.loadingList = true;
    this.error = '';
    const result = await getCommandClient().read<WishlistGetResult>('wishlist-get', {
      characterId: this.selectedCharacterId,
    });
    this.loadingList = false;
    if (!result.success) {
      this.error = result.error?.message ?? 'Could not load wishlist.';
      return;
    }
    this.entries = result.data?.entries ?? [];
  }

  private async saveItems(
    items: { itemId: number; itemName: string | null; note: string | null }[],
    statusText: string,
  ): Promise<boolean> {
    if (!this.selectedCharacterId) return false;
    this.saving = true;
    this.error = '';
    this.status = '';
    const result = await getCommandClient().run<WishlistGetResult>('wishlist-set', {
      characterId: this.selectedCharacterId,
      items: items.map((item, idx) => ({
        itemId: item.itemId,
        itemName: item.itemName,
        rank: idx + 1,
        note: item.note,
      })),
    });
    this.saving = false;
    if (!result.success) {
      this.error = result.error?.message ?? 'Could not save wishlist.';
      return false;
    }
    this.entries = result.data?.entries ?? [];
    this.status = statusText;
    return true;
  }

  async onAdd(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const itemId = Number.parseInt(this.itemIdInput.trim(), 10);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      this.error = 'Enter a positive numeric item ID.';
      return;
    }
    const next = [
      ...this.entries.map(({ itemId: id, itemName, note }) => ({ itemId: id, itemName, note })),
      {
        itemId,
        itemName: this.itemNameInput.trim() || null,
        note: this.noteInput.trim() || null,
      },
    ];
    const ok = await this.saveItems(next, `Added item #${itemId}.`);
    if (ok) {
      this.itemIdInput = '';
      this.itemNameInput = '';
      this.noteInput = '';
    }
  }

  async moveItem(itemId: number, delta: -1 | 1): Promise<void> {
    const idx = this.entries.findIndex((e) => e.itemId === itemId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= this.entries.length) return;
    const copy = this.entries.map(({ itemId: id, itemName, note }) => ({
      itemId: id,
      itemName,
      note,
    }));
    const [moved] = copy.splice(idx, 1);
    copy.splice(target, 0, moved!);
    await this.saveItems(copy, 'Updated wishlist order.');
  }

  async removeItem(itemId: number): Promise<void> {
    const next = this.entries
      .filter((e) => e.itemId !== itemId)
      .map(({ itemId: id, itemName, note }) => ({ itemId: id, itemName, note }));
    await this.saveItems(next, `Removed item #${itemId}.`);
  }

  async clearAll(): Promise<void> {
    await this.saveItems([], 'Cleared wishlist.');
  }
}

if (!customElements.get('vintage-wishlist-page')) {
  await Page.define({
    name: 'vintage-wishlist-page',
    template,
    styles: [pageStyles, styles],
  });
}
