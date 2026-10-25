var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable, when } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
import { registerSystemClockIcon } from "../icon/generated/icons/system-clock";
import { parseTimeValue } from "../date-time/violet-date-utils";
import { violetFieldTokenDefaults } from "../theme/violet-token-defaults";
let violetTimePickerCount = 0;
registerSystemClockIcon();
const styles = css `
    ${violetFieldTokenDefaults}

    :host {
        display: grid;
    }

    :host([size="compact"]) {
        --violet-target-size: var(--_target-size-compact);
        --violet-control-label-size: var(--_type-label-size-compact);
        --violet-control-body-size: var(--_type-body-size-compact);
        --violet-control-caption-size: var(--_type-caption-size-compact);
    }

    :host([size="natural"]) {
        --violet-target-size: var(--_target-size-natural);
        --violet-control-label-size: var(--_type-label-size);
        --violet-control-body-size: var(--_type-body-size);
        --violet-control-caption-size: var(--_type-caption-size);
    }

    :host([size="comfortable"]) {
        --violet-target-size: var(--_target-size-comfortable);
        --violet-control-label-size: var(--_type-label-size);
        --violet-control-body-size: var(--_type-body-size);
        --violet-control-caption-size: var(--_type-caption-size);
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
        gap: var(--_space-inline-sm);
        inline-size: 100%;
        block-size: var(--_target-size);
        min-block-size: var(--_target-size);
        padding-inline: max(var(--_space-inline-md), calc(var(--_target-size) * 0.375));
        border: 1px solid var(--_border-subtle);
        border-radius: var(--_radius-md);
        background: var(--_surface-page);
        color: var(--color-text-primary, #18181b);
        box-shadow: var(--_shadow-control);
        transition:
            border-color var(--_duration-fast) var(--_easing-standard),
            box-shadow var(--_duration-base) var(--_easing-standard),
            transform var(--_duration-fast) var(--_easing-standard);
    }

    .control-frame:hover {
        border-color: var(--color-field-border-hover, rgba(28, 26, 13, 0.35));
    }

    .control-frame:focus-within {
        border-color: color-mix(in srgb, var(--_focus-ring) 48%, var(--_border-subtle));
        box-shadow: 0 0 0 2px var(--_focus-ring);
        transform: translateY(calc(var(--_space-inline-sm) / -4));
    }

    :host([disabled]) .control-frame {
        opacity: 0.65;
        cursor: not-allowed;
    }

    :host([invalid]) .control-frame {
        border-color: var(--_danger-border);
    }

    .input {
        appearance: none;
        -webkit-appearance: none;
        flex: 1 1 auto;
        min-inline-size: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--_control-body-size);
        line-height: 1;
        outline: none;
    }

    .input::-webkit-calendar-picker-indicator,
    .input::-webkit-clear-button,
    .input::-webkit-inner-spin-button {
        display: none;
        opacity: 0;
        pointer-events: none;
    }

    .input::-webkit-date-and-time-value {
        min-block-size: auto;
        padding: 0;
        text-align: start;
    }

    .icon {
        display: inline-grid;
        place-items: center;
        color: var(--_text-muted);
        pointer-events: none;
    }

    .icon violet-icon {
        --violet-icon-size: max(0.9rem, calc(var(--_target-size) * 0.33));
    }

    .supporting,
    .error {
        margin: 0;
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
    }

    .supporting {
        color: var(--_text-muted);
        margin-block-start: var(--_space-stack-2xs);
    }

    .error {
        color: var(--color-state-danger-foreground, #b42318);
        margin-block-start: var(--_space-stack-2xs);
    }
`;
const template = html `
    <div class="field" part="field">
        ${when(x => Boolean(x.label), html `<label class="label" part="label" for="${x => x.inputId}">${x => x.label}</label>`)}
        <div class="control-frame" part="control-frame">
            <input
                id="${x => x.inputId}"
                class="input"
                part="input"
                type="time"
                name="${x => x.name}"
                :value="${x => x.value}"
                min="${x => x.min}"
                max="${x => x.max}"
                step="${x => x.stepValue}"
                ?disabled="${x => x.disabled}"
                ?required="${x => x.required}"
                aria-describedby="${x => x.describedBy || null}"
                aria-invalid="${x => x.invalid ? "true" : "false"}"
                @input="${(x, c) => x.handleInput(c.event)}"
                @change="${(x, c) => x.handleCommit(c.event)}"
            />
            <span class="icon" aria-hidden="true">
                <violet-icon icon="system/clock" decorative></violet-icon>
            </span>
        </div>
        ${when(x => Boolean(x.supportingText), html `<p class="supporting" part="supporting-text" id="${x => x.supportingId}">${x => x.supportingText}</p>`)}
        ${when(x => Boolean(x.displayErrorText), html `<p class="error" part="error-message" id="${x => x.errorId}">${x => x.displayErrorText}</p>`)}
    </div>
`;
/**
 * Native-backed time field with Violet shell styling.
 *
 * @summary Time picker wrapper around the native time input for form and keyboard parity.
 * @fires input - Emitted when the time value changes while editing.
 * @fires change - Emitted when the time value is committed.
 */
export class VioletTimePicker extends FASTElement {
    static { this.formAssociated = true; }
    #internals;
    #defaultValue = "";
    constructor() {
        super();
        this.#internals = this.attachInternals();
        this.validationMessageText = "";
        this.label = "";
        this.supportingText = "";
        this.errorText = "";
        this.value = "";
        this.name = "";
        this.min = "";
        this.max = "";
        this.step = "60";
        this.required = false;
        this.disabled = false;
        this.invalid = false;
        this.size = "natural";
        violetTimePickerCount += 1;
        this.inputId = `violet-time-picker-input-${violetTimePickerCount}`;
        this.supportingId = `violet-time-picker-supporting-${violetTimePickerCount}`;
        this.errorId = `violet-time-picker-error-${violetTimePickerCount}`;
    }
    connectedCallback() {
        super.connectedCallback();
        this.#defaultValue = this.value;
        this.#syncFormState();
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
    get describedBy() {
        const ids = [
            this.supportingText ? this.supportingId : "",
            this.displayErrorText ? this.errorId : "",
        ].filter(Boolean);
        return ids.join(" ");
    }
    get displayErrorText() {
        return this.validationMessageText || this.errorText;
    }
    get stepValue() {
        return this.step || "60";
    }
    valueChanged() {
        this.#syncInputElement();
        this.#syncFormState();
    }
    invalidChanged() {
        this.#syncFormState();
    }
    handleInput(event) {
        const input = event.currentTarget;
        this.value = input?.value ?? "";
        this.#syncFormState();
        this.$emit("input", { value: this.value });
    }
    handleCommit(event) {
        const input = event.currentTarget;
        this.value = input?.value ?? "";
        this.#syncFormState();
        this.$emit("change", { value: this.value });
    }
    formResetCallback() {
        this.value = this.#defaultValue;
        this.#syncFormState();
    }
    checkValidity() {
        return this.#internals.checkValidity();
    }
    reportValidity() {
        return this.#internals.reportValidity();
    }
    get inputElement() {
        return this.shadowRoot?.querySelector('input[type="time"]');
    }
    #syncInputElement() {
        const input = this.inputElement;
        if (input && input.value !== this.value) {
            input.value = this.value;
        }
    }
    #syncFormState() {
        const input = this.inputElement;
        const valueMissing = this.required && !this.value;
        const badInput = this.value ? !parseTimeValue(this.value) : false;
        const customError = this.invalid ? this.errorText || "Enter a valid time." : "";
        this.validationMessageText =
            customError || (valueMissing ? "Please choose a time." : badInput ? "Enter a valid time." : "");
        this.#internals.setFormValue(this.value || null);
        this.#internals.setValidity({
            valueMissing,
            badInput,
            customError: Boolean(customError),
        }, this.validationMessageText, input ?? undefined);
    }
}
__decorate([
    observable
], VioletTimePicker.prototype, "validationMessageText", void 0);
attr(VioletTimePicker.prototype, "label");
attr({ attribute: "supporting-text" })(VioletTimePicker.prototype, "supportingText");
attr({ attribute: "error-text" })(VioletTimePicker.prototype, "errorText");
attr(VioletTimePicker.prototype, "value");
attr(VioletTimePicker.prototype, "name");
attr(VioletTimePicker.prototype, "min");
attr(VioletTimePicker.prototype, "max");
attr(VioletTimePicker.prototype, "step");
attr({ mode: "boolean" })(VioletTimePicker.prototype, "required");
attr({ mode: "boolean" })(VioletTimePicker.prototype, "disabled");
attr({ mode: "boolean" })(VioletTimePicker.prototype, "invalid");
attr(VioletTimePicker.prototype, "size");
if (!customElements.get("violet-time-picker")) {
    await FASTElement.define(VioletTimePicker, {
        name: "violet-time-picker",
        template,
        styles,
    });
}