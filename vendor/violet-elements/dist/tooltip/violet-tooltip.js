var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable } from "@lushly-dev/fast-element";
import { violetSurfaceTokenDefaults } from "../theme/violet-token-defaults";
let violetTooltipId = 0;
const styles = css `
    ${violetSurfaceTokenDefaults}

    :host {
        display: inline-block;
        position: relative;

        --_tooltip-border-width: var(--violet-tooltip-border-width, var(--_card-border-width, 1px));
        --_tooltip-font-size: var(--violet-tooltip-font-size, 12px);
        --_tooltip-line-height: var(--violet-tooltip-line-height, 16px);
        --_tooltip-max-width: var(--violet-tooltip-max-width, 240px);
        --_tooltip-gap: var(--violet-tooltip-gap, var(--_space-sm));
        --_tooltip-radius: var(--violet-tooltip-radius, var(--_radius-md));
        --_tooltip-background: var(--violet-tooltip-background, var(--_surface-card));
        --_tooltip-shadow: var(--violet-tooltip-shadow, var(--_shadow-floating));
        --_tooltip-border-color: var(--violet-tooltip-border-color, var(--_border-subtle));
    }

    .anchor {
        display: inline-block;
        anchor-name: --violet-tooltip-anchor;
    }

    .tooltip {
        box-sizing: border-box;
        position: fixed;
        position-anchor: --violet-tooltip-anchor;
        margin: 0;
        padding: var(--_space-sm) var(--_space-md);
        border: var(--_tooltip-border-width) solid var(--_tooltip-border-color);
        border-radius: var(--_tooltip-radius);
        background: var(--_tooltip-background);
        box-shadow: var(--_tooltip-shadow);
        color: inherit;
        font-family: inherit;
        font-size: var(--_tooltip-font-size);
        line-height: var(--_tooltip-line-height);
        max-inline-size: var(--_tooltip-max-width);
        pointer-events: none;
        z-index: var(--_layer-popover);
        opacity: 0;
        transform: scale(0.96);
        transition:
            opacity var(--_duration-fast) var(--_easing-standard),
            transform var(--_duration-fast) var(--_easing-standard),
            display var(--_duration-fast) var(--_easing-standard) allow-discrete,
            overlay var(--_duration-fast) var(--_easing-standard) allow-discrete;
    }

    .tooltip:popover-open {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;

        @starting-style {
            opacity: 0;
            transform: scale(0.96);
        }
    }

    :host([positioning="above"]) .tooltip {
        position-area: block-start center;
        margin-block-end: var(--_tooltip-gap);
        position-try-fallbacks: flip-block;
    }

    :host([positioning="below"]) .tooltip {
        position-area: block-end center;
        margin-block-start: var(--_tooltip-gap);
        position-try-fallbacks: flip-block;
    }

    :host([positioning="before"]) .tooltip {
        position-area: center left;
        margin-inline-end: var(--_tooltip-gap);
        position-try-fallbacks: flip-inline;
    }

    :host([positioning="after"]) .tooltip {
        position-area: center right;
        margin-inline-start: var(--_tooltip-gap);
        position-try-fallbacks: flip-inline;
    }

    @media (forced-colors: active) {
        .tooltip {
            forced-color-adjust: none;
            border: var(--_tooltip-border-width) solid ButtonText;
            background: Canvas;
            box-shadow: none;
        }
    }
`;
const template = html `
    <span class="anchor" part="anchor">
        <slot @slotchange="${x => x.handleSlotChange()}"></slot>
    </span>
    <div
        class="tooltip"
        part="tooltip"
        id="${x => x.tooltipId}"
        role="tooltip"
        popover="hint"
    >
        <slot name="content">${x => x.content}</slot>
    </div>
`;
/**
 * Violet reusable tooltip.
 *
 * @summary Token-driven tooltip using popover="hint" and CSS Anchor Positioning.
 *          Wraps a trigger element (default slot) and shows supplemental text on hover/focus.
 * @slot - Trigger element that the tooltip anchors to.
 * @slot content - Rich tooltip content (alternative to the content attribute).
 * @csspart anchor - The wrapper around the trigger slot that serves as the CSS anchor.
 * @csspart tooltip - The tooltip popup element.
 */
export class VioletTooltip extends FASTElement {
    #showTimeout = null;
    #hideTimeout = null;
    #triggerElement = null;
    #externalAnchor = null;
    #externalListenersAttached = false;
    constructor() {
        super();
        this.content = "";
        this.positioning = "above";
        this.delay = 250;
        this.open = false;
        const id = violetTooltipId;
        violetTooltipId += 1;
        this.tooltipId = `violet-tooltip-${id}`;
    }
    get #tooltipElement() {
        return this.shadowRoot?.querySelector(".tooltip") ?? null;
    }
    get #anchorElement() {
        return this.shadowRoot?.querySelector(".anchor") ?? null;
    }
    connectedCallback() {
        super.connectedCallback();
        const anchorEl = this.#anchorElement;
        if (anchorEl) {
            anchorEl.addEventListener("mouseenter", this.#handleMouseEnter);
            anchorEl.addEventListener("mouseleave", this.#handleMouseLeave);
            anchorEl.addEventListener("focusin", this.#handleFocusIn);
            anchorEl.addEventListener("focusout", this.#handleFocusOut);
        }
        const tooltip = this.#tooltipElement;
        if (tooltip) {
            tooltip.addEventListener("mouseenter", this.#handleTooltipMouseEnter);
            tooltip.addEventListener("mouseleave", this.#handleTooltipMouseLeave);
        }
        this.#resolveExternalAnchor();
        if (this.open) {
            this.#showTooltip();
        }
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this.#clearTimers();
        this.#detachExternalListeners();
    }
    openChanged() {
        if (!this.$fastController.isConnected) {
            return;
        }
        if (this.open) {
            this.#showTooltip();
        }
        else {
            this.#hideTooltip();
        }
    }
    anchorChanged() {
        if (this.$fastController.isConnected) {
            this.#detachExternalListeners();
            this.#resolveExternalAnchor();
        }
    }
    handleSlotChange() {
        const slot = this.shadowRoot?.querySelector("slot:not([name])");
        const assigned = slot?.assignedElements({ flatten: true }) ?? [];
        if (this.#triggerElement instanceof HTMLElement && !this.#externalListenersAttached) {
            this.#triggerElement.removeAttribute("aria-describedby");
        }
        this.#triggerElement = assigned[0] ?? null;
        if (this.#triggerElement) {
            this.#triggerElement.setAttribute("aria-describedby", this.tooltipId);
        }
    }
    #resolveExternalAnchor() {
        if (!this.anchor) {
            return;
        }
        const external = document.getElementById(this.anchor);
        if (!(external instanceof HTMLElement)) {
            return;
        }
        this.#externalAnchor = external;
        this.#triggerElement = external;
        external.style.setProperty("anchor-name", "--violet-tooltip-anchor");
        external.setAttribute("aria-describedby", this.tooltipId);
        external.addEventListener("mouseenter", this.#handleMouseEnter);
        external.addEventListener("mouseleave", this.#handleMouseLeave);
        external.addEventListener("focusin", this.#handleFocusIn);
        external.addEventListener("focusout", this.#handleFocusOut);
        this.#externalListenersAttached = true;
    }
    #detachExternalListeners() {
        if (!this.#externalListenersAttached || !this.#triggerElement || !this.#externalAnchor) {
            return;
        }
        this.#triggerElement.removeEventListener("mouseenter", this.#handleMouseEnter);
        this.#triggerElement.removeEventListener("mouseleave", this.#handleMouseLeave);
        this.#triggerElement.removeEventListener("focusin", this.#handleFocusIn);
        this.#triggerElement.removeEventListener("focusout", this.#handleFocusOut);
        this.#triggerElement.removeAttribute("aria-describedby");
        this.#externalAnchor.style.removeProperty("anchor-name");
        this.#externalAnchor = null;
        this.#externalListenersAttached = false;
    }
    #handleMouseEnter = () => {
        this.#clearTimers();
        this.#showTimeout = setTimeout(() => {
            this.open = true;
        }, this.delay);
    };
    #handleMouseLeave = () => {
        this.#clearTimers();
        this.#hideTimeout = setTimeout(() => {
            this.open = false;
        }, 100);
    };
    #handleTooltipMouseEnter = () => {
        if (this.#hideTimeout) {
            clearTimeout(this.#hideTimeout);
            this.#hideTimeout = null;
        }
    };
    #handleTooltipMouseLeave = () => {
        this.#hideTimeout = setTimeout(() => {
            this.open = false;
        }, 100);
    };
    #handleFocusIn = () => {
        this.#clearTimers();
        this.open = true;
    };
    #handleFocusOut = () => {
        this.#clearTimers();
        this.open = false;
    };
    #showTooltip() {
        const tooltip = this.#tooltipElement;
        if (!tooltip) {
            return;
        }
        try {
            tooltip.showPopover();
        }
        catch {
            // popover="hint" not supported — fall back to manual toggle
            tooltip.toggleAttribute("popover-open", true);
            tooltip.style.display = "block";
        }
    }
    #hideTooltip() {
        const tooltip = this.#tooltipElement;
        if (!tooltip) {
            return;
        }
        try {
            tooltip.hidePopover();
        }
        catch {
            tooltip.removeAttribute("popover-open");
            tooltip.style.display = "";
        }
    }
    #clearTimers() {
        if (this.#showTimeout) {
            clearTimeout(this.#showTimeout);
            this.#showTimeout = null;
        }
        if (this.#hideTimeout) {
            clearTimeout(this.#hideTimeout);
            this.#hideTimeout = null;
        }
    }
}
__decorate([
    observable
], VioletTooltip.prototype, "anchor", void 0);
attr(VioletTooltip.prototype, "content");
attr(VioletTooltip.prototype, "positioning");
attr({ converter: { fromView: (val) => Number.parseInt(val, 10) || 250, toView: (val) => String(val) } })(VioletTooltip.prototype, "delay");
attr({ mode: "boolean" })(VioletTooltip.prototype, "open");
attr(VioletTooltip.prototype, "anchor");
if (!customElements.get("violet-tooltip")) {
    await FASTElement.define(VioletTooltip, {
        name: "violet-tooltip",
        template,
        styles,
    });
}