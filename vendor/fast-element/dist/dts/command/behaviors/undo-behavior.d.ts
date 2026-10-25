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
import type { CommandHostController } from "../behavior.js";
/**
 * Entry in the undo stack.
 * @public
 */
export interface UndoEntry {
    /** The command ID that was executed */
    commandId: string;
    /** The command label for display */
    label: string;
    /** Arguments that were passed to the command */
    args: unknown[];
    /** The undo function to reverse the operation */
    undoFn: () => void | Promise<void>;
    /** Timestamp when the command was executed */
    timestamp: number;
}
/**
 * Options for configuring UndoBehavior.
 * @public
 */
export interface UndoBehaviorOptions {
    /** Maximum number of undo entries to keep (default: 10) */
    limit?: number;
    /** Whether to register Ctrl+Z keyboard shortcut (default: true) */
    enableKeyboardShortcut?: boolean;
}
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
export declare class UndoBehavior {
    /** Undo stack (most recent at the end) */
    private stack;
    /** Maximum stack size */
    private readonly limit;
    /** Whether keyboard shortcut is enabled */
    private readonly enableKeyboardShortcut;
    /** Bound keyboard handler for cleanup */
    private boundKeydownHandler;
    /** Name of the post-hook for registration/removal */
    private static readonly POST_HOOK_NAME;
    /**
     * Creates a new UndoBehavior instance.
     *
     * @param options - Configuration options
     */
    constructor(options?: UndoBehaviorOptions);
    /**
     * Called when the host element connects to the DOM.
     * Registers the undo post-hook with CommandRegistry.
     *
     * @param controller - The host controller managing this behavior
     */
    connectedCallback(controller: CommandHostController): void;
    /**
     * Called when the host element disconnects from the DOM.
     * Removes the post-hook and cleans up state.
     *
     * @param controller - The host controller managing this behavior
     */
    disconnectedCallback(controller: CommandHostController): void;
    /**
     * Gets the current undo stack.
     *
     * @remarks
     * Returns a copy of the stack to prevent external mutation.
     *
     * @returns Array of undo entries (most recent last)
     */
    getStack(): readonly UndoEntry[];
    /**
     * Gets the number of entries in the undo stack.
     *
     * @returns The stack size
     */
    get stackSize(): number;
    /**
     * Whether there are any operations to undo.
     *
     * @returns True if the stack is not empty
     */
    get canUndo(): boolean;
    /**
     * Gets the most recent undo entry without removing it.
     *
     * @returns The most recent entry, or undefined if stack is empty
     */
    peek(): UndoEntry | undefined;
    /**
     * Undoes the most recent operation.
     *
     * @remarks
     * Pops the most recent entry from the stack and executes its undo function.
     * If the undo function is async, this returns a Promise.
     *
     * @returns Promise that resolves when the undo is complete
     */
    undo(): Promise<boolean>;
    /**
     * Clears the entire undo stack.
     */
    clear(): void;
    /**
     * Handles a command execution and potentially adds to the undo stack.
     *
     * @internal
     */
    private handleCommandExecuted;
    /**
     * Extracts the method name from a command ID.
     *
     * @param commandId - The command ID (e.g., "editor.save")
     * @returns The method name (e.g., "save")
     *
     * @internal
     */
    private extractMethodName;
    /**
     * Handles keyboard events for Ctrl+Z shortcut.
     *
     * @internal
     */
    private handleKeydown;
}
