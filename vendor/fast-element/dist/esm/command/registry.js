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
import { DEFAULT_EXPOSE_CONFIG, ErrorCodes, failure } from "./types.js";
/**
 * Default DEV_MODE value when not defined at build time.
 * @internal
 */
const isDev = typeof DEV_MODE !== "undefined" ? DEV_MODE : true;
/**
 * Internal implementation of the CommandRegistry.
 * @internal
 */
class CommandRegistryImpl {
    constructor() {
        this.commands = new Map();
        this.listeners = new Set();
        this.interceptors = [];
        this.postHooks = [];
        this.initialized = false;
    }
    /**
     * Ensures the registry is initialized with event listeners.
     * Called lazily on first register to avoid SSR issues.
     * @internal
     */
    ensureInitialized() {
        if (this.initialized)
            return;
        this.initialized = true;
        // SSR safety: only add event listener in browser environment
        if (typeof document !== "undefined") {
            document.addEventListener("cmd-exec", ((e) => {
                const detail = e.detail;
                if (!detail ||
                    typeof detail !== "object" ||
                    typeof detail.id !== "string") {
                    return;
                }
                const args = Array.isArray(detail.args) ? detail.args : [];
                void this.execute(detail.id, ...args);
            }));
        }
    }
    /**
     * Registers a command entry in the registry.
     *
     * @param id - The command identifier
     * @param command - The command entry to register
     *
     * @remarks
     * - Emits a warning in DEV_MODE if overwriting an existing command
     * - Notifies listeners of the registration
     * - Emits telemetry event
     *
     * @public
     */
    register(id, command) {
        this.ensureInitialized();
        if (this.commands.has(id) && isDev) {
            console.warn(`[fast-af] Command "${id}" already registered. Overwriting.`);
        }
        this.commands.set(id, command);
        this.notify([id], []);
        this.emitTelemetry("command.registered", { id, label: command.label });
    }
    /**
     * Unregisters a command from the registry.
     *
     * @param id - The command identifier to unregister
     *
     * @remarks
     * - No-op if command doesn't exist
     * - Notifies listeners of the removal
     * - Emits telemetry event
     *
     * @public
     */
    unregister(id, expected) {
        if (expected !== void 0 && this.commands.get(id) !== expected) {
            return;
        }
        if (this.commands.delete(id)) {
            this.notify([], [id]);
            this.emitTelemetry("command.unregistered", { id });
        }
    }
    /**
     * Retrieves a command entry by ID.
     *
     * @param id - The command identifier
     * @returns The command entry, or undefined if not found
     *
     * @public
     */
    get(id) {
        return this.commands.get(id);
    }
    /**
     * Executes a command by ID.
     *
     * @param id - The command identifier
     * @param args - Arguments to pass to the command
     * @returns A Promise resolving to the CommandResult
     *
     * @remarks
     * Returns failure result if:
     * - Command not found (COMMAND_NOT_FOUND)
     * - Command is disabled (COMMAND_DISABLED)
     *
     * Interceptors are run in priority order before the command handler.
     *
     * @public
     */
    execute(id, ...args) {
        var _a, _b;
        const cmd = this.commands.get(id);
        if (!cmd) {
            return Promise.resolve(failure({
                code: ErrorCodes.COMMAND_NOT_FOUND,
                message: `Command not found: ${id}`,
                suggestion: "Check command ID or ensure component is connected",
                retryable: false,
            }));
        }
        if (!cmd.canExecute) {
            return Promise.resolve(failure({
                code: ErrorCodes.COMMAND_DISABLED,
                message: `Command disabled: ${id}`,
                suggestion: "Wait for the command to become available",
                retryable: true,
            }));
        }
        const start = (_b = (_a = globalThis.performance) === null || _a === void 0 ? void 0 : _a.now()) !== null && _b !== void 0 ? _b : Date.now();
        // Build the handler that executes the command
        const executeHandler = () => {
            return Promise.resolve(cmd.execute(...args));
        };
        // Build the interceptor chain and execute
        const chain = this.buildInterceptorChain(cmd, args, executeHandler);
        return Promise.resolve()
            .then(chain)
            .then(result => this.normalizeResult(id, result))
            .catch(error => failure({
            code: ErrorCodes.EXECUTION_FAILED,
            message: `Command execution failed: ${id}`,
            suggestion: "Inspect the command implementation and retry after resolving the error",
            retryable: false,
            details: {
                cause: error instanceof Error
                    ? { message: error.message, name: error.name }
                    : { value: String(error) },
            },
        }))
            .then(result => {
            var _a, _b;
            this.emitTelemetry("command.executed", {
                id,
                duration: ((_b = (_a = globalThis.performance) === null || _a === void 0 ? void 0 : _a.now()) !== null && _b !== void 0 ? _b : Date.now()) - start,
                success: result.success,
            });
            // Run post-hooks after execution
            this.runPostHooks(cmd, args, result);
            return result;
        });
    }
    /**
     * Gets all available commands as Action objects for command palette integration.
     *
     * @param filter - Optional filter to restrict which commands are returned
     * @returns Array of Action objects for visible, available commands
     *
     * @remarks
     * - Filters out commands where `when` is false
     * - Sets `disabled` based on `canExecute`
     * - Compatible with ninja-keys and similar libraries
     * - When filter.interface is specified, only returns commands exposed to that interface
     * - Secure defaults: MCP and CLI are opt-in (false by default)
     *
     * @example
     * ```typescript
     * // Get all visible commands (for command palette)
     * const allActions = CommandRegistry.getActions();
     *
     * // Get only commands exposed to MCP
     * const mcpActions = CommandRegistry.getActions({ interface: 'mcp' });
     *
     * // Get only commands exposed to CLI
     * const cliActions = CommandRegistry.getActions({ interface: 'cli' });
     * ```
     *
     * @public
     */
    getActions(filter) {
        return Array.from(this.commands.values())
            .filter(cmd => {
            // Always filter by visibility
            if (!cmd.when)
                return false;
            // If interface filter is specified, check expose config
            if (filter === null || filter === void 0 ? void 0 : filter.interface) {
                const expose = Object.assign(Object.assign({}, DEFAULT_EXPOSE_CONFIG), cmd.expose);
                return expose[filter.interface] === true;
            }
            return true;
        })
            .map(cmd => ({
            id: cmd.id,
            title: cmd.label,
            icon: cmd.icon,
            section: cmd.category,
            hotkey: cmd.keybinding,
            disabled: !cmd.canExecute,
            handler: () => {
                this.execute(cmd.id);
            },
        }));
    }
    /**
     * Subscribes to command registry changes.
     *
     * @param listener - Callback invoked when commands are added or removed
     * @returns Unsubscribe function
     *
     * @example
     * ```typescript
     * const unsubscribe = CommandRegistry.onChange((added, removed) => {
     *   console.log('Added:', added, 'Removed:', removed);
     * });
     *
     * // Later, to stop listening:
     * unsubscribe();
     * ```
     *
     * @public
     */
    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /**
     * Clears all registered commands.
     *
     * @remarks
     * For testing purposes only.
     * Notifies listeners of all removed commands.
     *
     * @public
     */
    clear() {
        const ids = Array.from(this.commands.keys());
        this.commands.clear();
        if (ids.length > 0) {
            this.notify([], ids);
        }
    }
    /**
     * Gets a scoped registry for micro-frontend isolation.
     *
     * @param _shadowRoot - The shadow root to scope to (unused in Phase 1)
     * @returns The global registry (scoped registries are Phase 2)
     *
     * @remarks
     * Phase 2 stub: Returns global registry with warning in DEV_MODE.
     * Future implementation will support isolated command registries
     * per shadow root for micro-frontend architectures.
     *
     * @public
     */
    forScope(_shadowRoot) {
        if (isDev) {
            console.warn("[fast-af] Scoped registries are Phase 2. Returning global registry.");
        }
        return this;
    }
    /**
     * Sets a telemetry handler for command events.
     *
     * @param handler - Function to handle telemetry events
     *
     * @remarks
     * Events emitted:
     * - "command.registered" - \{ id, label \}
     * - "command.unregistered" - \{ id \}
     * - "command.executed" - \{ id, duration, success \}
     *
     * @example
     * ```typescript
     * CommandRegistry.setTelemetryHandler((event, data) => {
     *   analytics.track(event, data);
     * });
     * ```
     *
     * @public
     */
    setTelemetryHandler(handler) {
        this.telemetryHandler = handler;
    }
    /**
     * Adds an interceptor to the command execution chain.
     *
     * @param interceptor - The interceptor to add
     *
     * @remarks
     * - Interceptors run in priority order (lower priority runs first)
     * - Default priority is 100
     * - Multiple interceptors can have the same priority
     * - Interceptors with the same name will not be duplicated
     *
     * @example
     * ```typescript
     * CommandRegistry.addInterceptor({
     *   name: 'logging',
     *   priority: 1,
     *   intercept: async (cmd, args, next) => {
     *     console.log('Executing:', cmd.id);
     *     const result = await next();
     *     console.log('Result:', result);
     *     return result;
     *   }
     * });
     * ```
     *
     * @public
     */
    addInterceptor(interceptor) {
        var _a;
        // Avoid duplicates by name
        if (this.interceptors.some(i => i.name === interceptor.name)) {
            if (isDev) {
                console.warn(`[fast-af] Interceptor "${interceptor.name}" already registered. Skipping.`);
            }
            return;
        }
        this.interceptors.push(interceptor);
        this.interceptors.sort((a, b) => { var _a, _b; return ((_a = a.priority) !== null && _a !== void 0 ? _a : 100) - ((_b = b.priority) !== null && _b !== void 0 ? _b : 100); });
        this.emitTelemetry("interceptor.added", {
            name: interceptor.name,
            priority: (_a = interceptor.priority) !== null && _a !== void 0 ? _a : 100,
        });
    }
    /**
     * Removes an interceptor by name.
     *
     * @param name - The name of the interceptor to remove
     *
     * @remarks
     * - No-op if interceptor doesn't exist
     * - Emits telemetry event on removal
     *
     * @example
     * ```typescript
     * CommandRegistry.removeInterceptor('confirm');
     * ```
     *
     * @public
     */
    removeInterceptor(name) {
        const before = this.interceptors.length;
        this.interceptors = this.interceptors.filter(i => i.name !== name);
        if (this.interceptors.length < before) {
            this.emitTelemetry("interceptor.removed", { name });
        }
    }
    /**
     * Adds a post-hook to observe command execution results.
     *
     * @param hook - The post-hook to add
     *
     * @remarks
     * - Post-hooks run after command execution completes
     * - They cannot modify the result
     * - Post-hooks with the same name will not be duplicated
     *
     * @example
     * ```typescript
     * CommandRegistry.addPostHook({
     *   name: 'undo',
     *   afterExecute: (cmd, args, result) => {
     *     if (result.success) {
     *       undoStack.push({ cmd, args, result });
     *     }
     *   }
     * });
     * ```
     *
     * @public
     */
    addPostHook(hook) {
        // Avoid duplicates by name
        if (this.postHooks.some(h => h.name === hook.name)) {
            if (isDev) {
                console.warn(`[fast-af] PostHook "${hook.name}" already registered. Skipping.`);
            }
            return;
        }
        this.postHooks.push(hook);
        this.emitTelemetry("posthook.added", { name: hook.name });
    }
    /**
     * Removes a post-hook by name.
     *
     * @param name - The name of the post-hook to remove
     *
     * @remarks
     * - No-op if post-hook doesn't exist
     * - Emits telemetry event on removal
     *
     * @example
     * ```typescript
     * CommandRegistry.removePostHook('undo');
     * ```
     *
     * @public
     */
    removePostHook(name) {
        const before = this.postHooks.length;
        this.postHooks = this.postHooks.filter(h => h.name !== name);
        if (this.postHooks.length < before) {
            this.emitTelemetry("posthook.removed", { name });
        }
    }
    /**
     * Notifies all listeners of command changes.
     * @internal
     */
    notify(added, removed) {
        this.listeners.forEach(listener => {
            try {
                listener(added, removed);
            }
            catch (error) {
                if (isDev) {
                    console.error("[fast-af] Command listener threw an error:", error);
                }
            }
        });
    }
    /**
     * Emits a telemetry event if handler is set.
     * @internal
     */
    emitTelemetry(event, data) {
        var _a;
        try {
            (_a = this.telemetryHandler) === null || _a === void 0 ? void 0 : _a.call(this, event, data);
        }
        catch (error) {
            if (isDev) {
                console.error("[fast-af] Telemetry handler threw an error:", error);
            }
        }
    }
    normalizeResult(id, result) {
        if (result &&
            typeof result === "object" &&
            result.success === true &&
            "data" in result) {
            return result;
        }
        if (result &&
            typeof result === "object" &&
            result.success === false &&
            "error" in result) {
            return result;
        }
        return failure({
            code: ErrorCodes.INTERNAL_ERROR,
            message: `Command returned an invalid result: ${id}`,
            suggestion: "Return success(data) or failure(error) from the command",
            retryable: false,
        });
    }
    /**
     * Builds the interceptor chain for command execution.
     * @internal
     */
    buildInterceptorChain(command, args, handler) {
        // Build chain from back to front
        let chain = handler;
        for (let i = this.interceptors.length - 1; i >= 0; i--) {
            const interceptor = this.interceptors[i];
            const next = chain;
            chain = () => interceptor.intercept(command, args, next);
        }
        return chain;
    }
    /**
     * Runs all post-hooks after command execution.
     * @internal
     */
    runPostHooks(command, args, result) {
        for (const hook of this.postHooks) {
            try {
                hook.afterExecute(command, args, result);
            }
            catch (error) {
                if (isDev) {
                    console.error(`[fast-af] PostHook "${hook.name}" threw an error:`, error);
                }
            }
        }
    }
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
export const CommandRegistry = new CommandRegistryImpl();
