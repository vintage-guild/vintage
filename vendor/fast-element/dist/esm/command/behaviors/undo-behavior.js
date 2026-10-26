/**
 * UndoBehavior - Manages an undo stack for undoable commands.
 *
 * @remarks
 * Uses the CommandRegistry PostHook API to observe command execution and
 * capture undo functions. Provides keyboard shortcut support (Ctrl+Z).
 *
 * Commands are undoable if the source element has a matching `${methodName}Undo()`
 * method that returns a function to reverse the operation.
 *
 * @example
 * ```typescript
 * import { UndoBehavior } from '@lushly-dev/fast-element/command.js';
 *
 * class MyApp extends FASTElement {
 *   private undoBehavior = new UndoBehavior({ limit: 20 });
 *
 *   connectedCallback() {
 *     super.connectedCallback();
 *     this.$fastController.addBehavior(this.undoBehavior);
 *   }
 *
 *   // Command with undo support
 *   @command("editor.delete")
 *   delete() { ... }
 *
 *   // Undo function - returns the reverse operation
 *   deleteUndo() {
 *     return () => { ... restore deleted content ... };
 *   }
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
/**
 * Behavior that manages an undo stack for undoable commands.
 *
 * @remarks
 * - Registers a PostHook with the CommandRegistry on connect
 * - Captures undo functions from `${methodName}Undo()` convention
 * - Maintains a limited stack of undo entries
 * - Provides `undo()` method and Ctrl+Z keyboard shortcut
 * - Cleans up on disconnect
 *
 * @public
 */
export class UndoBehavior {
    /**
     * Creates a new UndoBehavior instance.
     *
     * @param options - Configuration options
     */
    constructor(options = {}) {
        var _a, _b;
        /** Undo stack (most recent at the end) */
        this.stack = [];
        /** Bound keyboard handler for cleanup */
        this.boundKeydownHandler = null;
        this.limit = (_a = options.limit) !== null && _a !== void 0 ? _a : 10;
        this.enableKeyboardShortcut = (_b = options.enableKeyboardShortcut) !== null && _b !== void 0 ? _b : true;
    }
    /**
     * Called when the host element connects to the DOM.
     * Registers the undo post-hook with CommandRegistry.
     *
     * @param controller - The host controller managing this behavior
     */
    connectedCallback(controller) {
        // Register post-hook to capture undo functions
        CommandRegistry.addPostHook({
            name: UndoBehavior.POST_HOOK_NAME,
            afterExecute: (command, args, result) => {
                this.handleCommandExecuted(command, args, result);
            },
        });
        // Register keyboard shortcut
        if (this.enableKeyboardShortcut && typeof document !== "undefined") {
            const handler = this.handleKeydown.bind(this);
            this.boundKeydownHandler = handler;
            document.addEventListener("keydown", handler);
        }
    }
    /**
     * Called when the host element disconnects from the DOM.
     * Removes the post-hook and cleans up state.
     *
     * @param controller - The host controller managing this behavior
     */
    disconnectedCallback(controller) {
        // Remove post-hook
        CommandRegistry.removePostHook(UndoBehavior.POST_HOOK_NAME);
        // Remove keyboard handler
        const handler = this.boundKeydownHandler;
        if (typeof document !== "undefined" && handler !== null) {
            document.removeEventListener("keydown", handler);
            this.boundKeydownHandler = null;
        }
        // Clear state
        this.stack = [];
    }
    /**
     * Gets the current undo stack.
     *
     * @remarks
     * Returns a copy of the stack to prevent external mutation.
     *
     * @returns Array of undo entries (most recent last)
     */
    getStack() {
        return [...this.stack];
    }
    /**
     * Gets the number of entries in the undo stack.
     *
     * @returns The stack size
     */
    get stackSize() {
        return this.stack.length;
    }
    /**
     * Whether there are any operations to undo.
     *
     * @returns True if the stack is not empty
     */
    get canUndo() {
        return this.stack.length > 0;
    }
    /**
     * Gets the most recent undo entry without removing it.
     *
     * @returns The most recent entry, or undefined if stack is empty
     */
    peek() {
        return this.stack[this.stack.length - 1];
    }
    /**
     * Undoes the most recent operation.
     *
     * @remarks
     * Pops the most recent entry from the stack and executes its undo function.
     * If the undo function is async, this returns a Promise.
     *
     * @returns Promise that resolves when the undo is complete
     */
    undo() {
        return __awaiter(this, void 0, void 0, function* () {
            const entry = this.stack.pop();
            if (!entry) {
                return false;
            }
            try {
                yield entry.undoFn();
                return true;
            }
            catch (error) {
                // Re-push on failure so user can retry
                this.stack.push(entry);
                throw error;
            }
        });
    }
    /**
     * Clears the entire undo stack.
     */
    clear() {
        this.stack = [];
    }
    /**
     * Handles a command execution and potentially adds to the undo stack.
     *
     * @internal
     */
    handleCommandExecuted(command, args, result) {
        // Only capture successful commands
        if (!result.success) {
            return;
        }
        // Get the source element
        const source = command.source.deref();
        if (!source) {
            return;
        }
        // Extract method name from command ID (e.g., "editor.save" -> "save")
        const methodName = this.extractMethodName(command.id);
        if (!methodName) {
            return;
        }
        // Look for ${methodName}Undo() convention
        const undoMethodName = `${methodName}Undo`;
        const undoMethod = source[undoMethodName];
        if (typeof undoMethod !== "function") {
            return;
        }
        // Call the undo method to get the undo function
        // The undo method should return a function that reverses the operation
        const undoFn = undoMethod.call(source);
        if (typeof undoFn !== "function") {
            return;
        }
        // Add to stack
        this.stack.push({
            commandId: command.id,
            label: command.label,
            args,
            undoFn,
            timestamp: Date.now(),
        });
        // Trim to limit
        while (this.stack.length > this.limit) {
            this.stack.shift();
        }
    }
    /**
     * Extracts the method name from a command ID.
     *
     * @param commandId - The command ID (e.g., "editor.save")
     * @returns The method name (e.g., "save")
     *
     * @internal
     */
    extractMethodName(commandId) {
        // Command IDs are in format "namespace.method" or "@scope/namespace.method"
        const lastDotIndex = commandId.lastIndexOf(".");
        if (lastDotIndex === -1) {
            return null;
        }
        return commandId.slice(lastDotIndex + 1);
    }
    /**
     * Handles keyboard events for Ctrl+Z shortcut.
     *
     * @internal
     */
    handleKeydown(event) {
        // Check for Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
        const isUndo = (event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey;
        if (isUndo && this.canUndo) {
            event.preventDefault();
            this.undo().catch(error => {
                console.error("[fast-af] Undo failed:", error);
            });
        }
    }
}
/** Name of the post-hook for registration/removal */
UndoBehavior.POST_HOOK_NAME = "undo";
