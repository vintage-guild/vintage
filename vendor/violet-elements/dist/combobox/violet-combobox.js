var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable, when } from "@lushly-dev/fast-element";
import "../option/violet-option";
import { violetFieldTokenDefaults } from "../theme/violet-token-defaults";
import { getEnabledOptions, getNextEnabledIndex, getOwnedOptions, getSelectedOption, isOptionDisabled, normalizeMatchText, syncOptionSelection, } from "../listbox/violet-selection-helpers";
let violetComboboxCount = 0;
const styles = css `
    ${violetFieldTokenDefaults}

    :host {
        position: relative;
        display: grid;
    }

    .field {
        display: grid;
        gap: 0;
    }

    .control-shell {
        position: relative;
        display: grid;
    }

    .control-shell.open {
        z-index: var(--_layer-raised);
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

    .control-frame:focus-within,
    .control-shell.open .control-frame {
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

    .input::placeholder {
        color: var(--_text-muted);
    }

    .caret {
        inline-size: 0.5rem;
        block-size: 0.5rem;
        flex: 0 0 auto;
        border-inline-end: 1.5px solid currentColor;
        border-block-end: 1.5px solid currentColor;
        transform: translateY(-1px) rotate(45deg);
        opacity: 0.8;
        pointer-events: none;
    }

    .panel {
        box-sizing: border-box;
        position: fixed;
        inset: unset;
        z-index: var(--_layer-popover);
        inline-size: var(--_panel-inline-size, auto);
        max-inline-size: calc(100vw - 8px);
        max-block-size: min(18rem, 60vh);
        padding: var(--_space-inline-sm);
        border: thin solid var(--_border-subtle);
        border-radius: calc(var(--_radius-md) * 2);
        overflow: hidden;
        background: var(--_surface-card);
        box-shadow: var(--_shadow-floating);
        color: inherit;
    }

    .panel[hidden] {
        display: none;
    }

    .listbox {
        display: grid;
        gap: 2px;
        max-block-size: inherit;
        overflow: auto;
    }

    .empty {
        padding: var(--_space-inline-sm) var(--_space-inline-md);
        color: var(--_text-muted);
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
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

    .control-shell.open ~ .supporting,
    .control-shell.open ~ .error {
        visibility: hidden;
    }
`;
const template = html `
    <div class="field" part="field">
        ${when(x => Boolean(x.label), html `
                <div class="label" part="label" id="${x => x.labelId}">${x => x.label}</div>
            `)}
        <div class="control-shell" part="control-shell">
            <div class="control-frame" part="control-frame">
                <input
                    id="${x => x.inputId}"
                    class="input"
                    part="input"
                    type="text"
                    name="${x => x.name}"
                    placeholder="${x => x.placeholder}"
                    :value="${x => x.value}"
                    ?disabled="${x => x.disabled}"
                    ?required="${x => x.required}"
                    role="combobox"
                    autocomplete="off"
                    aria-autocomplete="list"
                    aria-expanded="false"
                    aria-controls="${x => x.listboxId}"
                    aria-labelledby="${x => (x.label ? x.labelId : null)}"
                    aria-describedby="${x => x.describedBy || null}"
                    aria-invalid="${x => x.invalid ? "true" : "false"}"
                    @focus="${x => x.handleInputFocus()}"
                    @input="${(x, c) => x.handleInput(c.event)}"
                    @change="${(x, c) => x.handleCommit(c.event)}"
                    @keydown="${(x, c) => x.handleKeydown(c.event)}"
                />
                <span class="caret" part="caret" aria-hidden="true"></span>
            </div>

            <div class="panel" part="panel" hidden>
                <div
                    id="${x => x.listboxId}"
                    class="listbox"
                    part="listbox"
                    role="listbox"
                    aria-label="${x => x.label || x.placeholder || "Options"}"
                >
                    <slot @slotchange="${x => x.handleSlotChange()}"></slot>
                </div>
                ${when(x => x.visibleOptions.length === 0, html `
                        <div class="empty" part="empty-state">No matching options</div>
                    `)}
            </div>
        </div>

        ${when(x => Boolean(x.supportingText), html `
                <p class="supporting" part="supporting-text" id="${x => x.supportingId}">${x => x.supportingText}</p>
            `)}
        ${when(x => Boolean(x.displayErrorText), html `
                <p class="error" part="error-message" id="${x => x.errorId}">${x => x.displayErrorText}</p>
            `)}
    </div>
`;
export class VioletCombobox extends FASTElement {
    static { this.formAssociated = true; }
    #internals;
    #defaultValue;
    #defaultSelectedOptionValue;
    #handleViewportChange = () => {
        if (this.open) {
            this.#positionPanel();
        }
    };
    #handleDocumentPointerDown = (event) => {
        if (!this.open) {
            return;
        }
        if (event.composedPath().includes(this)) {
            return;
        }
        this.hide(true);
    };
    constructor() {
        super();
        this.#internals = this.attachInternals();
        this.#defaultValue = "";
        this.#defaultSelectedOptionValue = "";
        this.open = false;
        this.validationMessageText = "";
        this.label = "";
        this.placeholder = "";
        this.supportingText = "";
        this.errorText = "";
        this.value = "";
        this.activeValue = "";
        this.selectedOptionValue = "";
        this.name = "";
        this.required = false;
        this.disabled = false;
        this.invalid = false;
        violetComboboxCount += 1;
        this.inputId = `violet-combobox-input-${violetComboboxCount}`;
        this.labelId = `violet-combobox-label-${violetComboboxCount}`;
        this.listboxId = `violet-combobox-listbox-${violetComboboxCount}`;
        this.supportingId = `violet-combobox-supporting-${violetComboboxCount}`;
        this.errorId = `violet-combobox-error-${violetComboboxCount}`;
    }
    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("request-select", this.handleRequestSelect);
        this.ownerDocument.addEventListener("pointerdown", this.#handleDocumentPointerDown, true);
        window.addEventListener("resize", this.#handleViewportChange);
        window.addEventListener("scroll", this.#handleViewportChange, true);
        this.handleSlotChange();
        this.#defaultValue = this.value;
        this.#defaultSelectedOptionValue = this.selectedOptionValue;
        this.#syncFormState();
        this.openChanged();
    }
    disconnectedCallback() {
        this.removeEventListener("request-select", this.handleRequestSelect);
        this.ownerDocument.removeEventListener("pointerdown", this.#handleDocumentPointerDown, true);
        window.removeEventListener("resize", this.#handleViewportChange);
        window.removeEventListener("scroll", this.#handleViewportChange, true);
        super.disconnectedCallback();
    }
    get options() {
        return getOwnedOptions(this);
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
    get visibleOptions() {
        const query = normalizeMatchText(this.value.trim());
        if (!query) {
            return this.options;
        }
        return this.options.filter(option => normalizeMatchText(option.labelText).includes(query));
    }
    get activeOptionId() {
        return this.visibleOptions.find(option => option.value === this.activeValue)?.optionId ?? "";
    }
    get describedBy() {
        return [this.supportingText ? this.supportingId : "", this.displayErrorText ? this.errorId : ""]
            .filter(Boolean)
            .join(" ");
    }
    get displayErrorText() {
        const submittedValue = this.selectedOptionValue || this.value;
        return !this.disabled && (this.invalid || (this.required && !submittedValue.trim()))
            ? this.errorText || "Please choose an option."
            : "";
    }
    formResetCallback() {
        this.value = this.#defaultValue;
        this.selectedOptionValue = this.#defaultSelectedOptionValue;
        this.activeValue = "";
        this.open = false;
        this.options.forEach(option => {
            option.selected = false;
        });
        this.handleSlotChange();
    }
    handleSlotChange() {
        const selectedByValue = getSelectedOption(this.options, this.selectedOptionValue || this.value);
        const selectedByLabel = selectedByValue ??
            this.options.find(option => !isOptionDisabled(option) && normalizeMatchText(option.labelText) === normalizeMatchText(this.value)) ??
            null;
        const selected = selectedByValue ?? selectedByLabel;
        if (selected) {
            this.selectedOptionValue = selected.value;
            if (!this.open ||
                !this.value ||
                this.value === selected.value ||
                normalizeMatchText(this.value) === normalizeMatchText(selected.labelText)) {
                this.value = selected.labelText;
            }
        }
        else if (!this.open && !this.value) {
            this.selectedOptionValue = "";
        }
        if (!this.activeValue || !this.visibleOptions.some(option => option.value === this.activeValue)) {
            this.activeValue = this.visibleOptions[0]?.value ?? "";
        }
        this.#syncVisibleState();
        this.#syncFormState();
    }
    handleInputFocus() {
        if (!this.disabled) {
            this.show();
        }
    }
    handleInput(event) {
        const control = event.currentTarget;
        this.value = control?.value ?? "";
        this.open = true;
        const selectedLabel = this.options.find(option => option.value === this.selectedOptionValue)?.labelText ?? "";
        if (normalizeMatchText(selectedLabel) !== normalizeMatchText(this.value)) {
            this.selectedOptionValue = "";
        }
        this.activeValue = this.visibleOptions[0]?.value ?? "";
        this.#syncVisibleState();
        this.#syncFormState();
        this.$emit("input", { value: this.value, selectedValue: this.selectedOptionValue });
    }
    handleCommit(event) {
        const control = event.currentTarget;
        this.value = control?.value ?? "";
        this.#syncFormState();
        this.$emit("change", { value: this.value, selectedValue: this.selectedOptionValue });
    }
    handleKeydown(event) {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                this.show();
                this.#moveActive(1);
                break;
            case "ArrowUp":
                event.preventDefault();
                this.show();
                this.#moveActive(-1);
                break;
            case "Enter":
                if (this.open && this.activeValue) {
                    event.preventDefault();
                    this.selectValue(this.activeValue);
                }
                break;
            case "Escape":
                if (this.open) {
                    event.preventDefault();
                    this.hide(true);
                }
                break;
        }
    }
    handleRequestSelect(event) {
        event.stopPropagation();
        const nextValue = event.detail?.value ?? "";
        this.selectValue(nextValue);
    }
    valueChanged() {
        this.#syncVisibleState();
        this.#syncFormState();
    }
    requiredChanged() {
        this.#syncFormState();
    }
    disabledChanged() {
        this.#syncFormState();
    }
    invalidChanged() {
        this.#syncFormState();
    }
    errorTextChanged() {
        this.#syncFormState();
    }
    openChanged() {
        const shell = this.#controlShell;
        const panel = this.#panel;
        const input = this.#input;
        shell?.classList.toggle("open", this.open);
        panel?.toggleAttribute("hidden", !this.open);
        input?.setAttribute("aria-expanded", String(this.open));
        if (this.open) {
            requestAnimationFrame(() => {
                this.#positionPanel();
            });
        }
    }
    show() {
        if (this.disabled) {
            return;
        }
        this.open = true;
        this.activeValue = this.selectedOptionValue || this.visibleOptions[0]?.value || this.activeValue;
        this.#syncVisibleState();
    }
    hide(commitSelection) {
        this.open = false;
        if (commitSelection) {
            const selected = this.options.find(option => option.value === this.selectedOptionValue);
            this.value = selected?.labelText ?? "";
        }
        this.#syncVisibleState();
        this.#syncFormState();
    }
    selectValue(nextValue) {
        const option = getEnabledOptions(this.options).find(candidate => candidate.value === nextValue) ?? null;
        if (!option) {
            return;
        }
        this.selectedOptionValue = option.value;
        this.value = option.labelText;
        this.activeValue = option.value;
        this.hide(false);
        this.#syncVisibleState();
        this.#syncFormState();
        this.$emit("change", { value: this.value, selectedValue: option.value, label: option.labelText });
    }
    #moveActive(step) {
        const options = this.visibleOptions;
        const currentIndex = options.findIndex(option => option.value === this.activeValue);
        const nextIndex = getNextEnabledIndex(options, currentIndex < 0 ? (step === 1 ? -1 : 0) : currentIndex, step);
        this.activeValue = options[nextIndex]?.value ?? "";
        this.#syncVisibleState();
        this.#scrollActiveIntoView();
    }
    #scrollActiveIntoView() {
        const active = this.visibleOptions.find(option => option.value === this.activeValue);
        active?.shadowRoot?.querySelector('[part="control"]')?.scrollIntoView({ block: "nearest" });
    }
    #syncVisibleState() {
        const visibleValues = new Set(this.visibleOptions.map(option => option.value));
        for (const option of this.options) {
            option.hidden = !visibleValues.has(option.value);
        }
        syncOptionSelection(this.options, this.selectedOptionValue, this.activeValue);
        this.#syncActiveDescendant();
    }
    #syncActiveDescendant() {
        const input = this.#input;
        if (!input) {
            return;
        }
        input.ariaActiveDescendantElement = this.open
            ? this.visibleOptions.find(option => option.value === this.activeValue) ?? null
            : null;
    }
    #positionPanel() {
        const panel = this.#panel;
        const frame = this.#controlFrame;
        if (!panel || !frame) {
            return;
        }
        const rect = frame.getBoundingClientRect();
        const viewportPadding = 4;
        const gap = -1;
        let left = rect.left;
        let top = rect.bottom + gap;
        const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
        panel.style.width = `${width}px`;
        panel.style.left = `${Math.max(viewportPadding, left)}px`;
        panel.style.top = `${Math.max(viewportPadding, top)}px`;
        requestAnimationFrame(() => {
            const panelRect = panel.getBoundingClientRect();
            if (panelRect.right > window.innerWidth - viewportPadding) {
                left = Math.max(viewportPadding, window.innerWidth - panelRect.width - viewportPadding);
            }
            if (panelRect.bottom > window.innerHeight - viewportPadding) {
                top = Math.max(viewportPadding, rect.top - panelRect.height + 1);
            }
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
        });
    }
    get #controlShell() {
        return this.shadowRoot?.querySelector(".control-shell") ?? null;
    }
    get #panel() {
        return this.shadowRoot?.querySelector(".panel") ?? null;
    }
    get #controlFrame() {
        return this.shadowRoot?.querySelector(".control-frame") ?? null;
    }
    get #input() {
        return this.shadowRoot?.querySelector('input[role="combobox"]') ?? null;
    }
    #syncFormState() {
        if (!this.$fastController.isConnected) {
            return;
        }
        const control = this.shadowRoot?.querySelector('input[role="combobox"]');
        const message = this.displayErrorText || this.errorText || "Please choose an option.";
        const submittedValue = this.disabled ? "" : this.selectedOptionValue || this.value;
        const invalid = !this.disabled && Boolean(this.displayErrorText);
        this.validationMessageText = this.displayErrorText;
        this.#internals.ariaInvalid = invalid ? "true" : "false";
        this.#internals.setFormValue(this.disabled ? null : submittedValue || null, this.disabled ? null : submittedValue || null);
        if (this.disabled) {
            this.#internals.setValidity({});
            return;
        }
        if (this.invalid) {
            this.#internals.setValidity({ customError: true }, message, control ?? undefined);
            return;
        }
        if (this.required && !submittedValue.trim()) {
            this.#internals.setValidity({ valueMissing: true }, message, control ?? undefined);
            return;
        }
        this.#internals.setValidity({});
    }
}
__decorate([
    observable
], VioletCombobox.prototype, "open", void 0);
__decorate([
    observable
], VioletCombobox.prototype, "validationMessageText", void 0);
__decorate([
    observable
], VioletCombobox.prototype, "activeValue", void 0);
__decorate([
    observable
], VioletCombobox.prototype, "selectedOptionValue", void 0);
attr(VioletCombobox.prototype, "label");
attr(VioletCombobox.prototype, "placeholder");
attr({ attribute: "supporting-text" })(VioletCombobox.prototype, "supportingText");
attr({ attribute: "error-text" })(VioletCombobox.prototype, "errorText");
attr(VioletCombobox.prototype, "value");
attr(VioletCombobox.prototype, "name");
attr({ mode: "boolean" })(VioletCombobox.prototype, "required");
attr({ mode: "boolean" })(VioletCombobox.prototype, "disabled");
attr({ mode: "boolean" })(VioletCombobox.prototype, "invalid");
attr({ mode: "boolean" })(VioletCombobox.prototype, "open");
if (!customElements.get("violet-combobox")) {
    await FASTElement.define(VioletCombobox, {
        name: "violet-combobox",
        template,
        styles,
        shadowOptions: {
            delegatesFocus: true,
        },
    });
}