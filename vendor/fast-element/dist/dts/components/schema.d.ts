type FastContextMetaData = "$fast_context";
type FastContextsMetaData = "$fast_parent_contexts";
/**
 * Describes a child custom element binding referenced by a schema path.
 * @public
 */
export interface ChildrenMap {
    customElementName: string;
    attributeName: string;
}
/**
 * A reusable JSON schema definition.
 * @public
 */
export interface JSONSchemaDefinition extends JSONSchemaCommon {
    $fast_context: string;
    $fast_parent_contexts: Array<string>;
}
/**
 * Common properties shared by schema nodes.
 * @public
 */
export interface JSONSchemaCommon {
    type?: string;
    properties?: any;
    items?: any;
    anyOf?: Array<any>;
    $ref?: string;
    /**
     * Stamped by `applyConfigToSchema` when an `ObserverMapConfig` excludes
     * this path. When `false`, the proxy system skips observation for this
     * node and (if all descendants are also `false`) its subtree.
     */
    $observe?: boolean;
}
/**
 * A JSON schema describing a root property.
 * @public
 */
export interface JSONSchema extends JSONSchemaCommon {
    $schema: string;
    $id: string;
    $defs?: Record<string, JSONSchemaDefinition>;
}
/**
 * Common metadata for paths cached while parsing a template.
 * @public
 */
export interface CachedPathCommon {
    parentContext: string | null;
    currentContext: string | null;
    path: string;
}
/**
 * A path discovered from an access expression.
 * @public
 */
export interface AccessCachedPath extends CachedPathCommon {
    type: "access";
}
/**
 * A path discovered from a default binding.
 * @public
 */
export interface DefaultCachedPath extends CachedPathCommon {
    type: "default";
}
/**
 * A path discovered from an event binding.
 * @public
 */
export interface EventCachedPath extends CachedPathCommon {
    type: "event";
}
/**
 * A path discovered from a repeat directive.
 * @public
 */
export interface RepeatCachedPath extends CachedPathCommon {
    type: "repeat";
}
/**
 * A path discovered while parsing a template.
 * @public
 */
export type CachedPath = DefaultCachedPath | RepeatCachedPath | AccessCachedPath | EventCachedPath;
/**
 * A map from element names and root properties to JSON schemas.
 * @public
 */
export type CachedPathMap = Map<string, Map<string, JSONSchema>>;
/**
 * Configuration for registering a path with a schema.
 * @public
 */
export interface RegisterPathConfig {
    rootPropertyName: string;
    pathConfig: CachedPath;
    childrenMap: ChildrenMap | null;
}
export declare const fastContextMetaData: FastContextMetaData;
export declare const fastContextsMetaData: FastContextsMetaData;
export declare const defsPropertyName = "$defs";
export declare const refPropertyName = "$ref";
/**
 * Module-level registry that maps custom element names to their schema maps.
 * Used for cross-element `$ref` resolution (e.g. nested element schemas).
 * Each Schema instance registers itself here on construction.
 * @public
 */
export declare const schemaRegistry: CachedPathMap;
/**
 * A constructed JSON schema from a template
 * @public
 */
export declare class Schema {
    /**
     * The name of the custom element
     */
    private customElementName;
    /**
     * Instance-level JSON schema map describing each root property
     */
    private schemaMap;
    constructor(name: string);
    /**
     * Add a path to a schema
     * @param config - The path registration configuration.
     */
    addPath(config: RegisterPathConfig): void;
    /**
     * Gets the JSON schema for a property name
     * @param rootPropertyName - the root property the JSON schema is mapped to
     * @returns The JSON schema for the root property
     */
    getSchema(rootPropertyName: string): JSONSchema | null;
    /**
     * Gets root properties
     * @returns IterableIterator<string>
     */
    getRootProperties(): IterableIterator<string>;
    /**
     * Get a path split into property names
     * @param path - The dot syntax path, e.g. `a.b.c`.
     * @returns An array of items in the path
     */
    private getSplitPath;
    /**
     * Gets the path to the $def
     * @param context - The context name. For example, `item in items` creates the `item` context.
     * @returns A string to use as a $ref
     */
    private getDefsPath;
    /**
     * Get the schema $id
     * @param customElementName - The custom element name
     * @param propertyName - The property name
     * @returns The ID that can be used in the JSON schema as $id
     */
    private getSchemaId;
    /**
     * Add a new JSON schema to the JSON schema map
     * @param propertyName - The name of the property to assign this JSON schema to.
     */
    private addNewSchema;
    /**
     * Add properties to a context
     * @param schema - The schema to add the properties to.
     * @param splitPath - The path split into property/context names.
     * @param context - The path context.
     */
    private addPropertiesToAContext;
    /**
     * Add properties to an object
     * @param schema - The schema to add the properties to.
     * @param splitPath - The path split into property/context names.
     * @param context - The path context.
     * @param type - The data type (see JSON schema for details).
     */
    private addPropertiesToAnObject;
    /**
     * Add an array to an object property
     * @param schema - The schema to add the properties to.
     * @param context - The name of the context.
     */
    private addArrayToAnObject;
    /**
     * Add a context to the $defs property
     * @param schema - The schema to use.
     * @param propertyName - The name of the property the context belongs to.
     * @param currentContext - The current context.
     * @param parentContext - The parent context.
     * @returns
     */
    private addContext;
    /**
     * Get parent contexts
     * @param schema - The schema to use.
     * @param parentContext - The parent context.
     * @param contexts - A list of parent contexts.
     * @returns
     */
    private getParentContexts;
}
export {};
