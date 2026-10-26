/**
 * CommandRegistry singleton for managing command lifecycle.
 * Enables AI agents and command palettes to discover and execute commands.
 *
 * @remarks
 * - SSR-safe: Guards against document access in Node.js
 * - Lazy initialization: Event listener added on first register
 * - Uses AFD's failure() helper for error results
 *
 * @example
 * ```typescript
 * import { CommandRegistry } from '@lushly-dev/fast-element/command.js';
 *
 * // Execute a command
 * const result = await CommandRegistry.execute('editor.save');
 * if (result.success) {
 *   console.log('Saved:', result.data);
 * } else {
 *   console.error('Failed:', result.error.message);
 * }
 *
 * // Get actions for command palette
 * const actions = CommandRegistry.getActions();
 *
 * // Subscribe to changes
 * const unsubscribe = CommandRegistry.onChange((added, removed) => {
 *   console.log('Commands changed:', { added, removed });
 * });
 * ```
 */
import type { Action, ActionFilter, CommandEntry, CommandResult } from "./types.js";
/**
 * Interceptor for command execution.
 * Interceptors can modify, block, or wrap command execution.
 *
 * @remarks
 * Interceptors run in priority order (lower priority runs first).
 * Each interceptor must call `next()` to continue the chain.
 *
 * @example
 * ```typescript
 * CommandRegistry.addInterceptor({
 *   name: 'confirm',
 *   priority: 10,
 *   intercept: async (command, args, next) => {
 *     if (command.destructive) {
 *       const confirmed = await showConfirm('Are you sure?');
 *       if (!confirmed) return { success: false, error: { code: 'USER_CANCELLED', message: 'Cancelled' } };
 *     }
 *     return next();
 *   }
 * });
 * ```
 *
 * @public
 */
export interface Interceptor {
    /** Unique name for the interceptor (used for removal) */
    name: string;
    /** Priority order (lower runs first, default: 100) */
    priority?: number;
    /**
     * Intercept the command execution.
     * @param command - The command entry being executed
     * @param args - Arguments passed to the command
     * @param next - Call to continue to next interceptor or execute the command
     * @returns The command result
     */
    intercept(command: CommandEntry, args: unknown[], next: () => Promise<CommandResult>): Promise<CommandResult>;
}
/**
 * PostHook for observing command execution results.
 * PostHooks run after command execution completes (success or failure).
 *
 * @remarks
 * Unlike interceptors, post-hooks cannot modify the result.
 * They are useful for:
 * - Logging and analytics
 * - Building undo stacks
 * - Triggering side effects
 *
 * @example
 * ```typescript
 * CommandRegistry.addPostHook({
 *   name: 'undo',
 *   afterExecute: (command, args, result) => {
 *     if (result.success && command.undoable) {
 *       undoStack.push({ command, args, result });
 *     }
 *   }
 * });
 * ```
 *
 * @public
 */
export interface PostHook {
    /** Unique name for the post-hook (used for removal) */
    name: string;
    /**
     * Called after command execution completes.
     * @param command - The command entry that was executed
     * @param args - Arguments that were passed to the command
     * @param result - The result of command execution
     */
    afterExecute(command: CommandEntry, args: unknown[], result: CommandResult): void;
}
/**
 * Listener function signature for command registry changes.
 * @param added - Array of newly registered command IDs
 * @param removed - Array of unregistered command IDs
 * @public
 */
export type CommandListener = (added: string[], removed: string[]) => void;
/**
 * Telemetry handler function signature.
 * @param event - Event name (e.g., "command.registered", "command.executed")
 * @param data - Event data
 * @public
 */
export type TelemetryHandler = (event: string, data: Record<string, unknown>) => void;
/**
 * Public contract for the global command registry.
 * @public
 */
export interface CommandRegistryAPI {
    register(id: string, command: CommandEntry): void;
    unregister(id: string, expected?: CommandEntry): void;
    get(id: string): CommandEntry | undefined;
    execute(id: string, ...args: unknown[]): Promise<CommandResult>;
    getActions(filter?: ActionFilter): Action[];
    onChange(listener: CommandListener): () => void;
    clear(): void;
    forScope(shadowRoot: ShadowRoot): CommandRegistryAPI;
    setTelemetryHandler(handler?: TelemetryHandler): void;
    addInterceptor(interceptor: Interceptor): void;
    removeInterceptor(name: string): void;
    addPostHook(hook: PostHook): void;
    removePostHook(name: string): void;
}
/**
 * Global CommandRegistry singleton.
 *
 * @remarks
 * The CommandRegistry is the central hub for command management.
 * Commands are registered automatically when FASTElement components
 * with \@command decorators connect to the DOM.
 *
 * Key features:
 * - SSR-safe with lazy initialization
 * - Reactive: subscribe to changes via onChange()
 * - Command palette integration via getActions()
 * - Telemetry hooks for analytics
 *
 * @example
 * ```typescript
 * import { CommandRegistry, success, failure } from '\@lushly-dev/fast-element/command.js';
 *
 * // Manual command registration (usually done automatically)
 * CommandRegistry.register('custom.action', \{
 *   id: 'custom.action',
 *   label: 'Custom Action',
 *   execute: () => success(\{ done: true \}),
 *   canExecute: true,
 *   when: true,
 *   source: new WeakRef(document.body),
 * \});
 *
 * // Execute command
 * const result = await CommandRegistry.execute('custom.action');
 *
 * // Command palette integration
 * const actions = CommandRegistry.getActions();
 * ninjaKeys.data = actions;
 * ```
 *
 * @public
 */
export declare const CommandRegistry: CommandRegistryAPI;
