/**
 * Public API for the Definition Schema system.
 * Enables AI agents to query component capabilities via JSON introspection.
 */
// Re-export all API functions
export { getSchema, getSchemaOrThrow, getComponentSchema, getAllSchemas, diffSchemas, } from "./api.js";
export { toCustomElementsManifest, toPascalCase } from "./cem.js";
export { disableDefinitionSchema, enableDefinitionSchema } from "./extension.js";
