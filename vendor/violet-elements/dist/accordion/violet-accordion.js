var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable } from "@lushly-dev/fast-element";
import "../accordion-item/violet-accordion-item";
import { violetSurfaceTokenDefaults } from "../theme/violet-token-defaults";
const styles = css `
    ${violetSurfaceTokenDefaults}

    :host {
        display: block;
    }

    .root {
        display: block;
    }
`;
const template = html `
    <div class="root" part="root" @keydown="${(x, c) => x.handleKeydown(c.event)}">
        <slot @slotchange="${x => x.handleSlotChange()}"></slot>
    </div>
`;
/**
 * Violet accordion container.
 *
 * @summary Grouped disclosure control that coordinates one or more `violet-accordion-item` children.
 * @fires change - Emitted when an item's expanded state changes.
 * @slot - `violet-accordion-item` elements.
 * @csspart root - Root wrapper around the slotted items.
 */
export class VioletAccordion extends FASTElement {
    constructor() {
        super();
        this.slottedItems = [];
        this.expandMode = "multi";
    }
    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("toggle-request", this.handleToggleRequest);
        this.syncItems();
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener("toggle-request", this.handleToggleRequest);
    }
    handleSlotChange() {
        const slot = this.shadowRoot?.querySelector("slot");
        this.slottedItems = slot?.assignedElements({ flatten: true }) ?? [];
        this.syncItems();
    }
    handleToggleRequest(event) {
        const item = event.target;
        if (!(item instanceof HTMLElement) || !this.items.includes(item)) {
            return;
        }
        const nextExpanded = event.detail?.expanded ?? !item.hasAttribute("expanded");
        if (this.expandMode === "single" && nextExpanded) {
            for (const sibling of this.items) {
                if (sibling !== item) {
                    sibling.expanded = false;
                }
            }
        }
        item.expanded = nextExpanded;
        this.$emit("change", {
            item,
            expanded: nextExpanded,
        });
    }
    handleKeydown(event) {
        const currentItem = event.composedPath().find(value => value instanceof HTMLElement && value.tagName.toLowerCase() === "violet-accordion-item");
        if (!currentItem) {
            return;
        }
        const enabledItems = this.items.filter(item => !item.disabled);
        const currentIndex = enabledItems.indexOf(currentItem);
        if (currentIndex < 0) {
            return;
        }
        switch (event.key) {
            case "ArrowDown":
            case "ArrowRight": {
                event.preventDefault();
                enabledItems[(currentIndex + 1) % enabledItems.length]?.focusTrigger();
                break;
            }
            case "ArrowUp":
            case "ArrowLeft": {
                event.preventDefault();
                enabledItems[(currentIndex - 1 + enabledItems.length) % enabledItems.length]?.focusTrigger();
                break;
            }
            case "Home": {
                event.preventDefault();
                enabledItems[0]?.focusTrigger();
                break;
            }
            case "End": {
                event.preventDefault();
                enabledItems.at(-1)?.focusTrigger();
                break;
            }
        }
    }
    get items() {
        return Array.from(this.querySelectorAll("violet-accordion-item")).filter(item => item.closest("violet-accordion") === this);
    }
    syncItems() {
        const items = this.items;
        if (this.expandMode === "single") {
            const expandedItems = items.filter(item => item.expanded);
            expandedItems.slice(1).forEach(item => {
                item.expanded = false;
            });
        }
    }
}
__decorate([
    observable
], VioletAccordion.prototype, "slottedItems", void 0);
attr({ attribute: "expand-mode" })(VioletAccordion.prototype, "expandMode");
if (!customElements.get("violet-accordion")) {
    await FASTElement.define(VioletAccordion, {
        name: "violet-accordion",
        template,
        styles,
    });
}