/**
 * Public API for the `command` decorator system.
 * Enables AI agents to interact with FASTElement components through structured commands.
 */
// Re-export helper functions and constants
export { ErrorCodes, success, failure, isSuccess, isFailure, createError, DEFAULT_EXPOSE_CONFIG, } from "./types.js";
// Re-export decorator and metadata helper
export { command, getCommandMetadata } from "./command.js";
// Re-export behavior for lifecycle management
export { CommandBehavior } from "./behavior.js";
// Re-export confirmation behavior
export { ConfirmBehavior, USER_CANCELLED } from "./behaviors/confirm-behavior.js";
// Re-export undo behavior
export { UndoBehavior } from "./behaviors/undo-behavior.js";
// Re-export registry singleton and types
export { CommandRegistry } from "./registry.js";
// Re-export opt-in command safety components
export { confirmDialogTagName, defineConfirmDialog, } from "./components/confirm-dialog.js";
// Re-export component introspection commands
export { registerComponentCommands } from "./component-registry.js";
// Re-export validation commands
export { registerValidationCommands } from "./validation.js";
