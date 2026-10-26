import { FASTElement } from "@lushly-dev/fast-element";
import "../tree-item/violet-tree-item";
import { VioletTreeItem } from "../tree-item/violet-tree-item";
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
export declare class VioletTree extends FASTElement {
    #private;
    rootItems: VioletTreeItem[];
    label: string;
    supportingText: string;
    errorText: string;
    value: string;
    ariaLabel: string;
    appearance: "plain" | "framed";
    constructor();
    get labelId(): string;
    get supportingTextId(): string;
    get errorTextId(): string;
    get describedBy(): string | null;
    connectedCallback(): void;
    disconnectedCallback(): void;
    valueChanged(): void;
    handleSlotChange(): void;
    handleSelectRequest(event: CustomEvent<{
        value: string;
    }>): void;
    handleToggleRequest(event: CustomEvent<{
        expanded: boolean;
    }>): void;
    handleFocusIn(event: FocusEvent): void;
    handleKeydown(event: KeyboardEvent): void;
}