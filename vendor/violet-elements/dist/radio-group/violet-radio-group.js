var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable, when } from "@lushly-dev/fast-element";
import "../radio/violet-radio";
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
        margin-block-end: var(--_space-stack-2xs);
    }

    .group {
        display: flex;
        flex-wrap: wrap;
        gap: var(--_space-stack-sm) calc(var(--_space-inline-md) * 2);
        align-items: start;
        min-inline-size: 0;
    }

    :host([orientation="vertical"]) .group {
        flex-direction: column;
        align-items: stretch;
        gap: var(--_space-stack-xs);
    }

    .supporting {
        margin: 0;
        color: var(--_text-muted);
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
        margin-block-start: var(--_space-stack-xs);
    }

    .error {
        margin: 0;
        color: var(--color-state-danger-foreground, #b42318);
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
        margin-block-start: var(--_space-stack-xs);
    }
`;
const template = html `
    <div class="field" part="field">
        ${when(x => Boolean(x.label), html `
                <div class="label" part="label">${x => x.label}</div>
            `)}
        <div class="group" part="group">
            <slot @slotchange="${x => x.handleSlotChange()}"></slot>
        </div>
        ${when(x => Boolean(x.supportingText), html `
                <p class="supporting" part="supporting-text">${x => x.supportingText}</p>
            `)}
        ${when(x => Boolean(x.validationMessageText), html `
                <p class="error" part="error-message">${x => x.validationMessageText}</p>
            `)}
    </div>
`;
/**
 * Violet reusable radio group primitive.
 *
 * @summary Token-driven form-associated radio group with roving focus and optional label/supporting text.
 * @fires change - Emitted when the selected value changes.
 * @slot - Radio options rendered inside the group.
 * @csspart field - Field wrapper.
 * @csspart label - Group label text element.
 * @csspart group - Layout wrapper for slotted radios.
 * @csspart supporting-text - Supporting text element.
 */
export class VioletRadioGroup extends FASTElement {
    static { this.formAssociated = true; }
    #internals;
    #defaultValue;
    #synchronizing;
    constructor() {
        super();
        this.handleRadioChange = (event) => {
            const radio = this.#radioFromEvent(event);
            if (!radio) {
                return;
            }
            if (this.#synchronizing) {
                return;
            }
            this.#selectRadio(radio, { emitChange: true, focus: false });
        };
        this.handleKeydown = (event) => {
            const currentRadio = this.#radioFromEvent(event);
            if (!currentRadio || this.disabled) {
                return;
            }
            const enabledRadios = this.#enabledRadios();
            if (!enabledRadios.length) {
                return;
            }
            const currentIndex = enabledRadios.indexOf(currentRadio);
            switch (event.key) {
                case "ArrowDown":
                case "ArrowRight": {
                    event.preventDefault();
                    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % enabledRadios.length : 0;
                    this.#selectRadio(enabledRadios[nextIndex], { emitChange: true, focus: true });
                    break;
                }
                case "ArrowUp":
                case "ArrowLeft": {
                    event.preventDefault();
                    const nextIndex = currentIndex >= 0 ? (currentIndex - 1 + enabledRadios.length) % enabledRadios.length : enabledRadios.length - 1;
                    this.#selectRadio(enabledRadios[nextIndex], { emitChange: true, focus: true });
                    break;
                }
                case "Home": {
                    event.preventDefault();
                    this.#selectRadio(enabledRadios[0], { emitChange: true, focus: true });
                    break;
                }
                case "End": {
                    event.preventDefault();
                    this.#selectRadio(enabledRadios[enabledRadios.length - 1], { emitChange: true, focus: true });
                    break;
                }
                case " ":
                case "Enter": {
                    event.preventDefault();
                    this.#selectRadio(currentRadio, { emitChange: true, focus: true });
                    break;
                }
                default:
                    break;
            }
        };
        this.#internals = this.attachInternals();
        this.#internals.role = "radiogroup";
        this.#defaultValue = "";
        this.#synchronizing = false;
        this.radios = [];
        this.validationMessageText = "";
        this.label = "";
        this.supportingText = "";
        this.errorText = "";
        this.value = "";
        this.name = "";
        this.disabled = false;
        this.invalid = false;
        this.required = false;
        this.orientation = "vertical";
    }
    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("change", this.handleRadioChange);
        this.addEventListener("keydown", this.handleKeydown);
        this.handleSlotChange();
        this.#defaultValue = this.value;
        this.#syncAccessibilityState();
        this.#syncFormState();
    }
    disconnectedCallback() {
        this.removeEventListener("change", this.handleRadioChange);
        this.removeEventListener("keydown", this.handleKeydown);
        super.disconnectedCallback();
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
    formResetCallback() {
        this.value = this.#defaultValue;
        this.#synchronizeRadios();
    }
    handleSlotChange() {
        this.radios = this.#ownedRadios();
        this.#synchronizeRadios();
    }
    radiosChanged() {
        this.#synchronizeRadios();
    }
    labelChanged() {
        this.#syncAccessibilityState();
    }
    supportingTextChanged() {
        this.#syncAccessibilityState();
    }
    errorTextChanged() {
        this.#syncFormState();
    }
    valueChanged() {
        if (this.#synchronizing) {
            return;
        }
        this.#synchronizeRadios();
    }
    nameChanged() {
        this.#synchronizeRadios();
    }
    disabledChanged() {
        this.#synchronizeRadios();
    }
    invalidChanged() {
        this.#syncAccessibilityState();
        this.#syncFormState();
    }
    requiredChanged() {
        this.#syncAccessibilityState();
        this.#syncFormState();
    }
    orientationChanged() {
        this.#syncAccessibilityState();
    }
    #ownedRadios() {
        return Array.from(this.querySelectorAll("violet-radio")).filter((radio) => radio.closest("violet-radio-group") === this);
    }
    #selectedRadio() {
        if (this.value) {
            const matchingValue = this.radios.find(radio => radio.value === this.value);
            if (matchingValue) {
                return matchingValue;
            }
        }
        return this.radios.find(radio => radio.checked) ?? null;
    }
    #enabledRadios() {
        return this.radios.filter(radio => !radio.effectiveDisabled);
    }
    #synchronizeRadios(options = {}) {
        if (!this.$fastController.isConnected) {
            return;
        }
        const selectedRadio = this.#selectedRadio();
        const nextValue = selectedRadio?.value ?? "";
        const enabledRadios = this.#enabledRadios();
        const focusTarget = (!options.focusTarget || options.focusTarget.effectiveDisabled ? null : options.focusTarget) ??
            (selectedRadio && !selectedRadio.effectiveDisabled ? selectedRadio : null) ??
            enabledRadios[0] ??
            null;
        this.#synchronizing = true;
        this.radios.forEach(radio => {
            radio.setGroupDisabled(this.disabled);
            if (this.name) {
                radio.name = this.name;
            }
            radio.setCheckedFromGroup(Boolean(selectedRadio) && radio === selectedRadio);
            radio.setManagedTabIndex(focusTarget && radio === focusTarget ? 0 : -1);
        });
        this.value = nextValue;
        this.#synchronizing = false;
        this.#syncAccessibilityState();
        this.#syncFormState();
    }
    #selectRadio(radio, options = {}) {
        if (!this.radios.includes(radio) || radio.effectiveDisabled) {
            return;
        }
        const previousValue = this.value;
        this.value = radio.value;
        this.#synchronizeRadios({ focusTarget: radio });
        if (options.focus) {
            radio.focus();
        }
        if (options.emitChange && this.value !== previousValue) {
            this.$emit("change", { value: this.value });
        }
    }
    #radioFromEvent(event) {
        const composedPath = event.composedPath();
        for (const item of composedPath) {
            if (item instanceof HTMLElement && item.tagName.toLowerCase() === "violet-radio") {
                return item;
            }
        }
        return null;
    }
    #syncAccessibilityState() {
        this.#internals.ariaDisabled = this.disabled ? "true" : "false";
        this.#internals.ariaOrientation = this.orientation;
        this.#internals.ariaRequired = this.required ? "true" : "false";
        const labelElement = this.shadowRoot?.querySelector(".label");
        const supportingElement = this.shadowRoot?.querySelector(".supporting");
        const errorElement = this.shadowRoot?.querySelector(".error");
        if (labelElement instanceof Element && !this.getAttribute("aria-label")) {
            this.#internals.ariaLabelledByElements = [labelElement];
            this.#internals.ariaLabel = null;
        }
        else {
            this.#internals.ariaLabelledByElements = null;
            this.#internals.ariaLabel = this.getAttribute("aria-label") || this.label || null;
        }
        this.#internals.ariaDescribedByElements = supportingElement instanceof Element ? [supportingElement] : null;
        this.#internals.ariaErrorMessageElements = errorElement instanceof Element ? [errorElement] : null;
    }
    #syncFormState() {
        this.#internals.setFormValue(this.disabled || !this.value ? null : this.value);
        if (this.disabled) {
            this.validationMessageText = "";
            this.#internals.setValidity({});
            this.#internals.ariaInvalid = "false";
            return;
        }
        if (this.invalid) {
            this.validationMessageText = this.errorText || "Please select a valid option.";
            this.#internals.setValidity({ customError: true }, this.validationMessageText);
            this.#internals.ariaInvalid = "true";
            this.#syncAccessibilityState();
            return;
        }
        if (this.required && !this.value) {
            this.validationMessageText = this.errorText || "Please select an option.";
            this.#internals.setValidity({ valueMissing: true }, this.validationMessageText);
            this.#internals.ariaInvalid = "true";
            this.#syncAccessibilityState();
            return;
        }
        this.validationMessageText = "";
        this.#internals.setValidity({});
        this.#internals.ariaInvalid = "false";
        this.#syncAccessibilityState();
    }
}
__decorate([
    observable
], VioletRadioGroup.prototype, "radios", void 0);
__decorate([
    observable
], VioletRadioGroup.prototype, "validationMessageText", void 0);
attr(VioletRadioGroup.prototype, "label");
attr({ attribute: "supporting-text" })(VioletRadioGroup.prototype, "supportingText");
attr({ attribute: "error-text" })(VioletRadioGroup.prototype, "errorText");
attr(VioletRadioGroup.prototype, "value");
attr(VioletRadioGroup.prototype, "name");
attr({ mode: "boolean" })(VioletRadioGroup.prototype, "disabled");
attr({ mode: "boolean" })(VioletRadioGroup.prototype, "invalid");
attr({ mode: "boolean" })(VioletRadioGroup.prototype, "required");
attr(VioletRadioGroup.prototype, "orientation");
if (!customElements.get("violet-radio-group")) {
    await FASTElement.define(VioletRadioGroup, {
        name: "violet-radio-group",
        template,
        styles,
        shadowOptions: {
            delegatesFocus: true,
        },
    });
}