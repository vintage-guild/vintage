/**
 * ConfirmDialog component for command safety confirmations.
 * Modal dialog for confirming destructive actions.
 *
 * @remarks
 * Provides an accessible modal dialog with:
 * - open/prompt attributes for state management
 * - confirm/cancel events for user response
 * - Full ARIA support (role, aria-modal, aria-labelledby, aria-describedby)
 * - Focus trap to keep keyboard navigation within dialog
 * - Escape key to cancel
 *
 * @example
 * ```html
 * <fast-af-confirm-dialog
 *   open
 *   prompt="Are you sure you want to delete this item?"
 *   @confirm=${handleConfirm}
 *   @cancel=${handleCancel}
 * ></fast-af-confirm-dialog>
 * ```
 */
import { FASTElement } from "../../components/fast-element.js";
/**
 * A modal dialog component for confirming destructive actions.
 *
 * Events: `confirm` is dispatched when the user confirms; `cancel` is dispatched
 * when the user cancels, presses Escape, or clicks the overlay.
 *
 * Slots: the default slot supplies additional content; `title`, `cancel-text`, and
 * `confirm-text` replace their corresponding labels.
 *
 * CSS parts: `overlay`, `dialog`, `title`, `prompt`, `actions`, `cancel-button`, and
 * `confirm-button`.
 *
 * @internal
 */
export declare class ConfirmDialog extends FASTElement {
    /**
     * Whether the dialog is open/visible.
     * @public
     */
    open: boolean;
    /**
     * The prompt message to display in the dialog.
     * @public
     */
    prompt: string;
    /**
     * Reference to the previously focused element for restoring focus on close.
     * @internal
     */
    private previouslyFocused;
    /**
     * List of focusable elements within the dialog for focus trapping.
     * @internal
     */
    private focusableElements;
    /**
     * Called when the open attribute changes.
     * Manages focus trap and body scroll lock.
     * @param oldValue - Previous value
     * @param newValue - New value
     */
    openChanged(oldValue: boolean, newValue: boolean): void;
    /**
     * Sets up focus trap within the dialog.
     * @internal
     */
    private trapFocus;
    /**
     * Handles keydown events for focus trap and escape key.
     * @param event - The keyboard event
     * @internal
     */
    handleKeydown(event: KeyboardEvent): void;
    /**
     * Handles tab key for focus trapping.
     * @param event - The keyboard event
     * @internal
     */
    private handleTabKey;
    /**
     * Handles overlay click to cancel.
     * @param event - The mouse event
     * @internal
     */
    handleOverlayClick(event: MouseEvent): void;
    /**
     * Handles confirm button click.
     * Emits 'confirm' event and closes the dialog.
     * @public
     */
    handleConfirm(): void;
    /**
     * Handles cancel button click.
     * Emits 'cancel' event and closes the dialog.
     * @public
     */
    handleCancel(): void;
}
/**
 * The namespaced tag used by the opt-in confirmation dialog.
 * @public
 */
export declare const confirmDialogTagName: "fast-af-confirm-dialog";
/**
 * Defines the confirmation dialog in the provided registry.
 *
 * @remarks
 * Registration is explicit so importing the command API remains side-effect free.
 * Repeated calls for the same registry are safe.
 *
 * @param registry - Registry in which to define the dialog.
 * @public
 */
export declare function defineConfirmDialog(registry?: CustomElementRegistry): Promise<void>;
