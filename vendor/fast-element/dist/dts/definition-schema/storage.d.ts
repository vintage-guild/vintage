import type { ComponentSchema } from "./types.js";
/**
 * Stores a component schema associated with its class constructor.
 * @param cls - The class constructor for the component.
 * @param schema - The component schema to store.
 */
export declare function storeSchema(cls: Function, schema: ComponentSchema): void;
/**
 * Retrieves a component schema by its class constructor.
 * @param cls - The class constructor to look up.
 * @returns The component schema if found, undefined otherwise.
 */
export declare function getSchemaByClass(cls: Function): ComponentSchema | undefined;
/**
 * Registers a tag name to class mapping within a registry.
 * @param name - The custom element tag name.
 * @param cls - The class constructor for the component.
 * @param registry - The custom element registry (defaults to global customElements).
 */
export declare function registerTag(name: string, cls: Function, registry?: CustomElementRegistry): void;
/**
 * Retrieves a class constructor by its tag name within a registry.
 * @param name - The custom element tag name to look up.
 * @param registry - The custom element registry (defaults to global customElements).
 * @returns The class constructor if found, undefined otherwise.
 */
export declare function getClassByTag(name: string, registry?: CustomElementRegistry): Function | undefined;
/**
 * Gets the tag map for a specific registry.
 * Used internally by getAllSchemas to iterate over registered tags.
 * @param registry - The custom element registry.
 * @returns The Map of tag names to classes, or undefined if no tags registered.
 * @internal
 */
export declare function getRegistryTagMap(registry?: CustomElementRegistry): Map<string, Function> | undefined;
