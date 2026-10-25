var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable } from "@lushly-dev/fast-element";
import { violetActionTokenDefaults } from "../theme/violet-token-defaults";
let violetMenuId = 0;
/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */
const styles = css `
    ${violetActionTokenDefaults}

    :host {
        display: inline-flex;
        vertical-align: middle;
        --_panel-min-inline: var(--violet-menu-min-inline-size, 180px);
        --_panel-max-inline: var(--violet-menu-max-inline-size, 320px);
        --_panel-max-block: var(--violet-menu-max-height, 360px);
        --_panel-padding: var(--violet-menu-padding, var(--_space-sm));
        --_panel-radius: var(--violet-menu-radius, calc(var(--_radius-md) * 2));
        --_panel-gap: var(--violet-menu-gap, var(--_space-sm));
        --_panel-background: var(--violet-menu-background, var(--_surface-card));
        --_panel-shadow: var(--violet-menu-shadow, var(--_shadow-floating));
        --_panel-border-color: var(--violet-menu-border-color, var(--_border-subtle));
    }

    .panel {
        box-sizing: border-box;
        min-inline-size: var(--_panel-min-inline);
        max-inline-size: var(--_panel-max-inline);
        max-block-size: min(var(--_panel-max-block), 80vh);
        overflow-y: auto;
        overscroll-behavior: contain;
        /* Override popover UA defaults (inset:0 margin:auto) */
        inset: unset;
        margin: 0;
        padding: var(--_panel-padding);
        border: thin solid var(--_panel-border-color);
        border-radius: var(--_panel-radius);
        background: var(--_panel-background);
        box-shadow: var(--_panel-shadow);
        color: inherit;
        font-family: inherit;
        font-size: var(--_control-type-size);
        line-height: var(--_type-body-line, 20px);
        z-index: var(--_layer-popover);
    }

    .panel::backdrop {
        background: transparent;
    }

    /* Separator styling for slotted <hr> elements */
    ::slotted(hr) {
        border: none;
        block-size: thin;
        margin-block: var(--_space-sm);
        margin-inline: calc(var(--_space-sm) * 2);
        background: var(--_border-subtle);
    }

    @media (forced-colors: active) {
        .panel {
            forced-color-adjust: none;
            border-color: ButtonText;
            background: Canvas;
            color: ButtonText;
        }
    }
`;
/* ------------------------------------------------------------------ */
/*  Template                                                          */
/* ------------------------------------------------------------------ */
const template = html `
    <slot
        name="trigger"
        @click="${x => x.handleTriggerClick()}"
        @keydown="${(x, c) => x.handleTriggerKeydown(c.event)}"
    ></slot>
    <div
        class="panel"
        part="panel"
        id="${x => x.panelId}"
        popover="auto"
        role="menu"
        aria-label="${x => x.label || null}"
        @keydown="${(x, c) => x.handlePanelKeydown(c.event)}"
        @toggle="${(x, c) => x.handleToggle(c.event)}"
    >
        <slot @slotchange="${x => x.handleItemsSlotChange()}"></slot>
    </div>
`;
/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
/**
 * Violet reusable menu primitive.
 *
 * Combines a trigger button (slotted) with a floating action menu panel.
 * Uses the native HTML Popover API for light dismiss, Escape handling,
 * top-layer rendering, and focus return. CSS Anchor Positioning places
 * the panel relative to the trigger with automatic flip fallbacks.
 * Full WAI-ARIA APG Menu Button keyboard navigation is implemented.
 *
 * @summary Token-driven action menu with popover, anchor positioning, and full keyboard support.
 * @fires open-change - Emitted when the menu opens or closes. Detail: `{ open: boolean }`.
 * @slot trigger - The button element that toggles the menu. Must be a focusable element.
 * @slot - Menu content: `<violet-menu-item>` elements and optional `<hr>` separators.
 * @csspart panel - Floating menu panel container.
 */
export class VioletMenu extends FASTElement {
    #id;
    #activeIndex = -1;
    #searchBuffer = "";
    #searchTimer = 0;
    constructor() {
        super();
        this.#id = violetMenuId;
        violetMenuId += 1;
        this.panelId = `violet-menu-panel-${this.#id}`;
        this.open = false;
        this.label = "";
    }
    /* -------------------------------------------------------------- */
    /*  Lifecycle                                                     */
    /* -------------------------------------------------------------- */
    connectedCallback() {
        super.connectedCallback();
        this.#syncTriggerAria();
    }
    /* -------------------------------------------------------------- */
    /*  Public API                                                    */
    /* -------------------------------------------------------------- */
    /**
     * Toggle the menu open/closed.
     */
    toggle() {
        this.#panel?.togglePopover();
    }
    /**
     * Show the menu.
     */
    show() {
        this.#panel?.showPopover();
    }
    /**
     * Hide the menu.
     */
    hide() {
        if (this.#panel?.matches(":popover-open")) {
            this.#panel.hidePopover();
        }
    }
    /* -------------------------------------------------------------- */
    /*  Event handlers                                                */
    /* -------------------------------------------------------------- */
    /**
     * Handles click on the trigger slot. Toggles the menu.
     */
    handleTriggerClick() {
        this.#panel?.togglePopover();
    }
    /**
     * Handles keydown on the trigger. Opens the menu with arrow keys.
     */
    handleTriggerKeydown(event) {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                this.#openAndFocus("first");
                break;
            case "ArrowUp":
                event.preventDefault();
                this.#openAndFocus("last");
                break;
        }
    }
    /**
     * Handles keydown inside the menu panel.
     */
    handlePanelKeydown(event) {
        const items = this.#items;
        if (items.length === 0) {
            return;
        }
        switch (event.key) {
            case "ArrowDown": {
                event.preventDefault();
                this.#focusItem(this.#nextIndex(this.#activeIndex, 1, items));
                break;
            }
            case "ArrowUp": {
                event.preventDefault();
                this.#focusItem(this.#nextIndex(this.#activeIndex, -1, items));
                break;
            }
            case "Home": {
                event.preventDefault();
                this.#focusItem(0);
                break;
            }
            case "End": {
                event.preventDefault();
                this.#focusItem(items.length - 1);
                break;
            }
            case "Enter":
            case " ": {
                event.preventDefault();
                const active = items[this.#activeIndex];
                if (active && !active.disabled) {
                    active.$emit("invoke");
                    this.hide();
                }
                break;
            }
            case "Escape": {
                event.preventDefault();
                this.hide();
                this.#trigger?.focus();
                break;
            }
            case "Tab": {
                // Let Tab close the menu and move focus naturally.
                // Don't prevent default.
                this.hide();
                break;
            }
            default: {
                // Type-ahead: single printable character
                if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    this.#handleTypeAhead(event.key, items);
                }
                break;
            }
        }
    }
    /**
     * Handles the native popover `toggle` event.
     */
    handleToggle(event) {
        const isOpen = event.newState === "open";
        this.open = isOpen;
        if (isOpen) {
            this.#positionPanel();
            // Focus first item on next frame so the panel is rendered
            requestAnimationFrame(() => this.#focusItem(0));
        }
        else {
            this.#activeIndex = -1;
            this.#clearTypeAhead();
        }
        this.#syncTriggerAria();
        this.$emit("open-change", { open: isOpen });
    }
    /**
     * Handles slotchange on the default slot (menu items).
     */
    handleItemsSlotChange() {
        this.#wireItemEvents();
    }
    /* -------------------------------------------------------------- */
    /*  Property change handlers                                      */
    /* -------------------------------------------------------------- */
    openChanged() {
        if (!this.$fastController.isConnected) {
            return;
        }
        const panel = this.#panel;
        if (!panel) {
            return;
        }
        const isCurrentlyOpen = panel.matches(":popover-open");
        if (this.open && !isCurrentlyOpen) {
            panel.showPopover();
        }
        else if (!this.open && isCurrentlyOpen) {
            panel.hidePopover();
        }
        this.#syncTriggerAria();
    }
    /* -------------------------------------------------------------- */
    /*  Private helpers                                                */
    /* -------------------------------------------------------------- */
    get #panel() {
        return this.shadowRoot?.querySelector(".panel") ?? null;
    }
    get #trigger() {
        const slot = this.shadowRoot?.querySelector('slot[name="trigger"]');
        const assigned = slot?.assignedElements({ flatten: true }) ?? [];
        return assigned[0] ?? null;
    }
    /**
     * Returns all `violet-menu-item` children (including disabled, per APG).
     */
    get #items() {
        return Array.from(this.querySelectorAll("violet-menu-item"));
    }
    /**
     * Positions the panel below (or above) the trigger using fixed coordinates.
     */
    #positionPanel() {
        const panel = this.#panel;
        if (!panel) {
            return;
        }
        const rect = (this.#trigger ?? this).getBoundingClientRect();
        const gap = Number.parseFloat(getComputedStyle(this).getPropertyValue("--_panel-gap")) || 4;
        panel.style.position = "fixed";
        panel.style.top = `${rect.bottom + gap}px`;
        panel.style.left = `${rect.left}px`;
        // Flip if overflowing viewport
        requestAnimationFrame(() => {
            const panelRect = panel.getBoundingClientRect();
            if (panelRect.bottom > window.innerHeight) {
                panel.style.top = `${rect.top - panelRect.height - gap}px`;
            }
            if (panelRect.right > window.innerWidth) {
                panel.style.left = `${rect.right - panelRect.width}px`;
            }
        });
    }
    /**
     * Syncs aria-haspopup and aria-expanded on the trigger element.
     */
    #syncTriggerAria() {
        const trigger = this.#trigger;
        if (!trigger) {
            return;
        }
        trigger.setAttribute("aria-haspopup", "menu");
        trigger.setAttribute("aria-expanded", String(this.open));
        trigger.setAttribute("aria-controls", this.panelId);
    }
    /**
     * Opens the menu and focuses the first or last item.
     */
    #openAndFocus(position) {
        const panel = this.#panel;
        if (!panel || panel.matches(":popover-open")) {
            return;
        }
        panel.showPopover();
        // Focus after the toggle event fires and panel renders
        requestAnimationFrame(() => {
            const items = this.#items;
            if (items.length === 0) {
                return;
            }
            this.#focusItem(position === "first" ? 0 : items.length - 1);
        });
    }
    /**
     * Moves focus to the item at the given index.
     */
    #focusItem(index) {
        const items = this.#items;
        if (index < 0 || index >= items.length) {
            return;
        }
        this.#activeIndex = index;
        items[index]?.focus();
    }
    /**
     * Returns the next valid index in the given direction (wrapping).
     */
    #nextIndex(current, direction, items) {
        const len = items.length;
        if (len === 0) {
            return -1;
        }
        let next = current + direction;
        if (next < 0) {
            next = len - 1;
        }
        else if (next >= len) {
            next = 0;
        }
        return next;
    }
    /**
     * Type-ahead: matches items by their label text.
     * Characters typed within 500ms are buffered together.
     */
    #handleTypeAhead(char, items) {
        if (this.#searchTimer) {
            clearTimeout(this.#searchTimer);
        }
        this.#searchBuffer += char.toLowerCase();
        this.#searchTimer = window.setTimeout(() => {
            this.#clearTypeAhead();
        }, 500);
        const startIndex = this.#activeIndex + 1;
        for (let i = 0; i < items.length; i++) {
            const index = (startIndex + i) % items.length;
            const item = items[index];
            if (item && item.labelText.toLowerCase().startsWith(this.#searchBuffer)) {
                this.#focusItem(index);
                return;
            }
        }
    }
    #clearTypeAhead() {
        this.#searchBuffer = "";
        if (this.#searchTimer) {
            clearTimeout(this.#searchTimer);
            this.#searchTimer = 0;
        }
    }
    /**
     * Listens for `invoke` events from menu items to auto-close.
     */
    #wireItemEvents() {
        for (const item of this.#items) {
            // Remove previous listener to avoid duplicates
            item.removeEventListener("invoke", this.#handleItemInvoke);
            item.addEventListener("invoke", this.#handleItemInvoke);
        }
    }
    #handleItemInvoke = () => {
        // Preserve a destination opened by the action (for example a dialog),
        // but return menu focus to its trigger when the action stays in place.
        const root = this.getRootNode();
        const restoreTrigger = this.contains(root.activeElement) || this.matches(":focus-within");
        this.hide();
        if (restoreTrigger) {
            this.#trigger?.focus();
        }
    };
}
__decorate([
    observable
], VioletMenu.prototype, "open", void 0);
attr(VioletMenu.prototype, "label");
if (!customElements.get("violet-menu")) {
    await FASTElement.define(VioletMenu, {
        name: "violet-menu",
        template,
        styles,
    });
}