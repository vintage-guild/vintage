import { type JSONSchema, type JSONSchemaDefinition } from "../components/schema.js";
/**
 * Find a definition
 * This may exist as a $ref at the root or as a $ref in any anyOf or not at all
 * if the Observer Map has not been enabled on a child component
 * @param schema - The JSON schema to find the ref in
 * @returns The definition or null
 * @public
 */
export declare function findDef(schema: JSONSchema | JSONSchemaDefinition): string | null;
/**
 * Assign observables to data
 * @param schema - The schema
 * @param rootSchema - The root schema mapping to the root property
 * @param data - The data
 * @param target - The target custom element
 * @param rootProperty - The root property
 * @returns
 * @public
 */
export declare function assignObservables(schema: JSONSchema | JSONSchemaDefinition, rootSchema: JSONSchema, data: any, target: any, rootProperty: string): typeof Proxy;
/**
 * Assign a proxy to an object
 * @param schema - The current schema
 * @param rootSchema - The root schema for the root property
 * @param target - The target custom element
 * @param rootProperty - The root property
 * @param object - The object to assign the proxy to
 * @returns Proxy object
 * @public
 */
export declare function assignProxy(schema: JSONSchema | JSONSchemaDefinition, rootSchema: JSONSchema, target: any, rootProperty: string, object: any): typeof Proxy;
/**
 * Deeply compares two objects for equality.
 *
 * @param obj1 - First object to compare
 * @param obj2 - Second object to compare
 * @returns True if the objects are deeply equal, false otherwise
 * @public
 */
export declare function deepEqual(obj1: any, obj2: any): boolean;
/**
 * Checks if a value is a plain object (not an array, null, or other type).
 *
 * @param value - The value to check
 * @returns True if the value is a plain object, false otherwise
 * @public
 */
export declare function isPlainObject(value: any): value is Record<string, any>;
/**
 * Deeply merges the source object into the target object.
 *
 * @param target - The target object to merge into
 * @param source - The source object to merge from
 * @returns boolean indicating whether changes were made
 * @public
 */
export declare function deepMerge(target: any, source: any): boolean;
