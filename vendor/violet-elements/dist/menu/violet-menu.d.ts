import { FASTElement } from "@lushly-dev/fast-element";
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
export declare class VioletMenu extends FASTElement {
    #private;
    /**
     * Whether the menu is currently open.
     */
    open: boolean;
    /**
     * Accessible label for the menu panel. Falls back to the trigger's
     * text content when not set.
     */
    label: string;
    /**
     * Unique ID for the menu panel, used for anchor positioning.
     */
    readonly panelId: string;
    constructor();
    connectedCallback(): void;
    /**
     * Toggle the menu open/closed.
     */
    toggle(): void;
    /**
     * Show the menu.
     */
    show(): void;
    /**
     * Hide the menu.
     */
    hide(): void;
    /**
     * Handles click on the trigger slot. Toggles the menu.
     */
    handleTriggerClick(): void;
    /**
     * Handles keydown on the trigger. Opens the menu with arrow keys.
     */
    handleTriggerKeydown(event: KeyboardEvent): void;
    /**
     * Handles keydown inside the menu panel.
     */
    handlePanelKeydown(event: KeyboardEvent): void;
    /**
     * Handles the native popover `toggle` event.
     */
    handleToggle(event: ToggleEvent): void;
    /**
     * Handles slotchange on the default slot (menu items).
     */
    handleItemsSlotChange(): void;
    openChanged(): void;
}