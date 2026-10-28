import {
  attr,
  css,
  FASTElement,
  html,
  observable,
  repeat,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import {
  CLASS_NAMES,
  CLASSES,
  characterNameSchema,
  normalizeCharacterName,
  ROLES,
  type Role,
  roleFor,
  type WowClass,
} from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { isRole, isWowClass, roleLabel, titleCase } from '../labels';
import '../primitives';
import { describeError, type ElementResult, toElementResult } from '../result';
import './class-badge';
import './role-badge';

/** What `character-add` takes (modules/identity). `role` only when the member picked one. */
export interface CharacterInput {
  name: string;
  class: WowClass;
  spec: string;
  role?: Role;
  isMain: boolean;
}

/** The character being edited: the slice of `character-list` / `member-me` the form needs. */
export interface EditableCharacter {
  id: string;
  name: string;
  class: string;
  spec: string;
  role: string;
  /** True when the role was picked rather than guessed from the spec. */
  rolePicked?: boolean;
  isMain: boolean;
}

/** What `character-update` takes: only the fields that changed. `role: null` guesses again. */
export interface CharacterPatch {
  characterId: string;
  name?: string;
  class?: WowClass;
  spec?: string;
  role?: Role | null;
  isMain?: true;
}

/** The role select's value for "guess it from the spec". */
const GUESS = '';

type FieldElement = HTMLElement & { value: string };
const fieldValue = (event: Event) => (event.currentTarget as FieldElement).value;
const checkedOf = (event: Event) =>
  (event.currentTarget as HTMLElement & { checked: boolean }).checked;

const template = html<VintageCharacterForm>`
  <div class="form" part="form">
    <violet-text-field
      label="Character name"
      name="name"
      required
      :value="${(x) => x.name}"
      ?invalid="${(x) => Boolean(x.nameError)}"
      supporting-text="${(x) => x.nameError || 'As it appears in game, last name included'}"
      @input="${(x, c) => x.setName(fieldValue(c.event))}"
    ></violet-text-field>

    <violet-select
      label="Class"
      name="class"
      placeholder="Choose a class"
      :value="${(x) => x.wowClass}"
      @change="${(x, c) => x.setClass(fieldValue(c.event))}"
    >
      ${repeat(
        () => CLASS_NAMES,
        html<WowClass>`<violet-option value="${(c) => c}">${(c) => titleCase(c)}</violet-option>`,
      )}
    </violet-select>

    <violet-select
      label="Spec"
      name="spec"
      placeholder="${(x) => (x.wowClass ? 'Choose a spec' : 'Choose a class first')}"
      ?disabled="${(x) => !x.wowClass}"
      :value="${(x) => x.spec}"
      @change="${(x, c) => x.setSpec(fieldValue(c.event))}"
    >
      ${repeat(
        (x) => x.specs,
        html<string>`<violet-option value="${(s) => s}">${(s) => titleCase(s)}</violet-option>`,
      )}
    </violet-select>

    <violet-select
      label="Role"
      name="role"
      placeholder="${(x) => x.guessLabel}"
      :value="${(x) => x.rolePick}"
      supporting-text="Pick one when you play another role than the spec says, like a Fury warrior who tanks"
      @change="${(x, c) => x.setRole(fieldValue(c.event))}"
    >
      <violet-option value="">${(x) => x.guessLabel}</violet-option>
      ${repeat(
        () => ROLES,
        html<Role>`<violet-option value="${(r) => r}">${(r) => roleLabel(r)}</violet-option>`,
      )}
    </violet-select>

    <violet-checkbox
      name="isMain"
      :checked="${(x) => x.isMain}"
      ?disabled="${(x) => Boolean(x.character?.isMain)}"
      @change="${(x, c) => x.setMain(checkedOf(c.event))}"
    >
      This is my main
    </violet-checkbox>

    ${when(
      (x) => Boolean(x.role),
      html<VintageCharacterForm>`
        <p class="preview" part="preview">
          <vintage-class-badge wow-class="${(x) => x.wowClass}" spec="${(x) => x.spec}"></vintage-class-badge>
          <vintage-role-badge raid-role="${(x) => x.role}"></vintage-role-badge>
        </p>
      `,
    )}

    <div class="actions">
      ${when(
        (x) => !x.character,
        html<VintageCharacterForm>`<violet-button
          appearance="primary"
          ?disabled="${(x) => !x.addCharacterCanExecute}"
          @click="${(x) => x.addCharacter()}"
        >
          ${(x) => (x.busy ? 'Adding…' : x.submitLabel)}
        </violet-button>`,
      )}
      ${when(
        (x) => x.character,
        html<VintageCharacterForm>`<violet-button
            appearance="primary"
            ?disabled="${(x) => !x.saveCharacterCanExecute}"
            @click="${(x) => x.saveCharacter()}"
          >
            ${(x) => (x.busy ? 'Saving…' : 'Save changes')}
          </violet-button>
          <violet-button ?disabled="${(x) => x.busy}" @click="${(x) => x.cancelEdit()}">Cancel</violet-button>`,
      )}
    </div>

    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">
      ${(x) => x.statusText}
    </p>
  </div>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .form {
    display: grid;
    gap: var(--space-sm);
    max-inline-size: 28rem;
  }

  violet-text-field,
  violet-select,
  violet-checkbox,
  violet-button {
    font-family: var(--font-family-sans);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .preview {
    display: flex;
    gap: var(--space-xs);
    margin: 0;
  }

  .status {
    margin: 0;
    min-block-size: var(--font-leading-relaxed);
    font-size: var(--font-size-sm);
  }

  .status.error {
    color: var(--color-feedback-danger);
  }

  .status.success {
    color: var(--color-feedback-success);
  }
`;

/**
 * Registers one of the member's characters, or edits one. Submitting runs the
 * `vintage.character-add` component command (or `vintage.character-update` while editing),
 * which calls the server's `character-add` / `character-update` through the command client;
 * the server re-validates and decides main vs alt. The Role field guesses from the spec unless
 * the member picks one (a Fury warrior who tanks).
 *
 * @tagname vintage-character-form
 * @summary Add-or-edit-a-character form (name, class, spec, role, main).
 * @fires character-added - The server accepted the character; `detail` is the stored character.
 * @fires character-saved - An edit was saved; `detail` is the stored character.
 * @fires edit-cancelled - The member cancelled an edit.
 * @csspart form - The field grid.
 * @csspart preview - The class and role badges for the chosen spec.
 * @csspart status - The result line (`role="status"`).
 */
export class VintageCharacterForm extends FASTElement {
  /** Text of the submit button. */
  @attr({ attribute: 'submit-label' }) submitLabel = 'Add character';

  /** The character being edited; null (the default) adds a new one. */
  @observable character: EditableCharacter | null = null;
  @observable name = '';
  @observable wowClass: WowClass | '' = '';
  @observable spec = '';
  /** A picked role, or '' to guess it from the spec. */
  @observable rolePick: Role | '' = GUESS;
  @observable isMain = false;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  /** Set once the name field has been touched, so an empty form isn't shown as invalid. */
  @observable nameTouched = false;

  /** Editing starts from the character as saved, its role pick included. */
  characterChanged(_old: EditableCharacter | null, next: EditableCharacter | null): void {
    this.nameTouched = false;
    if (!next) {
      this.reset();
      return;
    }
    this.name = next.name;
    this.wowClass = isWowClass(next.class) ? next.class : '';
    this.spec = next.spec;
    this.rolePick = next.rolePicked && isRole(next.role) ? next.role : GUESS;
    this.isMain = next.isMain;
    this.statusKind = 'idle';
    this.statusText = '';
  }

  get specs(): string[] {
    return this.wowClass ? Object.keys(CLASSES[this.wowClass]) : [];
  }

  /** The role the spec gives, or '' before a class and spec are chosen. */
  @volatile
  get guessedRole(): Role | '' {
    return (this.wowClass && roleFor(this.wowClass, this.spec)) || '';
  }

  /** "Guess from spec (Tank)": the first Role choice, naming what the guess is now. */
  @volatile
  get guessLabel(): string {
    const guessed = this.guessedRole;
    return guessed ? `Guess from spec (${roleLabel(guessed)})` : 'Guess from spec';
  }

  /** The role the character plays: the pick, or the spec's. '' until a spec is chosen. */
  @volatile
  get role(): string {
    return this.guessedRole ? this.rolePick || this.guessedRole : '';
  }

  @volatile
  get nameError(): string {
    if (!this.nameTouched) return '';
    const parsed = characterNameSchema.safeParse(this.name);
    return parsed.success
      ? ''
      : 'A first name of 2–12 letters, then an optional last name (letters only)';
  }

  /** The command input, or null while the form is incomplete. */
  get input(): CharacterInput | null {
    const name = characterNameSchema.safeParse(this.name);
    if (!name.success || !this.wowClass || !this.role) return null;
    return {
      name: name.data,
      class: this.wowClass,
      spec: this.spec,
      ...(this.rolePick ? { role: this.rolePick } : {}),
      isMain: this.isMain,
    };
  }

  /**
   * What changed while editing, as `character-update` takes it; null when nothing did or the
   * form is incomplete. A new class always sends its spec; going back to guessing sends null.
   */
  get patch(): CharacterPatch | null {
    const c = this.character;
    const input = this.input;
    if (!c || !input) return null;
    const patch: CharacterPatch = { characterId: c.id };
    if (normalizeCharacterName(input.name) !== c.name) patch.name = input.name;
    if (input.class !== c.class) patch.class = input.class;
    if (input.class !== c.class || input.spec !== c.spec) patch.spec = input.spec;
    // A new class starts the role over on the server, so a role still picked is sent again.
    const resend = !c.rolePicked || this.rolePick !== c.role || patch.class !== undefined;
    if (this.rolePick && resend) patch.role = this.rolePick;
    if (!this.rolePick && c.rolePicked) patch.role = null;
    if (input.isMain && !c.isMain) patch.isMain = true;
    return Object.keys(patch).length > 1 ? patch : null;
  }

  /** Reactive availability for `vintage.character-add` (read by FAST-AF's CommandBehavior). */
  @volatile
  get addCharacterCanExecute(): boolean {
    return !this.busy && !this.character && this.input !== null;
  }

  /** Reactive availability for `vintage.character-update`: editing, with something changed. */
  @volatile
  get saveCharacterCanExecute(): boolean {
    return !this.busy && this.patch !== null;
  }

  setName(value: string): void {
    this.name = value;
    this.nameTouched = true;
  }

  setClass(value: string): void {
    this.wowClass = isWowClass(value) ? value : '';
    if (!this.specs.includes(this.spec)) this.spec = '';
  }

  setSpec(value: string): void {
    this.spec = value;
  }

  setRole(value: string): void {
    this.rolePick = isRole(value) ? value : GUESS;
  }

  setMain(value: boolean): void {
    this.isMain = value;
  }

  @command('vintage.character-add', {
    label: 'Add character',
    description: 'Register one of your characters (main or alt).',
    category: 'Characters',
  })
  async addCharacter(): Promise<ElementResult<unknown>> {
    if (this.busy) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Already adding a character' });
    }
    if (this.character) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Save or cancel the edit first' });
    }
    const input = this.input;
    if (!input) {
      this.nameTouched = true;
      return failure({
        code: 'INVALID_PARAMETERS',
        message: 'Fill in a name, class, and spec first',
      });
    }
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run('character-add', input));
      this.report(result, input.name);
      return result;
    } finally {
      this.busy = false;
    }
  }

  @command('vintage.character-update', {
    label: 'Save character',
    description: 'Save the changes to the character being edited (name, class, spec, role, main).',
    category: 'Characters',
  })
  async saveCharacter(): Promise<ElementResult<unknown>> {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Already saving' });
    const editing = this.character;
    if (!editing) return failure({ code: 'COMMAND_DISABLED', message: 'Not editing a character' });
    const patch = this.patch;
    if (!patch) {
      this.nameTouched = true;
      return failure({
        code: 'INVALID_PARAMETERS',
        message: this.input ? 'Nothing has changed' : 'Fill in a name, class, and spec first',
      });
    }
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run('character-update', patch));
      if (!result.success) {
        this.statusKind = 'error';
        this.statusText = describeError(result);
        return result;
      }
      this.statusKind = 'success';
      this.statusText = `Saved ${normalizeCharacterName(this.name)}`;
      this.$emit('character-saved', result.data);
      this.character = null;
      return result;
    } finally {
      this.busy = false;
    }
  }

  /** Leave the edit without saving; the form goes back to adding. */
  cancelEdit(): void {
    this.character = null;
    this.$emit('edit-cancelled');
  }

  private reset(): void {
    this.name = '';
    this.wowClass = '';
    this.spec = '';
    this.rolePick = GUESS;
    this.isMain = false;
  }

  private report(result: ElementResult<unknown>, name: string): void {
    if (!result.success) {
      this.statusKind = 'error';
      this.statusText = describeError(result);
      return;
    }
    this.statusKind = 'success';
    this.statusText = String(result.metadata?.reasoning ?? `${name} added`);
    this.$emit('character-added', result.data);
    this.name = '';
    this.nameTouched = false;
  }
}

if (!customElements.get('vintage-character-form')) {
  await VintageCharacterForm.define({ name: 'vintage-character-form', template, styles });
}
