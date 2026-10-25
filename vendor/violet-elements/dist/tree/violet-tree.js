var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable, when } from "@lushly-dev/fast-element";
import "../tree-item/violet-tree-item";
import { violetFieldTokenDefaults } from "../theme/violet-token-defaults";
let violetTreeId = 0;
function isTreeItemElement(value) {
    return value instanceof HTMLElement && value.tagName.toLowerCase() === "violet-tree-item";
}
function getTreeChildItems(item) {
    return Array.isArray(item.childItems) ? item.childItems : [];
}
const styles = css `
    ${violetFieldTokenDefaults}

    :host {
        display: grid;

        --_tree-surface-padding: var(--violet-tree-surface-padding, var(--_space-stack-xs));
        --_tree-surface-radius: var(--violet-tree-surface-radius, calc(var(--_radius-md) * 2));
        --_tree-surface-background: var(--violet-tree-surface-background, var(--_surface-card));
        --_tree-surface-border: var(--violet-tree-surface-border, var(--_border-subtle));
    }

    .field {
        display: grid;
        gap: 0;
        min-inline-size: 0;
    }

    .label {
        color: var(--_text-secondary);
        font-size: var(--_control-label-size);
        font-weight: var(--_type-label-weight);
        line-height: var(--_type-label-line);
        margin-block-end: var(--_space-stack-2xs);
    }

    .surface {
        min-inline-size: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
    }

    :host([appearance="framed"]) .surface {
        padding: var(--_tree-surface-padding);
        border: 1px solid var(--_tree-surface-border);
        border-radius: var(--_tree-surface-radius);
        background: var(--_tree-surface-background);
        box-shadow: var(--_shadow-control);
    }

    .tree {
        display: grid;
        gap: 0;
        outline: none;
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
        .surface {
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
                <div class="label" part="label" id="${x => x.labelId}">${x => x.label}</div>
            `)}
        <div class="surface" part="surface">
            <div
                class="tree"
                part="tree"
                role="tree"
                aria-label="${x => (x.label ? null : x.ariaLabel)}"
                aria-labelledby="${x => (x.label ? x.labelId : null)}"
                aria-describedby="${x => x.describedBy}"
            >
                <slot @slotchange="${x => x.handleSlotChange()}"></slot>
            </div>
        </div>
        ${when(x => Boolean(x.supportingText), html `
                <p class="supporting" part="supporting-text" id="${x => x.supportingTextId}">
                    ${x => x.supportingText}
                </p>
            `)}
        ${when(x => Boolean(x.errorText), html `
                <p class="error" part="error-text" id="${x => x.errorTextId}">
                    ${x => x.errorText}
                </p>
            `)}
    </div>
`;
/**
 * Violet tree primitive.
 *
 * @summary Single-selection treeview with nested `violet-tree-item` children, roving focus, and APG-style keyboard support.
 * @fires change - Emitted when the selected item changes.
 * @slot - Root `violet-tree-item` elements.
 * @csspart field - Outer field wrapper.
 * @csspart label - Optional label element.
 * @csspart surface - Bordered tree surface.
 * @csspart tree - Internal treeview container.
 * @csspart supporting-text - Supporting text element.
 * @csspart error-text - Error text element.
 */
export class VioletTree extends FASTElement {
    #id;
    #activeItem = null;
    #searchBuffer = "";
    #searchTimer = 0;
    #syncingValue = false;
    constructor() {
        super();
        this.#id = violetTreeId;
        violetTreeId += 1;
        this.rootItems = [];
        this.label = "";
        this.supportingText = "";
        this.errorText = "";
        this.value = "";
        this.ariaLabel = "Tree";
        this.appearance = "plain";
    }
    get labelId() {
        return `violet-tree-label-${this.#id}`;
    }
    get supportingTextId() {
        return `violet-tree-supporting-${this.#id}`;
    }
    get errorTextId() {
        return `violet-tree-error-${this.#id}`;
    }
    get describedBy() {
        const ids = [this.supportingText ? this.supportingTextId : "", this.errorText ? this.errorTextId : ""].filter(Boolean);
        return ids.length ? ids.join(" ") : null;
    }
    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("select-request", this.handleSelectRequest);
        this.addEventListener("toggle-request", this.handleToggleRequest);
        this.addEventListener("keydown", this.handleKeydown);
        this.addEventListener("focusin", this.handleFocusIn);
        queueMicrotask(() => {
            this.handleSlotChange();
        });
    }
    disconnectedCallback() {
        this.removeEventListener("select-request", this.handleSelectRequest);
        this.removeEventListener("toggle-request", this.handleToggleRequest);
        this.removeEventListener("keydown", this.handleKeydown);
        this.removeEventListener("focusin", this.handleFocusIn);
        window.clearTimeout(this.#searchTimer);
        super.disconnectedCallback();
    }
    valueChanged() {
        if (this.#syncingValue) {
            return;
        }
        const match = this.#allItems().find(item => item.resolvedValue === this.value) ?? null;
        this.#applySelection(match, false);
        this.#syncTreeState();
    }
    handleSlotChange() {
        this.rootItems = this.#ownedRootItems();
        for (const item of this.rootItems) {
            item.syncStructureFromDom();
        }
        const allItems = this.#allItems();
        const selectedItem = this.value
            ? allItems.find(item => item.resolvedValue === this.value) ?? null
            : allItems.find(item => item.selected) ?? null;
        if (selectedItem) {
            this.#applySelection(selectedItem, false);
        }
        else if (allItems.length > 0) {
            this.#applySelection(null, false);
        }
        this.#syncTreeState();
    }
    handleSelectRequest(event) {
        const item = this.#itemFromEvent(event);
        if (!item || item.disabled) {
            return;
        }
        this.#setActiveItem(item, true);
        this.#applySelection(item, true);
        this.#syncTreeState();
    }
    handleToggleRequest(event) {
        const item = this.#itemFromEvent(event);
        if (!item || item.disabled || !item.hasChildren) {
            return;
        }
        item.expanded = event.detail?.expanded ?? !item.expanded;
        this.#setActiveItem(item, true);
        this.#syncTreeState();
    }
    handleFocusIn(event) {
        const item = this.#itemFromEvent(event);
        if (!item || item.disabled) {
            return;
        }
        this.#setActiveItem(item, false);
    }
    handleKeydown(event) {
        const item = this.#itemFromEvent(event) ?? this.#activeItem ?? this.#visibleItems()[0] ?? null;
        if (!item) {
            return;
        }
        const visibleItems = this.#visibleItems();
        const currentIndex = visibleItems.indexOf(item);
        switch (event.key) {
            case "ArrowDown": {
                const next = visibleItems[currentIndex + 1];
                if (!next) {
                    return;
                }
                event.preventDefault();
                this.#setActiveItem(next, true);
                break;
            }
            case "ArrowUp": {
                const previous = visibleItems[currentIndex - 1];
                if (!previous) {
                    return;
                }
                event.preventDefault();
                this.#setActiveItem(previous, true);
                break;
            }
            case "ArrowRight": {
                event.preventDefault();
                if (item.hasChildren && !item.expanded) {
                    item.expanded = true;
                    this.#syncTreeState();
                    return;
                }
                if (item.hasChildren && item.expanded) {
                    const firstChild = item.childItems[0];
                    if (firstChild) {
                        this.#setActiveItem(firstChild, true);
                    }
                }
                break;
            }
            case "ArrowLeft": {
                event.preventDefault();
                if (item.hasChildren && item.expanded) {
                    item.expanded = false;
                    this.#syncTreeState();
                    return;
                }
                const parent = item.parentItem;
                if (parent) {
                    this.#setActiveItem(parent, true);
                }
                break;
            }
            case "Home": {
                event.preventDefault();
                const first = visibleItems[0];
                if (first) {
                    this.#setActiveItem(first, true);
                }
                break;
            }
            case "End": {
                event.preventDefault();
                const last = visibleItems.at(-1);
                if (last) {
                    this.#setActiveItem(last, true);
                }
                break;
            }
            case "Enter":
            case " ": {
                event.preventDefault();
                this.#applySelection(item, true);
                this.#syncTreeState();
                break;
            }
            default: {
                if (event.altKey || event.ctrlKey || event.metaKey || event.key.length !== 1) {
                    return;
                }
                this.#handleTypeahead(event.key, item);
                break;
            }
        }
    }
    #ownedRootItems() {
        const slot = this.shadowRoot?.querySelector("slot");
        return (slot?.assignedElements() ?? []).filter(isTreeItemElement);
    }
    #allItems() {
        const all = [];
        const visit = (items) => {
            for (const item of items) {
                all.push(item);
                const childItems = getTreeChildItems(item);
                if (childItems.length > 0) {
                    visit(childItems);
                }
            }
        };
        visit(this.rootItems);
        return all;
    }
    #visibleItems() {
        const visible = [];
        const visit = (items) => {
            for (const item of items) {
                visible.push(item);
                const childItems = getTreeChildItems(item);
                if (item.expanded && childItems.length > 0) {
                    visit(childItems);
                }
            }
        };
        visit(this.rootItems);
        return visible;
    }
    #syncTreeState() {
        const walk = (items, level) => {
            items.forEach((item, index) => {
                item.setTreePosition(level, index + 1, items.length);
                const childItems = getTreeChildItems(item);
                if (childItems.length > 0) {
                    walk(childItems, level + 1);
                }
            });
        };
        walk(this.rootItems, 1);
        const visibleItems = this.#visibleItems();
        const selectedItem = this.#allItems().find(item => item.selected) ?? null;
        if (!this.#activeItem || !visibleItems.includes(this.#activeItem)) {
            this.#activeItem = selectedItem && visibleItems.includes(selectedItem) ? selectedItem : visibleItems[0] ?? null;
        }
        const allItems = this.#allItems();
        for (const item of allItems) {
            item.setActiveFromTree(item === this.#activeItem);
        }
    }
    #setActiveItem(item, focus) {
        this.#activeItem = item;
        for (const candidate of this.#allItems()) {
            candidate.setActiveFromTree(candidate === item);
        }
        if (focus) {
            item.focusItem();
        }
    }
    #applySelection(item, emit) {
        const allItems = this.#allItems();
        const selectedItem = item && !item.disabled ? item : null;
        for (const candidate of allItems) {
            candidate.selected = candidate === selectedItem;
        }
        this.#syncingValue = true;
        this.value = selectedItem?.resolvedValue ?? "";
        this.#syncingValue = false;
        if (emit && selectedItem) {
            this.$emit("change", {
                value: selectedItem.resolvedValue,
                itemId: selectedItem.id,
            });
        }
    }
    #itemFromEvent(event) {
        const item = event.composedPath().find(isTreeItemElement);
        return item ?? null;
    }
    #handleTypeahead(fragment, currentItem) {
        const visibleItems = this.#visibleItems();
        if (visibleItems.length === 0) {
            return;
        }
        this.#searchBuffer += fragment.toLowerCase();
        window.clearTimeout(this.#searchTimer);
        this.#searchTimer = window.setTimeout(() => {
            this.#searchBuffer = "";
        }, 400);
        const startIndex = Math.max(visibleItems.indexOf(currentItem), 0);
        for (let offset = 1; offset <= visibleItems.length; offset += 1) {
            const candidate = visibleItems[(startIndex + offset) % visibleItems.length];
            if (candidate.textLabel.toLowerCase().startsWith(this.#searchBuffer)) {
                this.#setActiveItem(candidate, true);
                return;
            }
        }
    }
}
__decorate([
    observable
], VioletTree.prototype, "rootItems", void 0);
attr(VioletTree.prototype, "label");
attr({ attribute: "supporting-text" })(VioletTree.prototype, "supportingText");
attr({ attribute: "error-text" })(VioletTree.prototype, "errorText");
attr(VioletTree.prototype, "value");
attr({ attribute: "aria-label" })(VioletTree.prototype, "ariaLabel");
attr(VioletTree.prototype, "appearance");
if (!customElements.get("violet-tree")) {
    await FASTElement.define(VioletTree, {
        name: "violet-tree",
        template,
        styles,
    });
}