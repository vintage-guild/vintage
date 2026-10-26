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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { CommandRegistry } from "../registry.js";
import { failure } from "../types.js";
/**
 * Error code for user-cancelled operations.
 * @public
 */
export const USER_CANCELLED = "USER_CANCELLED";
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
export class ConfirmBehavior {
    constructor() {
        /** Current pending confirmation, or null if none */
        this.pending = null;
        /** Reference to the host controller */
        this.controller = null;
    }
    /**
     * Called when the host element connects to the DOM.
     * Registers the confirmation interceptor with CommandRegistry.
     *
     * @param controller - The host controller managing this behavior
     */
    connectedCallback(controller) {
        this.controller = controller;
        CommandRegistry.addInterceptor({
            name: ConfirmBehavior.INTERCEPTOR_NAME,
            priority: 10, // Run early to block before other interceptors
            intercept: (command, args, next) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                // Only intercept destructive commands
                if (!command.destructive) {
                    return next();
                }
                // Show confirmation and wait for user response
                const confirmed = yield this.showConfirmation(command.id, command.label, (_a = command.confirmPrompt) !== null && _a !== void 0 ? _a : "Are you sure you want to proceed?");
                if (!confirmed) {
                    return failure({
                        code: USER_CANCELLED,
                        message: "User cancelled the operation",
                        retryable: false,
                    });
                }
                return next();
            }),
        });
    }
    /**
     * Called when the host element disconnects from the DOM.
     * Removes the confirmation interceptor and cleans up state.
     *
     * @param controller - The host controller managing this behavior
     */
    disconnectedCallback(controller) {
        // Cancel any pending confirmation
        if (this.pending) {
            this.pending.resolve(false);
            this.pending = null;
        }
        // Remove interceptor to prevent memory leaks
        CommandRegistry.removeInterceptor(ConfirmBehavior.INTERCEPTOR_NAME);
        this.controller = null;
    }
    /**
     * Gets the current pending confirmation, if any.
     *
     * @remarks
     * Use this in templates to check if a confirmation dialog should be shown
     * and to get the prompt text.
     *
     * @returns The pending confirmation or null
     */
    get pendingConfirmation() {
        return this.pending;
    }
    /**
     * Confirms the pending operation and allows it to proceed.
     *
     * @remarks
     * Call this when the user clicks "Confirm" in your confirmation UI.
     * The intercepted command will then execute normally.
     */
    executeConfirmed() {
        if (this.pending) {
            this.pending.resolve(true);
            this.pending = null;
        }
    }
    /**
     * Cancels the pending operation.
     *
     * @remarks
     * Call this when the user clicks "Cancel" in your confirmation UI.
     * The intercepted command will return a USER_CANCELLED error.
     */
    cancelPending() {
        if (this.pending) {
            this.pending.resolve(false);
            this.pending = null;
        }
    }
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
    showConfirmation(commandId, label, prompt) {
        return new Promise(resolve => {
            var _a;
            this.pending = {
                commandId,
                label,
                prompt,
                resolve,
            };
            // Trigger a re-render if the host supports it
            // This allows reactive UI frameworks to show the dialog
            if (((_a = this.controller) === null || _a === void 0 ? void 0 : _a.source) && "requestUpdate" in this.controller.source) {
                this.controller.source.requestUpdate();
            }
        });
    }
}
/** Name of the interceptor for registration/removal */
ConfirmBehavior.INTERCEPTOR_NAME = "confirm";
