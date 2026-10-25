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
import { Observable } from "../observation/observable.js";
import { getCommandMetadata } from "./command.js";
import { CommandRegistry } from "./registry.js";
import { createWeakReference } from "./weak-ref.js";
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
export class CommandBehavior {
    constructor() {
        /**
         * Map of command IDs to their registry entries.
         * Populated in addedCallback, used in connect/disconnect.
         */
        this.commands = new Map();
        /**
         * Reference to the host element.
         * Set in addedCallback for use in discoverCommands.
         */
        this.host = null;
    }
    /**
     * Called when the behavior is first attached to a controller.
     * Discovers all `command`-decorated methods on the host element.
     *
     * @param controller - The host controller managing this behavior
     */
    addedCallback(controller) {
        this.host = controller.source;
        this.discoverCommands();
    }
    /**
     * Called when the host element connects to the DOM.
     * Registers all discovered commands with the CommandRegistry.
     *
     * @param controller - The host controller managing this behavior
     */
    connectedCallback(controller) {
        this.commands.forEach((cmd, id) => {
            CommandRegistry.register(id, cmd);
        });
    }
    /**
     * Called when the host element disconnects from the DOM.
     * Unregisters all commands from the CommandRegistry.
     *
     * @param controller - The host controller managing this behavior
     */
    disconnectedCallback(controller) {
        this.commands.forEach((command, id) => {
            CommandRegistry.unregister(id, command);
        });
    }
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
    discoverCommands() {
        var _a;
        if (!this.host)
            return;
        const metadata = getCommandMetadata(this.host.constructor);
        const host = this.host;
        for (const meta of metadata) {
            const entry = {
                id: meta.id,
                label: (_a = meta.label) !== null && _a !== void 0 ? _a : meta.methodName,
                icon: meta.icon,
                description: meta.description,
                category: meta.category,
                keybinding: meta.keybinding,
                parameters: meta.parameters,
                destructive: meta.destructive,
                confirmPrompt: meta.confirmPrompt,
                expose: meta.expose,
                execute: host[meta.methodName].bind(host),
                source: createWeakReference(host),
                /**
                 * Reactive getter for command executability.
                 * Checks for a `${methodName}CanExecute` property on the host.
                 * Uses Observable.track() to enable reactive updates.
                 */
                get canExecute() {
                    const getter = `${meta.methodName}CanExecute`;
                    if (getter in host) {
                        Observable.track(host, getter);
                        return host[getter];
                    }
                    return true;
                },
                /**
                 * Reactive getter for command visibility.
                 * Checks for a `${methodName}When` property on the host.
                 * Uses Observable.track() to enable reactive updates.
                 */
                get when() {
                    const getter = `${meta.methodName}When`;
                    if (getter in host) {
                        Observable.track(host, getter);
                        return host[getter];
                    }
                    return true;
                },
            };
            this.commands.set(meta.id, entry);
        }
    }
}
