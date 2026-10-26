var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable, when } from "@lushly-dev/fast-element";
import "../segment/violet-segment";
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
        display: inline-flex;
        align-items: stretch;
        gap: 2px;
        padding: 2px;
        border: 1px solid var(--_border-subtle);
        border-radius: var(--_radius-lg);
        background: var(--_surface-subtle);
        box-shadow: var(--_shadow-control);
        min-inline-size: 0;
    }

    :host([disabled]) .group {
        opacity: 0.7;
    }

    :host([invalid]) .group {
        border-color: var(--_danger-border);
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

    @media (forced-colors: active) {
        .group {
            forced-color-adjust: none;
            border-color: ButtonText;
            background: Canvas;
            color: ButtonText;
            box-shadow: none;
        }
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
 * Violet segmented control.
 *
 * @summary Token-driven single-selection choice group composed from `violet-segment` items.
 * @fires change - Emitted when the selected value changes.
 * @slot - `violet-segment` options rendered inside the group.
 * @csspart field - Field wrapper.
 * @csspart label - Group label text element.
 * @csspart group - Segmented surface wrapper.
 * @csspart supporting-text - Supporting text element.
 */
export class VioletSegmentedControl extends FASTElement {
    static { this.formAssociated = true; }
    #internals;
    #defaultValue;
    #synchronizing;
    constructor() {
        super();
        this.#internals = this.attachInternals();
        this.#internals.role = "radiogroup";
        this.#defaultValue = "";
        this.#synchronizing = false;
        this.segments = [];
        this.validationMessageText = "";
        this.label = "";
        this.supportingText = "";
        this.errorText = "";
        this.value = "";
        this.name = "";
        this.disabled = false;
        this.invalid = false;
        this.required = false;
    }
    connectedCallback() {
        super.connectedCallback();
        if (this.name && this.getAttribute("name") !== this.name) {
            this.setAttribute("name", this.name);
        }
        this.addEventListener("select-request", this.handleSelectRequest);
        this.addEventListener("keydown", this.handleKeydown);
        this.handleSlotChange();
        this.#defaultValue = this.value;
        this.#syncAccessibilityState();
        this.#syncFormState();
    }
    disconnectedCallback() {
        this.removeEventListener("select-request", this.handleSelectRequest);
        this.removeEventListener("keydown", this.handleKeydown);
        super.disconnectedCallback();
    }
    formResetCallback() {
        this.value = this.#defaultValue;
        this.#synchronizeSegments();
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
    handleSlotChange() {
        this.segments = this.#ownedSegments();
        this.#synchronizeSegments();
    }
    valueChanged() {
        if (!this.#synchronizing) {
            this.#synchronizeSegments();
        }
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
    nameChanged() {
        if (this.$fastController.isConnected && this.name && this.getAttribute("name") !== this.name) {
            this.setAttribute("name", this.name);
        }
        this.#syncFormState();
    }
    disabledChanged() {
        this.#synchronizeSegments();
    }
    invalidChanged() {
        this.#syncAccessibilityState();
        this.#syncFormState();
    }
    requiredChanged() {
        this.#syncFormState();
    }
    handleSelectRequest(event) {
        const segment = event.target;
        if (!segment || !this.segments.includes(segment)) {
            return;
        }
        this.value = event.detail?.value ?? segment.value;
        this.#synchronizeSegments();
        this.$emit("change");
    }
    handleKeydown(event) {
        const currentSegment = event.composedPath().find(value => value instanceof HTMLElement && value.tagName.toLowerCase() === "violet-segment");
        if (!currentSegment) {
            return;
        }
        const enabledSegments = this.segments.filter(segment => !segment.effectiveDisabled);
        const currentIndex = enabledSegments.indexOf(currentSegment);
        if (currentIndex < 0) {
            return;
        }
        switch (event.key) {
            case "ArrowRight":
            case "ArrowDown": {
                event.preventDefault();
                const next = enabledSegments[(currentIndex + 1) % enabledSegments.length];
                if (next) {
                    this.value = next.value;
                    this.#synchronizeSegments();
                    next.focusButton();
                }
                break;
            }
            case "ArrowLeft":
            case "ArrowUp": {
                event.preventDefault();
                const next = enabledSegments[(currentIndex - 1 + enabledSegments.length) % enabledSegments.length];
                if (next) {
                    this.value = next.value;
                    this.#synchronizeSegments();
                    next.focusButton();
                }
                break;
            }
            case "Home": {
                event.preventDefault();
                const first = enabledSegments[0];
                if (first) {
                    this.value = first.value;
                    this.#synchronizeSegments();
                    first.focusButton();
                }
                break;
            }
            case "End": {
                event.preventDefault();
                const last = enabledSegments.at(-1);
                if (last) {
                    this.value = last.value;
                    this.#synchronizeSegments();
                    last.focusButton();
                }
                break;
            }
        }
    }
    #synchronizeSegments() {
        this.#synchronizing = true;
        const segments = this.#ownedSegments();
        this.segments = segments;
        for (const segment of segments) {
            segment.toggleAttribute("checked", segment.value === this.value && Boolean(this.value));
            segment.setAttribute("aria-disabled", this.disabled ? "true" : "false");
        }
        this.#synchronizing = false;
        this.#syncAccessibilityState();
        this.#syncFormState();
    }
    #syncAccessibilityState() {
        const descriptions = [];
        if (this.supportingText) {
            descriptions.push("supporting-text");
        }
        if (this.invalid && this.validationMessageText) {
            descriptions.push("error-message");
        }
        this.#internals.ariaLabel = this.label || null;
        this.#internals.ariaDisabled = this.disabled ? "true" : null;
        this.#internals.ariaRequired = this.required ? "true" : null;
        this.#internals.ariaInvalid = this.invalid ? "true" : null;
        this.#internals.ariaDescribedByElements = descriptions
            .map(part => this.shadowRoot?.querySelector(`[part="${part}"]`))
            .filter((element) => element instanceof Element);
    }
    #syncFormState() {
        if (this.invalid) {
            this.validationMessageText = this.errorText || "Please choose an option.";
        }
        else if (this.required && !this.value) {
            this.validationMessageText = this.errorText || "Please choose an option.";
        }
        else {
            this.validationMessageText = "";
        }
        const shouldBeInvalid = this.invalid || (this.required && !this.value);
        if (shouldBeInvalid) {
            this.#internals.setValidity({ valueMissing: !this.value }, this.validationMessageText);
        }
        else {
            this.#internals.setValidity({});
        }
        this.#internals.setFormValue(this.value || null, this.value || null);
    }
    #ownedSegments() {
        return Array.from(this.querySelectorAll("violet-segment")).filter(segment => segment.closest("violet-segmented-control") === this);
    }
}
__decorate([
    observable
], VioletSegmentedControl.prototype, "segments", void 0);
__decorate([
    observable
], VioletSegmentedControl.prototype, "validationMessageText", void 0);
attr(VioletSegmentedControl.prototype, "label");
attr({ attribute: "supporting-text" })(VioletSegmentedControl.prototype, "supportingText");
attr({ attribute: "error-text" })(VioletSegmentedControl.prototype, "errorText");
attr(VioletSegmentedControl.prototype, "value");
attr(VioletSegmentedControl.prototype, "name");
attr({ mode: "boolean" })(VioletSegmentedControl.prototype, "disabled");
attr({ mode: "boolean" })(VioletSegmentedControl.prototype, "invalid");
attr({ mode: "boolean" })(VioletSegmentedControl.prototype, "required");
if (!customElements.get("violet-segmented-control")) {
    await FASTElement.define(VioletSegmentedControl, {
        name: "violet-segmented-control",
        template,
        styles,
    });
}