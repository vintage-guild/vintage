import { FASTElement } from "@lushly-dev/fast-element";
import "../accordion-item/violet-accordion-item";
/**
 * Violet accordion container.
 *
 * @summary Grouped disclosure control that coordinates one or more `violet-accordion-item` children.
 * @fires change - Emitted when an item's expanded state changes.
 * @slot - `violet-accordion-item` elements.
 * @csspart root - Root wrapper around the slotted items.
 */
export declare class VioletAccordion extends FASTElement {
    slottedItems: HTMLElement[];
    expandMode: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    handleSlotChange(): void;
    handleToggleRequest(event: CustomEvent<{
        expanded: boolean;
    }>): void;
    handleKeydown(event: KeyboardEvent): void;
    private get items();
    private syncItems;
}