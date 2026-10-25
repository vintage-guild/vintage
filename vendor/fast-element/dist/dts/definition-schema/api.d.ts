import type { ComponentSchema, SchemaDiff } from "./types.js";
/**
 * Retrieves the schema for a custom element by its tag name.
 * @param name - The custom element tag name.
 * @param registry - The custom element registry (defaults to global customElements).
 * @returns The component schema if found, undefined otherwise.
 * @public
 */
export declare function getSchema(name: string, registry?: CustomElementRegistry): ComponentSchema | undefined;
/**
 * Retrieves the schema for a custom element by its tag name, throwing if not found.
 * @param name - The custom element tag name.
 * @param registry - The custom element registry (defaults to global customElements).
 * @returns The component schema.
 * @throws TypeError if no schema is found for the element.
 * @public
 */
export declare function getSchemaOrThrow(name: string, registry?: CustomElementRegistry): ComponentSchema;
/**
 * Retrieves the schema for a FASTElement class directly.
 * @param cls - The FASTElement class constructor.
 * @returns The component schema.
 * @throws TypeError if the class is not a registered FASTElement.
 * @public
 */
export declare function getComponentSchema(cls: Function): ComponentSchema;
/**
 * Retrieves all registered component schemas for a given registry.
 * @param registry - The custom element registry (defaults to global customElements).
 * @returns A Map of tag names to component schemas.
 * @public
 */
export declare function getAllSchemas(registry?: CustomElementRegistry): Map<string, ComponentSchema>;
/**
 * Compares two component schemas and returns the differences.
 * Used to detect breaking changes between versions.
 * @param a - The original schema (before).
 * @param b - The new schema (after).
 * @returns A SchemaDiff object describing the changes.
 * @public
 */
export declare function diffSchemas(a: ComponentSchema, b: ComponentSchema): SchemaDiff;
