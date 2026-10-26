import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import {
  CLASS_NAMES,
  CLASSES,
  characterNameSchema,
  roleFor,
  type WowClass,
} from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { isWowClass, titleCase } from '../labels';
import '../primitives';
import { describeError, type ElementResult, toElementResult } from '../result';
import './class-badge';
import './role-badge';

/** What `character-add` takes (modules/identity). */
export interface CharacterInput {
  name: string;
  class: WowClass;
  spec: string;
  isMain: boolean;
}

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
      supporting-text="${(x) => x.nameError || 'As it appears in game'}"
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

    <violet-checkbox
      name="isMain"
      :checked="${(x) => x.isMain}"
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
      <violet-button
        appearance="primary"
        ?disabled="${(x) => !x.addCharacterCanExecute}"
        @click="${(x) => x.addCharacter()}"
      >
        ${(x) => (x.busy ? 'Adding…' : x.submitLabel)}
      </violet-button>
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
 * Registers one of the member's characters. Submitting runs the `vintage.character-add`
 * component command, which calls the server's `character-add` through the command client;
 * the server re-validates and decides main vs alt.
 *
 * @tagname vintage-character-form
 * @summary Add-a-character form (name, class, spec, main) backed by `character-add`.
 * @fires character-added - The server accepted the character; `detail` is the stored character.
 * @csspart form - The field grid.
 * @csspart preview - The class and role badges for the chosen spec.
 * @csspart status - The result line (`role="status"`).
 */
export class VintageCharacterForm extends FASTElement {
  /** Text of the submit button. */
  @attr({ attribute: 'submit-label' }) submitLabel = 'Add character';

  @observable name = '';
  @observable wowClass: WowClass | '' = '';
  @observable spec = '';
  @observable isMain = false;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  /** Set once the name field has been touched, so an empty form isn't shown as invalid. */
  @observable nameTouched = false;

  get specs(): string[] {
    return this.wowClass ? Object.keys(CLASSES[this.wowClass]) : [];
  }

  get role(): string {
    return (this.wowClass && roleFor(this.wowClass, this.spec)) || '';
  }

  get nameError(): string {
    if (!this.nameTouched) return '';
    const parsed = characterNameSchema.safeParse(this.name);
    return parsed.success ? '' : 'Use 2–12 letters, no spaces or numbers';
  }

  /** The command input, or null while the form is incomplete. */
  get input(): CharacterInput | null {
    const name = characterNameSchema.safeParse(this.name);
    if (!name.success || !this.wowClass || !this.role) return null;
    return { name: name.data, class: this.wowClass, spec: this.spec, isMain: this.isMain };
  }

  /** Reactive availability for `vintage.character-add` (read by FAST-AF's CommandBehavior). */
  get addCharacterCanExecute(): boolean {
    return !this.busy && this.input !== null;
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
