import { FASTElement, attr, css, html, when } from "@lushly-dev/fast-element";
import { violetFieldTokenDefaults } from "../theme/violet-token-defaults";
const styles = css `
    ${violetFieldTokenDefaults}

    :host {
        display: grid;
    }

    .field {
        display: grid;
        gap: 0;
    }

    .label {
        color: var(--_text-secondary);
        font-size: var(--_control-label-size);
        font-weight: var(--_type-label-weight);
        line-height: var(--_type-label-line);
        margin-block-end: var(--_space-stack-xs);
    }

    .control-frame {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        inline-size: 100%;
        block-size: var(--_target-size);
        padding-inline: max(var(--_space-inline-md), calc(var(--_target-size) * 0.375));
        padding-block: 0;
        border: 1px solid var(--_border-subtle);
        border-radius: var(--_radius-md);
        background: var(--_surface-page);
        color: var(--color-text-primary, #18181b);
        box-shadow: var(--_shadow-control);
        font-family: inherit;
        transition:
            border-color var(--_duration-fast) var(--_easing-standard),
            box-shadow var(--_duration-base) var(--_easing-standard),
            transform var(--_duration-fast) var(--_easing-standard);
    }

    .control {
        flex: 1 1 auto;
        min-inline-size: 0;
        border: 0;
        background: transparent;
        color: var(--color-text-primary, #18181b);
        box-shadow: none;
        font-family: inherit;
        font-size: var(--_control-body-size);
        line-height: 1;
    }

    .control::placeholder {
        color: var(--_text-muted);
    }

    .control:focus {
        outline: none;
    }

    .control-frame:hover {
        border-color: var(--color-field-border-hover, rgba(28, 26, 13, 0.35));
    }

    .control-frame:focus-within {
        border-color: color-mix(in srgb, var(--_focus-ring) 48%, var(--_border-subtle));
        box-shadow: 0 0 0 2px var(--_focus-ring);
        transform: translateY(calc(var(--_space-inline-sm) / -4));
    }

    :host([readonly]) .control-frame {
        background: var(--_surface-subtle);
    }

    :host([disabled]) .control-frame {
        opacity: 0.65;
        cursor: not-allowed;
    }

    :host([disabled]) .control {
        cursor: not-allowed;
    }

    :host([invalid]) .control-frame {
        border-color: var(--_danger-border);
    }

    slot[name="before"] {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        color: var(--_text-muted);
    }

    ::slotted([slot="before"]) {
        margin-inline-end: var(--_space-inline-sm);
    }

    .supporting {
        color: var(--_text-muted);
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
        margin-block-start: var(--_space-stack-2xs);
    }
`;
const template = html `
    <div class="field" part="field">
        ${when(x => Boolean(x.label), html `
                <label class="label" part="label" for="${x => x.inputId}">${x => x.label}</label>
            `)}
        <div class="control-frame" part="control-frame">
            <slot name="before" part="before"></slot>
            <input
                id="${x => x.inputId}"
                class="control"
                part="control"
                name="${x => x.name}"
                type="${x => x.type}"
                placeholder="${x => x.placeholder}"
                :value="${x => x.value}"
                ?disabled="${x => x.disabled}"
                ?readonly="${x => x.readonly}"
                ?required="${x => x.required}"
                aria-label="${x => x.label || x.getAttribute("aria-label") || ""}"
                aria-invalid="${x => x.invalid ? "true" : "false"}"
                @input="${(x, c) => x.handleInput(c.event)}"
                @change="${(x, c) => x.handleCommit(c.event)}"
            />
        </div>
        ${when(x => Boolean(x.supportingText), html `
                <p class="supporting" part="supporting-text">${x => x.supportingText}</p>
            `)}
    </div>
`;
let violetTextFieldCount = 0;
/**
 * Violet reusable text field primitive.
 *
 * @summary Token-driven single-line text input with built-in label and supporting text.
 * @slot before - Leading inline content such as a search or password icon.
 * @fires input - Emitted when the value changes while typing.
 * @fires change - Emitted when the value is committed.
 * @csspart field - Field wrapper.
 * @csspart label - Label text element.
 * @csspart control-frame - Framed wrapper around the input and leading slot.
 * @csspart before - Leading slot for inline affordances.
 * @csspart control - Native input control.
 * @csspart supporting-text - Supporting text element.
 */
export class VioletTextField extends FASTElement {
    static { this.formAssociated = true; }
    #internals;
    #defaultValue;
    constructor() {
        super();
        this.#internals = this.attachInternals();
        violetTextFieldCount += 1;
        this.inputId = `violet-text-field-${violetTextFieldCount}`;
        this.label = "";
        this.placeholder = "";
        this.value = "";
        this.type = "text";
        this.supportingText = "";
        this.disabled = false;
        this.readonly = false;
        this.invalid = false;
        this.name = "";
        this.required = false;
        this.#defaultValue = "";
    }
    connectedCallback() {
        super.connectedCallback();
        this.#defaultValue = this.getAttribute("value") ?? this.value;
        this.#syncFormState();
    }
    handleInput(event) {
        const control = event.currentTarget;
        this.value = control?.value ?? "";
        this.$emit("input", { value: this.value });
    }
    handleCommit(event) {
        const control = event.currentTarget;
        this.value = control?.value ?? "";
        this.$emit("change", { value: this.value });
    }
    formResetCallback() {
        this.value = this.#defaultValue;
    }
    get form() {
        return this.#internals.form;
    }
    get validity() {
        return this.#internals.validity;
    }
    get validationMessage() {
        return this.#internals.validationMessage;
    }
    get willValidate() {
        return this.#internals.willValidate;
    }
    checkValidity() {
        return this.#internals.checkValidity();
    }
    reportValidity() {
        return this.#internals.reportValidity();
    }
    valueChanged() {
        this.#syncFormState();
    }
    disabledChanged() {
        this.#syncFormState();
    }
    invalidChanged() {
        this.#syncFormState();
    }
    readonlyChanged() {
        this.#syncFormState();
    }
    requiredChanged() {
        this.#syncFormState();
    }
    #syncFormState() {
        if (!this.$fastController.isConnected) {
            return;
        }
        const control = this.shadowRoot?.querySelector("input");
        this.#internals.ariaInvalid = this.invalid ? "true" : "false";
        this.#internals.setFormValue(this.disabled ? null : this.value);
        if (this.disabled || this.readonly) {
            this.#internals.setValidity({});
            return;
        }
        if (this.invalid) {
            this.#internals.setValidity({ customError: true }, "Please correct this field.", control ?? undefined);
            return;
        }
        if (this.required && !this.value.trim()) {
            this.#internals.setValidity({ valueMissing: true }, "Please fill out this field.", control ?? undefined);
            return;
        }
        this.#internals.setValidity({});
    }
}
attr(VioletTextField.prototype, "label");
attr(VioletTextField.prototype, "placeholder");
attr(VioletTextField.prototype, "value");
attr(VioletTextField.prototype, "type");
attr({ attribute: "supporting-text" })(VioletTextField.prototype, "supportingText");
attr({ mode: "boolean" })(VioletTextField.prototype, "disabled");
attr({ mode: "boolean" })(VioletTextField.prototype, "readonly");
attr({ mode: "boolean" })(VioletTextField.prototype, "invalid");
attr(VioletTextField.prototype, "name");
attr({ mode: "boolean" })(VioletTextField.prototype, "required");
if (!customElements.get("violet-text-field")) {
    await FASTElement.define(VioletTextField, {
        name: "violet-text-field",
        template,
        styles,
        shadowOptions: {
            delegatesFocus: true,
        },
    });
}