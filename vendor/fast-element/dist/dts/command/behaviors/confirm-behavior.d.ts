/**
 * ConfirmBehavior - Intercepts destructive commands and prompts for confirmation.
 *
 * @remarks
 * Uses the CommandRegistry interceptor API to intercept commands marked with
 * `destructive: true`. Exposes pending confirmation state for UI rendering.
 *
 * @example
 * ```typescript
 * import { ConfirmBehavior } from '@lushly-dev/fast-element/command.js';
 *
 * class MyApp extends FASTElement {
 *   private confirmBehavior = new ConfirmBehavior();
 *
 *   connectedCallback() {
 *     super.connectedCallback();
 *     this.$fastController.addBehavior(this.confirmBehavior);
 *   }
 *
 *   // In template:
 *   // <fast-af-confirm-dialog
 *   //   :open="${x => x.confirmBehavior.pendingConfirmation !== null}"
 *   //   :prompt="${x => x.confirmBehavior.pendingConfirmation?.prompt}"
 *   //   @confirm="${x => x.confirmBehavior.executeConfirmed()}"
 *   //   @cancel="${x => x.confirmBehavior.cancelPending()}">
 *   // </fast-af-confirm-dialog>
 * }
 * ```
 *
 * @public
 */
import type { CommandHostController } from "../behavior.js";
/**
 * Error code for user-cancelled operations.
 * @public
 */
export declare const USER_CANCELLED = "USER_CANCELLED";
/**
 * Pending confirmation state.
 * @public
 */
export interface PendingConfirmation {
    /** The command ID being confirmed */
    commandId: string;
    /** The command label for display */
    label: string;
    /** The confirmation prompt to show */
    prompt: string;
    /** Internal resolver - do not use directly */
    resolve: (confirmed: boolean) => void;
}
/**
 * Behavior that intercepts destructive commands and prompts for user confirmation.
 *
 * @remarks
 * - Registers an interceptor with the CommandRegistry on connect
 * - Intercepts commands where `destructive: true`
 * - Exposes `pendingConfirmation` state for UI binding
 * - Provides `executeConfirmed()` and `cancelPending()` methods
 * - Cleans up interceptor on disconnect
 *
 * @public
 */
export declare class ConfirmBehavior {
    /** Current pending confirmation, or null if none */
    private pending;
    /** Reference to the host controller */
    private controller;
    /** Name of the interceptor for registration/removal */
    private static readonly INTERCEPTOR_NAME;
    /**
     * Called when the host element connects to the DOM.
     * Registers the confirmation interceptor with CommandRegistry.
     *
     * @param controller - The host controller managing this behavior
     */
    connectedCallback(controller: CommandHostController): void;
    /**
     * Called when the host element disconnects from the DOM.
     * Removes the confirmation interceptor and cleans up state.
     *
     * @param controller - The host controller managing this behavior
     */
    disconnectedCallback(controller: CommandHostController): void;
    /**
     * Gets the current pending confirmation, if any.
     *
     * @remarks
     * Use this in templates to check if a confirmation dialog should be shown
     * and to get the prompt text.
     *
     * @returns The pending confirmation or null
     */
    get pendingConfirmation(): PendingConfirmation | null;
    /**
     * Confirms the pending operation and allows it to proceed.
     *
     * @remarks
     * Call this when the user clicks "Confirm" in your confirmation UI.
     * The intercepted command will then execute normally.
     */
    executeConfirmed(): void;
    /**
     * Cancels the pending operation.
     *
     * @remarks
     * Call this when the user clicks "Cancel" in your confirmation UI.
     * The intercepted command will return a USER_CANCELLED error.
     */
    cancelPending(): void;
    /**
     * Shows a confirmation prompt and waits for user response.
     *
     * @param commandId - The command ID being confirmed
     * @param label - The command label for display
     * @param prompt - The confirmation prompt text
     * @returns Promise that resolves to true if confirmed, false if cancelled
     *
     * @internal
     */
    private showConfirmation;
}
