import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet reusable menu item primitive.
 *
 * @summary Token-driven menu item with leading/trailing slot support and disabled state.
 * @fires invoke - Emitted when the item is activated (click, Enter, or Space). Not fired when disabled.
 * @slot before - Leading inline content such as an icon.
 * @slot - Item label content.
 * @slot after - Trailing inline content such as a keyboard shortcut hint.
 * @csspart control - Interactive menuitem element.
 * @csspart before - Leading slot wrapper.
 * @csspart label - Inline label wrapper.
 * @csspart after - Trailing slot wrapper.
 */
export declare class VioletMenuItem extends FASTElement {
    /**
     * Disables the menu item. Disabled items remain focusable per WAI-ARIA APG
     * but cannot be activated.
     */
    disabled: boolean;
    constructor();
    /**
     * Handles click on the item. Emits `invoke` unless disabled.
     */
    handleClick(event: Event): void;
    /**
     * Returns the trimmed text content of this item for type-ahead matching.
     */
    get labelText(): string;
}