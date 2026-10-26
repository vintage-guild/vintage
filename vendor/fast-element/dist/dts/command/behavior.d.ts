/**
 * CommandBehavior - Lifecycle management for `command`-decorated methods.
 * Bridges `command` decorator metadata to the CommandRegistry.
 *
 * @remarks
 * Implements the FAST host-behavior lifecycle structurally.
 * Commands are discovered in addedCallback, registered on connect, and
 * unregistered on disconnect.
 *
 * Uses Observable.track() for reactive canExecute and when getters,
 * allowing UI to reactively update when command availability changes.
 *
 * @example
 * ```typescript
 * // Behavior is automatically added when an element has command decorators
 * class MyEditor extends FASTElement {
 *   @observable
 *   hasChanges = false;
 *
 *   // Reactive canExecute getter
 *   get saveCanExecute(): boolean {
 *     return this.hasChanges;
 *   }
 *
 *   @command('editor.save', { label: 'Save' })
 *   save(): CommandResult {
 *     return success({ saved: true });
 *   }
 * }
 * ```
 */
/**
 * Minimal controller contract required by command behaviors.
 * @public
 */
export interface CommandHostController {
    readonly source: HTMLElement;
}
/**
 * Behavior that manages command lifecycle for FASTElement components.
 *
 * @remarks
 * - Discovers `command`-decorated methods via getCommandMetadata
 * - Registers commands with CommandRegistry on connect
 * - Unregisters commands on disconnect
 * - Provides reactive canExecute/when getters via Observable.track()
 *
 * @public
 */
export declare class CommandBehavior {
    /**
     * Map of command IDs to their registry entries.
     * Populated in addedCallback, used in connect/disconnect.
     */
    private commands;
    /**
     * Reference to the host element.
     * Set in addedCallback for use in discoverCommands.
     */
    private host;
    /**
     * Called when the behavior is first attached to a controller.
     * Discovers all `command`-decorated methods on the host element.
     *
     * @param controller - The host controller managing this behavior
     */
    addedCallback(controller: CommandHostController): void;
    /**
     * Called when the host element connects to the DOM.
     * Registers all discovered commands with the CommandRegistry.
     *
     * @param controller - The host controller managing this behavior
     */
    connectedCallback(controller: CommandHostController): void;
    /**
     * Called when the host element disconnects from the DOM.
     * Unregisters all commands from the CommandRegistry.
     *
     * @param controller - The host controller managing this behavior
     */
    disconnectedCallback(controller: CommandHostController): void;
    /**
     * Discovers all `command`-decorated methods on the host element
     * and creates CommandEntry objects for each.
     *
     * @remarks
     * For each command:
     * - Binds the method to the host element
     * - Creates reactive canExecute getter checking for `${methodName}CanExecute`
     * - Creates reactive when getter checking for `${methodName}When`
     * - Stores WeakRef to host for garbage collection safety
     */
    private discoverCommands;
}
