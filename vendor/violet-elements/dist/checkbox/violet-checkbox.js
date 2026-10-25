var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable } from "@lushly-dev/fast-element";
import { violetFieldTokenDefaults } from "../theme/violet-token-defaults";
const styles = css `
    ${violetFieldTokenDefaults}

    :host {
        display: inline-grid;

        --_selection-background: var(--color-control-selected-background, #DFE8E0);
        --_selection-text: var(--color-control-selected-foreground, #244635);
        --_selection-border: var(--color-control-selected-border, rgba(36, 70, 53, 0.22));
        --_surface-card: var(--color-surface-card, #faf9f5);
        --_border-strong: var(--color-border-strong, rgba(28, 26, 13, 0.35));
        --_danger-border: var(--color-state-danger-border, rgba(220, 38, 38, 0.34));
        --_radius-sm: var(--radius-sm, 2px);
        --_size-font-md: var(--size-font-md, 14px);
        --_control-size: max(var(--_size-font-md), calc(var(--_target-size) * 0.5));
        --_type-body-line: var(--type-body-md-line, 20px);
        --_type-caption-line: var(--type-caption-xs-line, 14px);
    }

    :host([inline]) {
        --_target-size: var(--violet-checkbox-inline-target-size, var(--_target-size-compact));
        --_space-inline-sm: var(--violet-checkbox-inline-gap, 4px);
    }

    .root {
        display: inline-grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: calc(var(--_space-inline-sm) * 2);
        align-items: start;
        min-block-size: var(--_target-size);
        cursor: pointer;
    }

    :host([inline]) .root {
        grid-template-columns: auto;
        gap: 0;
        align-items: center;
        min-block-size: auto;
    }

    .input {
        position: absolute;
        inset: 0;
        inline-size: 100%;
        block-size: 100%;
        margin: 0;
        padding: 0;
        opacity: 0;
        overflow: hidden;
        border: 0;
        clip: rect(0 0 0 0);
        white-space: nowrap;
    }

    .control-shell {
        position: relative;
        display: inline-grid;
        min-block-size: var(--_target-size);
        align-items: center;
    }

    :host([inline]) .control-shell {
        min-block-size: auto;
        line-height: 0;
    }

    .box {
        position: relative;
        display: inline-grid;
        place-items: center;
        inline-size: var(--_control-size);
        block-size: var(--_control-size);
        border: 1px solid var(--_border-strong);
        border-radius: var(--_radius-sm);
        background: var(--_surface-card);
        box-shadow: var(--_shadow-control);
        transition:
            background-color var(--_duration-fast) var(--_easing-standard),
            border-color var(--_duration-fast) var(--_easing-standard),
            box-shadow var(--_duration-base) var(--_easing-standard);
    }

    .checkmark,
    .mixed-mark {
        display: block;
        grid-area: 1 / 1;
        justify-self: center;
        align-self: center;
        background: var(--_selection-text);
        opacity: 0;
        transition:
            opacity var(--_duration-fast) var(--_easing-standard),
            transform var(--_duration-fast) var(--_easing-standard);
    }

    .checkmark {
        inline-size: calc(var(--_control-size) * 0.72);
        block-size: calc(var(--_control-size) * 0.72);
        clip-path: polygon(14% 44%, 0 59%, 37% 100%, 100% 16%, 84% 0, 35% 62%);
        transform: scale(0.7);
    }

    .mixed-mark {
        inline-size: calc(var(--_control-size) * 0.56);
        block-size: 2px;
        border-radius: 999px;
        transform: scaleX(0.7);
    }

    .input:checked + .box {
        background: var(--_selection-background);
        border-color: var(--_selection-border);
    }

    .input:checked + .box .checkmark {
        opacity: 1;
        transform: scale(1);
    }

    .input:indeterminate + .box {
        background: var(--_selection-background);
        border-color: var(--_selection-border);
    }

    .input:indeterminate + .box .mixed-mark {
        opacity: 1;
        transform: scaleX(1);
    }

    .input:focus-visible + .box {
        box-shadow:
            var(--_shadow-control),
            0 0 0 2px var(--_focus-ring);
    }

    :host([invalid]) .box {
        border-color: var(--_danger-border);
    }

    :host([disabled]) .root {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .content {
        display: grid;
        gap: var(--_space-stack-xs);
        min-block-size: var(--_target-size);
        align-content: center;
        min-inline-size: 0;
    }

    .content[hidden] {
        display: none;
    }

    :host([inline]) .content {
        min-block-size: auto;
        align-content: center;
    }

    .label {
        color: var(--color-text-primary, #18181b);
        font-size: var(--_control-body-size);
        line-height: var(--_type-body-line);
    }

    .supporting {
        color: var(--_text-secondary);
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
    }
`;
const template = html `
    <label class="root" part="root">
        <span class="control-shell">
            <input
                class="input"
                part="input"
                type="checkbox"
                :checked="${x => x.checked}"
                name="${x => x.name}"
                value="${x => x.value}"
                ?disabled="${x => x.disabled}"
                ?required="${x => x.required}"
                aria-label="${x => x.controlAriaLabel}"
                aria-invalid="${x => x.invalid ? "true" : "false"}"
                @change="${(x, c) => x.handleChange(c.event)}"
            />
            <span class="box" part="control" aria-hidden="true">
                <span class="checkmark" part="mark checkmark"></span>
                <span class="mixed-mark" part="mark mixed-mark"></span>
            </span>
        </span>
        <span class="content" ?hidden="${x => x.inline && !x.hasLabel && !x.hasSupporting}">
            <span class="label" part="label" ?hidden="${x => x.inline && !x.hasLabel}">
                <slot @slotchange="${x => x.handleDefaultSlotChange()}"></slot>
            </span>
            <span class="supporting" part="supporting-text" ?hidden="${x => !x.hasSupporting}">
                <slot name="supporting" @slotchange="${x => x.handleSupportingSlotChange()}"></slot>
            </span>
        </span>
    </label>
`;
/**
 * Violet reusable checkbox primitive.
 *
 * @summary Token-driven checkbox with label, inline selection mode, and indeterminate support.
 * @fires change - Emitted when the checked state changes.
 * @slot - Checkbox label content.
 * @slot supporting - Optional supporting copy rendered under the label.
 * @csspart root - Root label wrapper.
 * @csspart input - Native checkbox input.
 * @csspart control - Visible checkbox control box.
 * @csspart mark - Checkmark glyph inside the control.
 * @csspart label - Primary label text wrapper.
 * @csspart supporting-text - Optional supporting text wrapper.
 */
export class VioletCheckbox extends FASTElement {
    static { this.formAssociated = true; }
    #internals;
    #defaultChecked;
    #defaultIndeterminate;
    constructor() {
        super();
        this.#internals = this.attachInternals();
        this.hasSupporting = false;
        this.hasLabel = false;
        this.checked = false;
        this.indeterminate = false;
        this.disabled = false;
        this.inline = false;
        this.invalid = false;
        this.name = "";
        this.value = "on";
        this.required = false;
        this.#defaultChecked = false;
        this.#defaultIndeterminate = false;
    }
    connectedCallback() {
        super.connectedCallback();
        this.#defaultChecked = this.hasAttribute("checked") ? this.getAttribute("checked") !== "false" : this.checked;
        this.#defaultIndeterminate = this.hasAttribute("indeterminate")
            ? this.getAttribute("indeterminate") !== "false"
            : this.indeterminate;
        this.#syncLabelState();
        this.#syncSupportingState();
        this.#syncControlState();
        this.#syncFormState();
    }
    handleChange(event) {
        const control = event.currentTarget;
        this.checked = control?.checked ?? false;
        this.indeterminate = false;
        this.$emit("change", { checked: this.checked });
    }
    handleDefaultSlotChange() {
        this.#syncLabelState();
    }
    handleSupportingSlotChange() {
        this.#syncSupportingState();
    }
    formResetCallback() {
        this.checked = this.#defaultChecked;
        this.indeterminate = this.#defaultIndeterminate;
    }
    get controlAriaLabel() {
        const explicitLabel = this.getAttribute("aria-label");
        if (explicitLabel) {
            return explicitLabel;
        }
        const visibleLabel = this.#defaultSlotText();
        return visibleLabel || null;
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
    checkedChanged() {
        this.#syncControlState();
        this.#syncFormState();
    }
    indeterminateChanged() {
        this.#syncControlState();
        this.#syncFormState();
    }
    disabledChanged() {
        this.#syncControlState();
        this.#syncFormState();
    }
    invalidChanged() {
        this.#syncControlState();
        this.#syncFormState();
    }
    requiredChanged() {
        this.#syncControlState();
        this.#syncFormState();
    }
    valueChanged() {
        this.#syncControlState();
        this.#syncFormState();
    }
    nameChanged() {
        this.#syncControlState();
    }
    #syncLabelState() {
        this.hasLabel = this.#defaultSlotText().length > 0;
    }
    #syncSupportingState() {
        const slot = this.shadowRoot?.querySelector('slot[name="supporting"]');
        this.hasSupporting = (slot?.assignedNodes({ flatten: true }) ?? []).some(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                return Boolean(node.textContent?.trim());
            }
            return true;
        });
    }
    #defaultSlotText() {
        return Array.from(this.childNodes)
            .filter(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return true;
            }
            return !node.hasAttribute("slot");
        })
            .map(node => node.textContent ?? "")
            .join(" ")
            .trim();
    }
    #syncControlState() {
        if (!this.$fastController.isConnected) {
            return;
        }
        const control = this.shadowRoot?.querySelector('input[type="checkbox"]');
        if (!control) {
            return;
        }
        control.checked = this.checked;
        control.indeterminate = this.indeterminate;
        control.disabled = this.disabled;
        control.required = this.required;
        control.name = this.name;
        control.value = this.value;
        control.setAttribute("aria-invalid", this.invalid ? "true" : "false");
        const ariaLabel = this.controlAriaLabel;
        if (ariaLabel) {
            control.setAttribute("aria-label", ariaLabel);
        }
        else {
            control.removeAttribute("aria-label");
        }
    }
    #syncFormState() {
        if (!this.$fastController.isConnected) {
            return;
        }
        const control = this.shadowRoot?.querySelector('input[type="checkbox"]');
        this.#internals.ariaInvalid = this.invalid ? "true" : "false";
        this.#internals.setFormValue(!this.disabled && this.checked ? this.value : null);
        if (this.disabled) {
            this.#internals.setValidity({});
            return;
        }
        if (this.invalid) {
            this.#internals.setValidity({ customError: true }, "Please correct this field.", control ?? undefined);
            return;
        }
        if (this.required && !this.checked) {
            this.#internals.setValidity({ valueMissing: true }, "Please select this option.", control ?? undefined);
            return;
        }
        this.#internals.setValidity({});
    }
}
__decorate([
    observable
], VioletCheckbox.prototype, "hasSupporting", void 0);
__decorate([
    observable
], VioletCheckbox.prototype, "hasLabel", void 0);
attr({ mode: "boolean" })(VioletCheckbox.prototype, "checked");
attr({ mode: "boolean" })(VioletCheckbox.prototype, "indeterminate");
attr({ mode: "boolean" })(VioletCheckbox.prototype, "disabled");
attr({ mode: "boolean" })(VioletCheckbox.prototype, "inline");
attr({ mode: "boolean" })(VioletCheckbox.prototype, "invalid");
attr(VioletCheckbox.prototype, "name");
attr(VioletCheckbox.prototype, "value");
attr({ mode: "boolean" })(VioletCheckbox.prototype, "required");
if (!customElements.get("violet-checkbox")) {
    await FASTElement.define(VioletCheckbox, {
        name: "violet-checkbox",
        template,
        styles,
        shadowOptions: {
            delegatesFocus: true,
        },
    });
}