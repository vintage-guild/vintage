var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable } from "@lushly-dev/fast-element";
import "../breadcrumb-item/violet-breadcrumb-item";
import { violetSurfaceTokenDefaults } from "../theme/violet-token-defaults";
const styles = css `
    ${violetSurfaceTokenDefaults}

    :host {
        display: block;
    }

    .nav {
        display: block;
    }

    .list {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0;
        margin: 0;
        padding: 0;
        list-style: none;
    }
`;
const template = html `
    <nav class="nav" part="nav" aria-label="${x => x.label || "Breadcrumb"}">
        <div class="list" part="list" role="list">
            <slot @slotchange="${x => x.handleSlotChange()}"></slot>
        </div>
    </nav>
`;
/**
 * Violet breadcrumb container.
 *
 * @summary Labeled breadcrumb navigation surface that renders slotted `violet-breadcrumb-item` elements.
 * @slot - `violet-breadcrumb-item` elements.
 * @csspart nav - Breadcrumb navigation wrapper.
 * @csspart list - Ordered list wrapper.
 */
export class VioletBreadcrumb extends FASTElement {
    constructor() {
        super();
        this.items = [];
    }
    connectedCallback() {
        super.connectedCallback();
        this.#syncAccessibility();
        this.handleSlotChange();
    }
    handleSlotChange() {
        this.items = this.#ownedItems();
        this.#normalizeCurrentItem();
    }
    labelChanged() {
        this.#syncAccessibility();
    }
    #ownedItems() {
        return Array.from(this.querySelectorAll("violet-breadcrumb-item")).filter(item => item.closest("violet-breadcrumb") === this);
    }
    #normalizeCurrentItem() {
        const explicitCurrentItems = this.items.filter(item => item.current);
        const currentItem = explicitCurrentItems[explicitCurrentItems.length - 1] ?? this.items[this.items.length - 1] ?? null;
        this.items.forEach(item => {
            item.current = item === currentItem;
        });
    }
    #syncAccessibility() {
        this.ariaLabel = this.label || "Breadcrumb";
    }
}
__decorate([
    observable
], VioletBreadcrumb.prototype, "items", void 0);
attr(VioletBreadcrumb.prototype, "label");
if (!customElements.get("violet-breadcrumb")) {
    await FASTElement.define(VioletBreadcrumb, {
        name: "violet-breadcrumb",
        template,
        styles,
    });
}