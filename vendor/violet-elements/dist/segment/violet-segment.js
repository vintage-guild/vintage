import { FASTElement, attr, css, html } from "@lushly-dev/fast-element";
import { violetActionTokenDefaults } from "../theme/violet-token-defaults";
const styles = css `
    ${violetActionTokenDefaults}

    :host {
        display: block;
        flex: 1 1 0;

        --_segment-selected-background: var(--violet-segment-selected-background, var(--_surface-page));
        --_segment-selected-border: var(--violet-segment-selected-border, var(--_border-subtle));
        --_segment-selected-shadow: var(--violet-segment-selected-shadow, var(--_shadow-control));
    }

    .button {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        inline-size: 100%;
        min-block-size: calc(var(--_target-size) - var(--_space-xs));
        padding: var(--_space-sm) var(--_space-md);
        border: 1px solid transparent;
        border-radius: calc(var(--_radius-md) - 2px);
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        font-size: var(--_control-body-size);
        font-weight: var(--_type-label-weight);
        line-height: var(--_type-body-line);
        text-align: center;
        transition:
            background-color var(--_duration-fast) var(--_easing-standard),
            border-color var(--_duration-fast) var(--_easing-standard),
            box-shadow var(--_duration-fast) var(--_easing-standard),
            color var(--_duration-fast) var(--_easing-standard);
    }

    .button:hover {
        background: color-mix(in srgb, var(--_surface-page) 55%, transparent);
    }

    .button:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--_focus-ring);
    }

    :host([checked]) .button {
        background: var(--_segment-selected-background);
        border-color: var(--_segment-selected-border);
        box-shadow: var(--_segment-selected-shadow);
        color: var(--color-text-primary, #18181b);
    }

    :host([disabled]) .button,
    :host([aria-disabled="true"]) .button {
        cursor: not-allowed;
        opacity: 0.6;
    }

    @media (forced-colors: active) {
        .button {
            forced-color-adjust: none;
            color: ButtonText;
        }

        :host([checked]) .button {
            background: Highlight;
            border-color: Highlight;
            color: HighlightText;
            box-shadow: none;
        }
    }
`;
const template = html `
    <button
        class="button"
        part="button"
        type="button"
        role="radio"
        ?disabled="${x => x.effectiveDisabled}"
        aria-checked="${x => String(x.checked)}"
        @click="${x => x.handleClick()}"
    >
        <slot></slot>
    </button>
`;
/**
 * Violet segmented-control item.
 *
 * @summary Button-like single-selection segment used within `violet-segmented-control`.
 * @fires select-request - Emitted when the segment requests selection.
 * @slot - Visible segment label content.
 * @csspart button - Interactive segment button surface.
 */
export class VioletSegment extends FASTElement {
    #disabledFromGroup;
    constructor() {
        super();
        this.#disabledFromGroup = false;
        this.checked = false;
        this.disabled = false;
        this.value = "";
    }
    get effectiveDisabled() {
        return this.disabled || this.#disabledFromGroup;
    }
    setCheckedFromGroup(checked) {
        this.checked = checked;
    }
    setGroupDisabled(disabled) {
        this.#disabledFromGroup = disabled;
        this.ariaDisabled = disabled ? "true" : null;
    }
    focusButton() {
        this.buttonElement?.focus();
    }
    handleClick() {
        if (this.effectiveDisabled || this.checked) {
            return;
        }
        this.$emit("select-request", { value: this.value });
    }
    get buttonElement() {
        return this.shadowRoot?.querySelector(".button") ?? null;
    }
}
attr({ mode: "boolean" })(VioletSegment.prototype, "checked");
attr({ mode: "boolean" })(VioletSegment.prototype, "disabled");
attr(VioletSegment.prototype, "value");
if (!customElements.get("violet-segment")) {
    await FASTElement.define(VioletSegment, {
        name: "violet-segment",
        template,
        styles,
        shadowOptions: {
            delegatesFocus: true,
        },
    });
}