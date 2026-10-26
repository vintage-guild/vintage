import { FASTElement, attr, css, html } from "@lushly-dev/fast-element";
import { violetSurfaceTokenDefaults } from "../theme/violet-token-defaults";
const styles = css `
    ${violetSurfaceTokenDefaults}

    :host {
        display: block;
        --_suggestion-font-size: var(--violet-suggestion-font-size, var(--_caption-size, 12px));
        --_suggestion-line-height: var(--violet-suggestion-line-height, var(--_caption-line, 16px));
    }

    .root {
        display: flex;
        flex-wrap: wrap;
        gap: var(--_space-sm);
    }

    :host([orientation="vertical"]) .root {
        flex-direction: column;
        flex-wrap: nowrap;
    }

    ::slotted(*) {
        all: unset;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        padding: var(--_space-sm) var(--_space-md);
        border: var(--_card-border-width, 1px) solid var(--_border-subtle);
        border-radius: var(--_radius-round, 9999px);
        font-size: var(--_suggestion-font-size);
        line-height: var(--_suggestion-line-height);
        color: var(--_text-primary, #1c1a0d);
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
        white-space: nowrap;
    }

    ::slotted(*:hover) {
        background: var(--_surface-hover, rgba(28, 26, 13, 0.06));
        border-color: var(--_text-secondary, #414651);
    }

    ::slotted(*:focus-visible) {
        outline: none;
        box-shadow: 0 0 0 2px var(--_focus-ring);
    }

    @media (forced-colors: active) {
        ::slotted(*) {
            forced-color-adjust: none;
            border-color: ButtonText;
            background: Canvas;
            color: ButtonText;
        }

        ::slotted(*:hover) {
            background: Highlight;
            color: HighlightText;
        }
    }
`;
const template = html `
    <div class="root" part="root" role="group" aria-label="Suggested prompts">
        <slot @click="${(x, c) => x.handleClick(c.event)}" @keydown="${(x, c) => x.handleKeydown(c.event)}"></slot>
    </div>
`;
/**
 * Violet chat suggestions.
 *
 * @summary Prompt starter chip row. Children are rendered as clickable
 *          suggestion chips that fire a select event.
 * @slot - Suggestion chip elements (buttons or custom elements).
 * @csspart root - The chip container.
 * @fires select - When a suggestion is clicked. Detail: { text }.
 */
export class VioletChatSuggestions extends FASTElement {
    constructor() {
        super();
        this.orientation = "horizontal";
    }
    connectedCallback() {
        super.connectedCallback();
        this.ensureChipRoles();
    }
    handleClick(event) {
        const target = event.target;
        if (target !== this && this.contains(target)) {
            const text = target.textContent?.trim() ?? "";
            if (text) {
                this.$emit("select", { text });
            }
        }
    }
    handleKeydown(event) {
        const target = event.target;
        if (event.key === "Enter" || event.key === " ") {
            if (target !== this && this.contains(target)) {
                event.preventDefault();
                const text = target.textContent?.trim() ?? "";
                if (text) {
                    this.$emit("select", { text });
                }
            }
        }
        // Arrow key navigation between chips
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            this.focusNextChip(target, 1);
        }
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            this.focusNextChip(target, -1);
        }
    }
    ensureChipRoles() {
        for (const child of Array.from(this.children)) {
            if (!child.getAttribute("role")) {
                child.setAttribute("role", "button");
            }
            if (!child.hasAttribute("tabindex")) {
                child.setAttribute("tabindex", "0");
            }
        }
    }
    focusNextChip(current, direction) {
        const chips = Array.from(this.children);
        const idx = chips.indexOf(current);
        if (idx === -1) {
            return;
        }
        const next = chips[idx + direction];
        if (next) {
            next.focus();
        }
    }
}
attr(VioletChatSuggestions.prototype, "orientation");
if (!customElements.get("violet-chat-suggestions")) {
    await FASTElement.define(VioletChatSuggestions, {
        name: "violet-chat-suggestions",
        template,
        styles,
    });
}