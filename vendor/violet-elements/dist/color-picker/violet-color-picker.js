import { FASTElement, attr, css, html, observable, repeat, when } from "@lushly-dev/fast-element";
import "../color-swatch/violet-color-swatch";
import "../icon/violet-icon";
import { registerSystemChevronRightIcon } from "../icon/generated/icons/system-chevron-right";
import { clamp, hexToHsl, hslToHex, lightnessGradient, normalizeHexColor, saturationGradient, } from "./violet-color-utils";
import { violetFieldTokenDefaults } from "../theme/violet-token-defaults";
const DEFAULT_COLOR = "#c84f3b";
const DEFAULT_PRESETS = ["#244635", "#c84f3b", "#df7f44", "#d2b062", "#7c9d83", "#5f7ea6", "#7d5fa6", "#b95a7b"];
let violetColorPickerCount = 0;
registerSystemChevronRightIcon();
const styles = css `
    ${violetFieldTokenDefaults}

    :host {
        position: relative;
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

    .control-shell {
        position: relative;
        display: grid;
    }

    .control-shell.open {
        z-index: var(--_layer-raised);
    }

    .trigger {
        box-sizing: border-box;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--_space-inline-md);
        inline-size: 100%;
        min-block-size: var(--_target-size);
        padding-inline: max(var(--_space-inline-md), calc(var(--_target-size) * 0.375));
        padding-block: calc(var(--_space-stack-xs) + 2px);
        border: 1px solid var(--_border-subtle);
        border-radius: var(--_radius-md);
        background: var(--_surface-page);
        color: inherit;
        box-shadow: var(--_shadow-control);
        cursor: pointer;
        text-align: start;
        transition:
            border-color var(--_duration-fast) var(--_easing-standard),
            box-shadow var(--_duration-base) var(--_easing-standard),
            transform var(--_duration-fast) var(--_easing-standard);
    }

    .trigger:hover {
        border-color: var(--color-field-border-hover, rgba(28, 26, 13, 0.35));
    }

    .trigger:focus-visible,
    .control-shell.open .trigger {
        outline: none;
        border-color: color-mix(in srgb, var(--_focus-ring) 48%, var(--_border-subtle));
        box-shadow: 0 0 0 2px var(--_focus-ring);
        transform: translateY(calc(var(--_space-inline-sm) / -4));
    }

    :host([disabled]) .trigger {
        opacity: 0.65;
        cursor: not-allowed;
    }

    :host([invalid]) .trigger,
    :host([data-invalid]) .trigger {
        border-color: var(--_danger-border);
    }

    .swatch {
        flex: 0 0 auto;
    }

    .trigger-copy {
        display: grid;
        gap: 1px;
        min-inline-size: 0;
    }

    .trigger-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--_control-body-size);
        line-height: var(--_type-body-line);
        color: var(--color-text-primary, #18181b);
    }

    .trigger-value.placeholder {
        color: var(--_text-muted);
    }

    .trigger-meta {
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
        color: var(--_text-muted);
    }

    .trigger-icon {
        display: inline-grid;
        place-items: center;
        color: var(--_text-muted);
        transition: transform var(--_duration-base) var(--_easing-standard);
    }

    .control-shell.open .trigger-icon {
        transform: rotate(90deg);
    }

    .trigger-icon violet-icon {
        --violet-icon-size: 1rem;
    }

    .panel {
        box-sizing: border-box;
        position: fixed;
        inset: unset;
        inline-size: min(26rem, calc(100vw - 8px));
        max-inline-size: calc(100vw - 16px);
        padding: var(--_space-stack-sm);
        border: 1px solid var(--_border-subtle);
        border-radius: calc(var(--_radius-md) * 2);
        background: var(--_surface-card);
        box-shadow: var(--_shadow-floating);
        color: inherit;
        z-index: var(--_layer-popover);
        display: grid;
        gap: var(--_space-stack-sm);
        opacity: 0;
        transform: translateY(calc(var(--_space-stack-xs) * -1));
        transition:
            opacity var(--_duration-fast) var(--_easing-standard),
            transform var(--_duration-fast) var(--_easing-standard),
            display var(--_duration-fast) var(--_easing-standard) allow-discrete,
            overlay var(--_duration-fast) var(--_easing-standard) allow-discrete;
    }

    .panel:popover-open {
        opacity: 1;
        transform: translateY(0);
    }

    .panel.open {
        opacity: 1;
        transform: translateY(0);
    }

    .panel::backdrop {
        background: transparent;
    }

    .panel-header {
        display: flex;
        align-items: center;
        gap: var(--_space-inline-md);
    }

    .preview-copy {
        display: grid;
        gap: 0;
        min-inline-size: 0;
    }

    .panel-title {
        font-size: var(--_control-body-size);
        line-height: var(--_type-body-line);
        font-weight: 600;
        color: var(--color-text-primary, #18181b);
    }

    .hex-field {
        display: grid;
        gap: var(--_space-stack-2xs);
    }

    .field-label {
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
        color: var(--_text-secondary);
    }

    .hex-input {
        box-sizing: border-box;
        inline-size: 100%;
        min-block-size: calc(var(--_target-size) - 4px);
        padding-inline: max(var(--_space-inline-md), 0.75rem);
        border: 1px solid var(--_border-subtle);
        border-radius: var(--_radius-md);
        background: var(--_surface-page);
        color: inherit;
        font: inherit;
        font-size: var(--_control-body-size);
        line-height: var(--_type-body-line);
        box-shadow: var(--_shadow-control);
    }

    .hex-input:focus {
        outline: none;
    }

    .hex-input:focus-visible {
        border-color: color-mix(in srgb, var(--_focus-ring) 48%, var(--_border-subtle));
        box-shadow: 0 0 0 2px var(--_focus-ring);
    }

    .hex-hint {
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
        color: var(--_text-muted);
    }

    .channels {
        display: grid;
        gap: var(--_space-stack-sm);
    }

    .channel {
        display: grid;
        gap: var(--_space-stack-2xs);
    }

    .channel-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--_space-inline-md);
    }

    .channel-value {
        font-size: var(--_control-caption-size);
        line-height: var(--_type-caption-line);
        color: var(--_text-muted);
    }

    .channel-input {
        appearance: none;
        -webkit-appearance: none;
        inline-size: 100%;
        block-size: 1.125rem;
        margin: 0;
        border: 0;
        background: transparent;
    }

    .channel-input:focus {
        outline: none;
    }

    .channel-input::-webkit-slider-runnable-track {
        block-size: 0.625rem;
        border-radius: var(--_radius-round, 9999px);
        background: var(--_channel-track, var(--_surface-subtle));
    }

    .channel-input::-moz-range-track {
        block-size: 0.625rem;
        border-radius: var(--_radius-round, 9999px);
        background: var(--_channel-track, var(--_surface-subtle));
    }

    .channel-input::-webkit-slider-thumb {
        appearance: none;
        -webkit-appearance: none;
        inline-size: 1rem;
        block-size: 1rem;
        margin-block-start: -0.1875rem;
        border: 1px solid var(--_border-subtle);
        border-radius: var(--_radius-round, 9999px);
        background: var(--_surface-page);
        box-shadow: var(--_shadow-control);
    }

    .channel-input::-moz-range-thumb {
        inline-size: 1rem;
        block-size: 1rem;
        border: 1px solid var(--_border-subtle);
        border-radius: var(--_radius-round, 9999px);
        background: var(--_surface-page);
        box-shadow: var(--_shadow-control);
    }

    .channel-input:focus-visible::-webkit-slider-thumb {
        box-shadow:
            var(--_shadow-control),
            0 0 0 2px var(--_focus-ring);
    }

    .channel-input:focus-visible::-moz-range-thumb {
        box-shadow:
            var(--_shadow-control),
            0 0 0 2px var(--_focus-ring);
    }

    .presets {
        display: grid;
        gap: var(--_space-stack-2xs);
    }

    .preset-grid {
        display: flex;
        flex-wrap: wrap;
        gap: var(--_space-inline-md);
    }

    .preset-button {
        display: inline-grid;
        place-items: center;
        padding: 0;
        border: 1px solid transparent;
        background: transparent;
        cursor: pointer;
        border-radius: var(--_radius-round, 9999px);
    }

    .preset-button[aria-pressed="true"] {
        border-color: color-mix(in srgb, var(--_focus-ring) 48%, var(--_border-subtle));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--_focus-ring) 25%, transparent);
    }

    .preset-button:focus-visible {
        outline: none;
        border-color: color-mix(in srgb, var(--_focus-ring) 48%, var(--_border-subtle));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--_focus-ring) 25%, transparent);
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
        ${when(x => Boolean(x.label), html `<label class="label" part="label" id="${x => x.labelId}">${x => x.label}</label>`)}
        <div class="${x => x.controlShellClass}" part="control-shell">
            <button
                id="${x => x.triggerId}"
                class="trigger"
                part="trigger"
                type="button"
                ?disabled="${x => x.disabled}"
                aria-controls="${x => x.panelId}"
                aria-describedby="${x => x.describedBy || null}"
                aria-expanded="${x => x.expandedText}"
                aria-haspopup="dialog"
                aria-invalid="${x => x.ariaInvalidText}"
                aria-labelledby="${x => x.labelledBy}"
                @click="${x => x.toggleOpen()}"
            >
                <violet-color-swatch
                    class="swatch"
                    part="swatch"
                    decorative
                    size="${x => x.swatchSize}"
                    value="${x => x.currentSelectedColor}"
                ></violet-color-swatch>
                <span class="trigger-copy">
                    <span class="${x => x.triggerValueClass}" id="${x => x.valueId}">${x => x.triggerValueText}</span>
                    <span class="trigger-meta">${x => x.triggerMetaText}</span>
                </span>
                <span class="trigger-icon" aria-hidden="true">
                    <violet-icon icon="system/chevron-right" decorative></violet-icon>
                </span>
            </button>
            <div
                id="${x => x.panelId}"
                class="${x => x.panelClass}"
                part="panel"
                popover="auto"
                role="dialog"
                aria-label="${x => x.panelLabel}"
                @toggle="${(x, c) => x.handleToggle(c.event)}"
            >
                <div class="panel-header" part="panel-header">
                    <violet-color-swatch value="${x => x.currentSelectedColor}" size="comfortable" decorative></violet-color-swatch>
                    <div class="preview-copy">
                        <div class="panel-title">${x => x.panelTitleText}</div>
                    </div>
                </div>
                <div class="hex-field">
                    <label class="field-label" for="${x => x.hexInputId}">Hex value</label>
                    <input
                        id="${x => x.hexInputId}"
                        class="hex-input"
                        part="hex-input"
                        type="text"
                        name="${x => x.name}"
                        inputmode="text"
                        spellcheck="false"
                        autocapitalize="off"
                        autocomplete="off"
                        :value="${x => x.value}"
                        ?disabled="${x => x.disabled}"
                        ?required="${x => x.required}"
                        aria-invalid="${x => x.invalid ? "true" : "false"}"
                        aria-describedby="${x => x.hexHintId}"
                        @input="${(x, c) => x.handleInput(c.event)}"
                        @change="${(x, c) => x.handleCommit(c.event)}"
                        @blur="${(x, c) => x.handleCommit(c.event)}"
                    />
                    <div class="hex-hint" id="${x => x.hexHintId}">Use a 3- or 6-digit hex color.</div>
                </div>
                <div class="channels" part="channels">
                    <div class="channel">
                        <div class="channel-header">
                            <label class="field-label" for="${x => x.hueInputId}">Hue</label>
                            <span class="channel-value">${x => Math.round(x.hue)}deg</span>
                        </div>
                        <input
                            id="${x => x.hueInputId}"
                            class="channel-input"
                            style="--_channel-track: linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);"
                            type="range"
                            min="0"
                            max="360"
                            step="1"
                            :value="${x => x.hue}"
                            @input="${(x, c) => x.handleHueInput(c.event)}"
                            @change="${(x, c) => x.handleHueCommit(c.event)}"
                        />
                    </div>
                    <div class="channel">
                        <div class="channel-header">
                            <label class="field-label" for="${x => x.saturationInputId}">Saturation</label>
                            <span class="channel-value">${x => Math.round(x.saturation)}%</span>
                        </div>
                        <input
                            id="${x => x.saturationInputId}"
                            class="channel-input"
                            style="${x => x.saturationTrackStyle}"
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            :value="${x => x.saturation}"
                            @input="${(x, c) => x.handleSaturationInput(c.event)}"
                            @change="${(x, c) => x.handleSaturationCommit(c.event)}"
                        />
                    </div>
                    <div class="channel">
                        <div class="channel-header">
                            <label class="field-label" for="${x => x.lightnessInputId}">Lightness</label>
                            <span class="channel-value">${x => Math.round(x.lightness)}%</span>
                        </div>
                        <input
                            id="${x => x.lightnessInputId}"
                            class="channel-input"
                            style="${x => x.lightnessTrackStyle}"
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            :value="${x => x.lightness}"
                            @input="${(x, c) => x.handleLightnessInput(c.event)}"
                            @change="${(x, c) => x.handleLightnessCommit(c.event)}"
                        />
                    </div>
                </div>
                <div class="presets" part="presets">
                    <div class="field-label">Suggested swatches</div>
                    <div class="preset-grid">
                        ${repeat(x => x.presets, html `
                                <button
                                    class="preset-button"
                                    type="button"
                                    aria-label="${(preset, c) => c.parent.presetAriaLabel(preset)}"
                                    aria-pressed="${(preset, c) => String(c.parent.currentDisplayColor === preset)}"
                                    @click="${(preset, c) => c.parent.applyPreset(preset)}"
                                >
                                    <violet-color-swatch decorative shape="circle" value="${preset => preset}"></violet-color-swatch>
                                </button>
                            `)}
                    </div>
                </div>
                <slot name="presets"></slot>
            </div>
        </div>
        ${when(x => Boolean(x.supportingText) && !x.isInvalid, html `<p class="supporting" part="supporting-text" id="${x => x.supportingId}">${x => x.supportingText}</p>`)}
        ${when(x => Boolean(x.isInvalid && x.errorText), html `<p class="error" part="error-text" id="${x => x.errorId}">${x => x.errorText}</p>`)}
    </div>
`;
/**
 * Violet color picker built from a swatch trigger, textual value, and standard channel controls.
 *
 * @summary Token-driven color picker with a popover editor, hex value entry, and HSL channel sliders.
 * @fires input - Emitted when the selected color changes.
 * @fires change - Emitted when the selected color is committed.
 * @slot presets - Optional additional preset content rendered under the built-in swatches.
 */
export class VioletColorPicker extends FASTElement {
    static { this.formAssociated = true; }
    #internals;
    #handleViewportChange;
    constructor() {
        super();
        this.#handleViewportChange = () => {
            if (this.open) {
                this.positionPanel();
            }
        };
        this.open = false;
        this.hue = 0;
        this.saturation = 0;
        this.lightness = 0;
        this.hexDraft = "";
        this.validationInvalid = false;
        const id = violetColorPickerCount;
        violetColorPickerCount += 1;
        this.#internals = this.attachInternals();
        this.labelId = `violet-color-picker-label-${id}`;
        this.triggerId = `violet-color-picker-trigger-${id}`;
        this.valueId = `violet-color-picker-value-${id}`;
        this.panelId = `violet-color-picker-panel-${id}`;
        this.supportingId = `violet-color-picker-supporting-${id}`;
        this.errorId = `violet-color-picker-error-${id}`;
        this.hexInputId = `violet-color-picker-hex-${id}`;
        this.hexHintId = `violet-color-picker-hex-hint-${id}`;
        this.hueInputId = `violet-color-picker-hue-${id}`;
        this.saturationInputId = `violet-color-picker-saturation-${id}`;
        this.lightnessInputId = `violet-color-picker-lightness-${id}`;
        this.label = "";
        this.value = "";
        this.name = "";
        this.supportingText = "";
        this.errorText = "";
        this.disabled = false;
        this.required = false;
        this.invalid = false;
        this.size = "natural";
        this.syncFromColor(this.value);
    }
    connectedCallback() {
        super.connectedCallback();
        this.syncFromColor(this.value);
        this.#syncFormState();
        this.syncOpenState();
        window.addEventListener("resize", this.#handleViewportChange);
        window.addEventListener("scroll", this.#handleViewportChange, true);
    }
    disconnectedCallback() {
        window.removeEventListener("resize", this.#handleViewportChange);
        window.removeEventListener("scroll", this.#handleViewportChange, true);
        super.disconnectedCallback();
    }
    valueChanged() {
        if (!this.$fastController.isConnected) {
            return;
        }
        this.syncFromColor(this.value);
        this.#syncFormState();
    }
    disabledChanged() {
        if (this.disabled && this.open) {
            this.close();
        }
        if (this.$fastController.isConnected) {
            this.#syncFormState();
        }
    }
    requiredChanged() {
        if (this.$fastController.isConnected) {
            this.#syncFormState();
        }
    }
    invalidChanged() {
        if (this.$fastController.isConnected) {
            this.#syncFormState();
        }
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
    get presets() {
        return DEFAULT_PRESETS;
    }
    get currentDisplayColor() {
        return normalizeHexColor(this.value) ?? hslToHex({ h: this.hue, s: this.saturation, l: this.lightness });
    }
    get currentSelectedColor() {
        return normalizeHexColor(this.value) ?? "";
    }
    get describedBy() {
        const ids = [];
        if (this.isInvalid && this.errorText) {
            ids.push(this.errorId);
        }
        else if (this.supportingText) {
            ids.push(this.supportingId);
        }
        return ids.join(" ");
    }
    get labelledBy() {
        const ids = [];
        if (this.label) {
            ids.push(this.labelId);
        }
        ids.push(this.valueId);
        return ids.join(" ");
    }
    get panelLabel() {
        return this.label ? `${this.label} color picker` : "Color picker";
    }
    get panelTitleText() {
        return this.value ? "Selected color" : "No color selected";
    }
    get controlShellClass() {
        return `control-shell${this.open ? " open" : ""}`;
    }
    get panelClass() {
        return `panel${this.open ? " open" : ""}`;
    }
    get expandedText() {
        return String(this.open);
    }
    get ariaInvalidText() {
        return this.isInvalid ? "true" : "false";
    }
    get isInvalid() {
        return this.invalid || this.validationInvalid;
    }
    get swatchSize() {
        return this.size;
    }
    get triggerValueClass() {
        return this.value ? "trigger-value" : "trigger-value placeholder";
    }
    get triggerValueText() {
        return this.value || "Choose color";
    }
    get triggerMetaText() {
        return this.value ? "Adjust color" : "Select a color";
    }
    get saturationTrackStyle() {
        return `--_channel-track: ${saturationGradient(this.hue, this.lightness)};`;
    }
    get lightnessTrackStyle() {
        return `--_channel-track: ${lightnessGradient(this.hue, this.saturation)};`;
    }
    toggleOpen() {
        if (this.disabled) {
            return;
        }
        const panel = this.panelElement;
        if (!panel) {
            return;
        }
        if (panel.matches(":popover-open")) {
            panel.hidePopover();
        }
        else {
            panel.showPopover();
        }
    }
    close() {
        if (this.panelElement?.matches(":popover-open")) {
            this.panelElement.hidePopover();
        }
    }
    handleToggle(event) {
        this.open = event.newState === "open";
        this.syncOpenState();
        if (this.open) {
            this.positionPanel();
            requestAnimationFrame(() => {
                this.positionPanel();
                this.hexInputElement?.focus();
                this.hexInputElement?.select();
            });
        }
        else {
            this.hexDraft = this.currentSelectedColor;
            this.syncHexInputValue();
        }
    }
    handleHexInput(event) {
        const input = event.currentTarget;
        this.hexDraft = input.value;
        const normalized = normalizeHexColor(input.value);
        if (!normalized) {
            return;
        }
        this.applyColor(normalized, true, false);
    }
    handleInput(event) {
        this.handleHexInput(event);
    }
    handleHexCommit(event) {
        const input = event.currentTarget;
        const normalized = normalizeHexColor(input.value);
        if (!normalized) {
            this.hexDraft = this.currentSelectedColor;
            this.syncHexInputValue();
            return;
        }
        this.applyColor(normalized, true, true);
    }
    handleCommit(event) {
        this.handleHexCommit(event);
    }
    handleChannelInput(channel, event) {
        const input = event.currentTarget;
        const nextValue = Number(input.value);
        this.updateChannel(channel, nextValue);
        this.commitFromChannels(true, false);
    }
    handleChannelCommit(channel, event) {
        const input = event.currentTarget;
        const nextValue = Number(input.value);
        this.updateChannel(channel, nextValue);
        this.commitFromChannels(true, true);
    }
    handleHueInput(event) {
        this.handleChannelInput("h", event);
    }
    handleHueCommit(event) {
        this.handleChannelCommit("h", event);
    }
    handleSaturationInput(event) {
        this.handleChannelInput("s", event);
    }
    handleSaturationCommit(event) {
        this.handleChannelCommit("s", event);
    }
    handleLightnessInput(event) {
        this.handleChannelInput("l", event);
    }
    handleLightnessCommit(event) {
        this.handleChannelCommit("l", event);
    }
    applyPreset(color) {
        this.applyColor(color, true, true);
    }
    presetAriaLabel(color) {
        return `Use ${color}`;
    }
    formResetCallback() {
        this.value = "";
        this.syncFromColor(this.value);
        this.#syncFormState();
    }
    formDisabledCallback(disabled) {
        this.disabled = disabled;
        this.#syncFormState();
    }
    checkValidity() {
        return this.#internals.checkValidity();
    }
    reportValidity() {
        return this.#internals.reportValidity();
    }
    get panelElement() {
        return this.shadowRoot?.querySelector(".panel") ?? null;
    }
    get controlShellElement() {
        return this.shadowRoot?.querySelector(".control-shell") ?? null;
    }
    get hexInputElement() {
        return this.shadowRoot?.querySelector(".hex-input") ?? null;
    }
    syncFromColor(value) {
        const normalized = normalizeHexColor(value);
        const hsl = hexToHsl(normalized || DEFAULT_COLOR);
        if (!hsl) {
            return;
        }
        this.hue = hsl.h;
        this.saturation = hsl.s;
        this.lightness = hsl.l;
        this.hexDraft = normalized ?? "";
        this.syncHexInputValue();
    }
    updateChannel(channel, value) {
        switch (channel) {
            case "h":
                this.hue = clamp(value, 0, 360);
                break;
            case "s":
                this.saturation = clamp(value, 0, 100);
                break;
            case "l":
                this.lightness = clamp(value, 0, 100);
                break;
        }
    }
    commitFromChannels(emitInput, emitChange) {
        const next = hslToHex({
            h: this.hue,
            s: this.saturation,
            l: this.lightness,
        });
        this.applyColor(next, emitInput, emitChange);
    }
    applyColor(color, emitInput, emitChange) {
        const normalized = normalizeHexColor(color);
        if (!normalized) {
            return;
        }
        this.value = normalized;
        this.hexDraft = normalized;
        this.syncFromColor(normalized);
        this.#syncFormState();
        if (emitInput) {
            this.$emit("input", { value: normalized });
        }
        if (emitChange) {
            this.$emit("change", { value: normalized });
        }
    }
    #syncFormState() {
        this.#internals.setFormValue(this.value || null);
        if (this.disabled) {
            this.validationInvalid = false;
            this.removeAttribute("data-invalid");
            this.#internals.setValidity({});
            return;
        }
        if (this.invalid) {
            this.validationInvalid = true;
            this.setAttribute("data-invalid", "");
            this.#internals.setValidity({ customError: true }, this.errorText || "The selected color is invalid.");
            return;
        }
        if (this.required && !this.value) {
            this.validationInvalid = true;
            this.setAttribute("data-invalid", "");
            this.#internals.setValidity({ valueMissing: true }, this.errorText || "Select a color.");
            return;
        }
        this.validationInvalid = false;
        this.removeAttribute("data-invalid");
        this.#internals.setValidity({});
    }
    syncHexInputValue() {
        const input = this.hexInputElement;
        if (!input || input.value === this.hexDraft) {
            return;
        }
        input.value = this.hexDraft;
    }
    syncOpenState() {
        this.controlShellElement?.classList.toggle("open", this.open);
        this.panelElement?.classList.toggle("open", this.open);
        if (this.panelElement) {
            this.panelElement.style.opacity = this.open ? "1" : "0";
            this.panelElement.style.transform = this.open ? "translateY(0)" : "translateY(calc(var(--_space-stack-xs) * -1))";
        }
    }
    positionPanel() {
        const panel = this.panelElement;
        const trigger = this.shadowRoot?.querySelector(".trigger");
        if (!panel || !trigger) {
            return;
        }
        const rect = trigger.getBoundingClientRect();
        const viewportPadding = 8;
        const gap = 6;
        let left = rect.left;
        let top = rect.bottom + gap;
        const width = Math.min(Math.max(rect.width, 320), window.innerWidth - viewportPadding * 2);
        panel.style.width = `${width}px`;
        panel.style.left = `${Math.max(viewportPadding, left)}px`;
        panel.style.top = `${Math.max(viewportPadding, top)}px`;
        requestAnimationFrame(() => {
            const panelRect = panel.getBoundingClientRect();
            if (panelRect.right > window.innerWidth - viewportPadding) {
                left = Math.max(viewportPadding, window.innerWidth - panelRect.width - viewportPadding);
            }
            if (panelRect.bottom > window.innerHeight - viewportPadding) {
                top = Math.max(viewportPadding, rect.top - panelRect.height - gap);
            }
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
        });
    }
}
attr(VioletColorPicker.prototype, "label");
attr(VioletColorPicker.prototype, "value");
attr(VioletColorPicker.prototype, "name");
attr({ attribute: "supporting-text" })(VioletColorPicker.prototype, "supportingText");
attr({ attribute: "error-text" })(VioletColorPicker.prototype, "errorText");
attr({ mode: "boolean" })(VioletColorPicker.prototype, "disabled");
attr({ mode: "boolean" })(VioletColorPicker.prototype, "required");
attr({ mode: "boolean" })(VioletColorPicker.prototype, "invalid");
attr(VioletColorPicker.prototype, "size");
observable(VioletColorPicker.prototype, "open");
observable(VioletColorPicker.prototype, "hue");
observable(VioletColorPicker.prototype, "saturation");
observable(VioletColorPicker.prototype, "lightness");
observable(VioletColorPicker.prototype, "hexDraft");
observable(VioletColorPicker.prototype, "validationInvalid");
if (!customElements.get("violet-color-picker")) {
    await VioletColorPicker.define({
        name: "violet-color-picker",
        template,
        styles,
    });
}