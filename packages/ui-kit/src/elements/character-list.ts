import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { getCommandClient } from '../client';
import { titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';

/** One of the member's characters: the slice of `character-list` / `member-me` this shows. */
export interface ListedCharacter {
  id: string;
  name: string;
  class: string;
  spec: string;
  role: string;
  isMain: boolean;
}

/** A removal waiting for the member to confirm the server's preview. */
interface PendingRemoval {
  id: string;
  name: string;
  token: string;
}

const ROLE_WORDS: Record<string, string> = {
  tank: 'Tank',
  healer: 'Healer',
  melee: 'Melee DPS',
  ranged: 'Ranged DPS',
};

const template = html<VintageCharacterList>`
  <div class="list" part="list">
    ${when(
      (x) => x.characters.length === 0,
      html`<p class="empty" part="empty">No characters yet. Add your main below.</p>`,
    )}
    <ul>
      ${repeat(
        (x) => x.sorted,
        html<ListedCharacter, VintageCharacterList>`
          <li class="row ${(c) => (c.isMain ? 'main' : '')}">
            <span class="who">
              <b style="color: var(--color-class-${(c) => c.class})">${(c) => c.name}</b>
              <small>${(c) => titleCase(c.class)} · ${(c) => ROLE_WORDS[c.role] ?? titleCase(c.role)} · ${(c) => titleCase(c.spec)}</small>
            </span>
            ${when((c) => c.isMain, html`<span class="badge" part="main-badge">Main</span>`)}
            <span class="controls">
              ${when(
                (c) => !c.isMain,
                html<ListedCharacter, VintageCharacterList>`<button
                  type="button"
                  class="btn"
                  ?disabled="${(_, c) => c.parent.busy}"
                  @click="${(ch, c) => c.parent.makeMain(ch.id)}"
                >Make main</button>`,
              )}
              <button
                type="button"
                class="btn danger"
                ?disabled="${(_, c) => c.parent.busy}"
                @click="${(ch, c) => c.parent.removeCharacter(ch.id)}"
              >Remove</button>
            </span>
          </li>
        `,
      )}
    </ul>

    ${when(
      (x) => x.pending,
      html<VintageCharacterList>`
        <div class="confirm" part="confirm" role="alertdialog" aria-labelledby="confirm-text">
          <p id="confirm-text">
            Remove <b>${(x) => x.pending?.name}</b>? You'd need to add it again to sign it up for
            raids; signups it already has stay as they are.
          </p>
          <button type="button" class="btn danger" @click="${(x) => x.confirmRemove()}">Remove</button>
          <button type="button" class="btn" @click="${(x) => x.cancelRemove()}">Keep</button>
        </div>
      `,
    )}

    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
  </div>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .list {
    display: grid;
    gap: var(--space-sm);
  }

  ul {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-sm);
    padding-block: var(--space-sm);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
  }

  .row:first-child {
    border-block-start: 0;
  }

  .who {
    display: grid;
    min-inline-size: 0;
  }

  .who b {
    font-family: var(--font-family-display);
    font-size: var(--font-size-md);
  }

  .who small {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .badge {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-accent-secondary);
    padding: 0.15rem 0.5rem;
    border: var(--border-width-thin) solid
      color-mix(in srgb, var(--color-accent-secondary) 60%, transparent);
    border-radius: 999px;
  }

  .controls {
    display: flex;
    gap: var(--space-xs);
    justify-content: end;
    grid-column: 3;
  }

  .btn {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.35rem 0.75rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .btn.danger {
    color: var(--color-text-accent);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .empty,
  .status {
    margin: 0;
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

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width-thin) solid
      color-mix(in srgb, var(--color-text-accent) 55%, transparent);
    border-radius: 0.45rem;
    background: color-mix(in srgb, var(--color-text-accent) 8%, var(--color-surface-raised));
  }

  .confirm p {
    flex: 1 1 18rem;
    margin: 0;
  }

  @media (max-width: 40rem) {
    .row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .controls {
      grid-column: 1 / -1;
      justify-content: start;
    }
  }
`;

/**
 * The member's characters, main first, with "Make main" (`character-update`) and Remove
 * (`character-remove`: the server's preview, then confirm with its token). Feed it
 * `member-me`'s characters; it emits `characters-changed` after a change so the page re-reads.
 *
 * @tagname vintage-character-list
 * @summary The member's characters, with make-main and remove.
 * @fires characters-changed - After a main change or a removal succeeds.
 * @csspart list - The whole list.
 * @csspart empty - Shown when there are no characters.
 * @csspart main-badge - The "Main" badge.
 * @csspart confirm - A removal waiting for confirmation.
 * @csspart status - What just happened.
 */
export class VintageCharacterList extends FASTElement {
  @observable characters: ListedCharacter[] = [];
  @observable busy = false;
  @observable pending: PendingRemoval | null = null;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  /** Main first, then by name. */
  get sorted(): ListedCharacter[] {
    return [...this.characters].sort(
      (a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name),
    );
  }

  @command('vintage.character-main-set', {
    label: 'Make main',
    description: 'Make one of your characters your main.',
    category: 'Characters',
    parameters: {
      type: 'object',
      properties: { characterId: { type: 'string' } },
      required: ['characterId'],
    },
  })
  async makeMain(characterId: unknown): Promise<ElementResult<unknown>> {
    if (typeof characterId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a character to make main' });
    }
    const name = this.characters.find((c) => c.id === characterId)?.name ?? 'That character';
    return this.run('character-update', { characterId, isMain: true }, `${name} is your main`);
  }

  /** Remove a character: the first call is the server's preview; `confirmRemove` finishes it. */
  @command('vintage.character-remove', {
    label: 'Remove a character',
    description: 'Preview removing one of your characters; confirm to remove it.',
    category: 'Characters',
    parameters: {
      type: 'object',
      properties: { characterId: { type: 'string' } },
      required: ['characterId'],
    },
  })
  async removeCharacter(characterId: unknown): Promise<ElementResult<unknown>> {
    if (typeof characterId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a character to remove' });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    const name = this.characters.find((c) => c.id === characterId)?.name ?? 'this character';
    this.busy = true;
    try {
      const raw = await getCommandClient().run<{ confirmToken?: string }>('character-remove', {
        characterId,
      });
      const result = toElementResult(raw);
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const token = raw.success ? raw.data?.confirmToken : undefined;
      if (!token) {
        this.say('success', `Removed ${name}`);
        this.$emit('characters-changed');
        return result;
      }
      this.pending = { id: characterId, name, token };
      this.say('idle', '');
      return result;
    } finally {
      this.busy = false;
    }
  }

  async confirmRemove(): Promise<ElementResult<unknown>> {
    const pending = this.pending;
    if (!pending) return failure({ code: 'NOTHING_TO_CONFIRM', message: 'No removal waiting' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run(
          'character-remove',
          { characterId: pending.id },
          { confirmToken: pending.token },
        ),
      );
      this.pending = null;
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', `Removed ${pending.name}`);
      this.$emit('characters-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  cancelRemove(): void {
    if (this.pending) this.say('idle', `Kept ${this.pending.name}`);
    this.pending = null;
  }

  private async run(
    name: string,
    input: Record<string, unknown>,
    done: string,
  ): Promise<ElementResult<unknown>> {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, input));
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', done);
      this.$emit('characters-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  private say(kind: 'idle' | 'error' | 'success', text: string): void {
    this.statusKind = kind;
    this.statusText = text;
  }
}

if (!customElements.get('vintage-character-list')) {
  await VintageCharacterList.define({ name: 'vintage-character-list', template, styles });
}
