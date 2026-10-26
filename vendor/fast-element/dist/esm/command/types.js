/**
 * Type definitions for the `command` decorator system.
 * Enables AI agents to interact with FASTElement components through structured commands.
 *
 * @remarks
 * This module contains types only - no runtime code.
 * Re-exports AFD core types for ecosystem alignment.
 * FAST-AF is an "agent runtime for Web Components".
 */
/**
 * Standard error codes for command failures.
 * @public
 */
export const ErrorCodes = {
    /** Command ID not found in registry */
    COMMAND_NOT_FOUND: "COMMAND_NOT_FOUND",
    /** Command is currently disabled */
    COMMAND_DISABLED: "COMMAND_DISABLED",
    /** Invalid parameters provided */
    INVALID_PARAMETERS: "INVALID_PARAMETERS",
    /** Command execution failed */
    EXECUTION_FAILED: "EXECUTION_FAILED",
    /** Operation timed out */
    TIMEOUT: "TIMEOUT",
    /** Generic internal error */
    INTERNAL_ERROR: "INTERNAL_ERROR",
};
/**
 * Create a successful command result.
 * @param data - The result data
 * @param metadata - Optional metadata
 * @public
 */
export function success(data, metadata) {
    return { success: true, data, metadata };
}
/**
 * Create a failed command result.
 * @param error - The error information
 * @param metadata - Optional metadata
 * @public
 */
export function failure(error, metadata) {
    return { success: false, error, metadata };
}
/**
 * Type guard for successful results.
 * @param result - The result to check
 * @public
 */
export function isSuccess(result) {
    return result.success === true;
}
/**
 * Type guard for failed results.
 * @param result - The result to check
 * @public
 */
export function isFailure(result) {
    return result.success === false;
}
/**
 * Create a CommandError object.
 * @param code - Error code
 * @param message - Error message
 * @param options - Additional error options
 * @public
 */
export function createError(code, message, options) {
    return Object.assign({ code, message }, options);
}
/**
 * Default expose configuration.
 * Secure defaults: palette and agent are enabled, mcp and cli require opt-in.
 * @public
 */
export const DEFAULT_EXPOSE_CONFIG = {
    palette: true,
    agent: true,
    mcp: false,
    cli: false,
};
