import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
/**
 * Violet tree item primitive.
 *
 * @summary Focusable tree item with optional nested child items, selection, and expansion state.
 * @fires select-request - Emitted when the item requests selection.
 * @fires toggle-request - Emitted when the item requests an expansion change.
 * @slot - Primary item label.
 * @slot start - Optional leading visual such as an icon.
 * @slot meta - Optional trailing metadata.
 * @slot item - Nested `violet-tree-item` descendants; usually assigned automatically.
 * @csspart row - Interactive row surface.
 * @csspart toggle - Expansion indicator region.
 * @csspart toggle-icon - Icon inside the expansion indicator region.
 * @csspart label - Main label wrapper.
 * @csspart meta - Trailing metadata wrapper.
 * @csspart group - Child item group container.
 */
export declare class VioletTreeItem extends FASTElement {
    #private;
    childItems: VioletTreeItem[];
    expanded: boolean;
    selected: boolean;
    disabled: boolean;
    value: string;
    labelSlot: HTMLSlotElement;
    itemSlot: HTMLSlotElement;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    expandedChanged(): void;
    selectedChanged(): void;
    disabledChanged(): void;
    childItemsChanged(): void;
    get hasChildren(): boolean;
    get parentItem(): VioletTreeItem | null;
    get resolvedValue(): string;
    get textLabel(): string;
    focusItem(): void;
    setActiveFromTree(active: boolean): void;
    setTreePosition(level: number, posInSet: number, setSize: number): void;
    refreshNestingSlot(): void;
    handleItemSlotChange(): void;
    syncStructureFromDom(): void;
    handleRowClick(event: MouseEvent): void;
}