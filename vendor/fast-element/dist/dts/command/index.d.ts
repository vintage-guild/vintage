/**
 * Public API for the `command` decorator system.
 * Enables AI agents to interact with FASTElement components through structured commands.
 */
export type { ResultMetadata, CommandError, CommandResult, CommandId, CommandMetadata, CommandOptions, CommandEntry, Action, InterfaceType, ExposeConfig, ActionFilter, JSONSchema, } from "./types.js";
export { ErrorCodes, success, failure, isSuccess, isFailure, createError, DEFAULT_EXPOSE_CONFIG, } from "./types.js";
export { command, getCommandMetadata } from "./command.js";
export { CommandBehavior } from "./behavior.js";
export type { CommandHostController } from "./behavior.js";
export { ConfirmBehavior, USER_CANCELLED } from "./behaviors/confirm-behavior.js";
export type { PendingConfirmation } from "./behaviors/confirm-behavior.js";
export { UndoBehavior } from "./behaviors/undo-behavior.js";
export type { UndoEntry, UndoBehaviorOptions } from "./behaviors/undo-behavior.js";
export { CommandRegistry } from "./registry.js";
export type { CommandRegistryAPI, CommandListener, TelemetryHandler, Interceptor, PostHook, } from "./registry.js";
export { confirmDialogTagName, defineConfirmDialog, } from "./components/confirm-dialog.js";
export { registerComponentCommands } from "./component-registry.js";
export type { ComponentInfo, ComponentAPIInfo } from "./component-registry.js";
export type { AriaHint, CommandSchema, ComponentSchema, CSSPropertySchema, EventSchema, JSONSchema as DefinitionJSONSchema, PropertySchema, PropertyType, SlotSchema, } from "../definition-schema/types.js";
export { registerValidationCommands } from "./validation.js";
export type { LintSeverity, LintIssue, LintCounts, LintPlanStep, LintResult, WcagLevel, A11yImpact, A11yViolation, A11yAuditResult, } from "./validation.js";
