// The context, in most cases the array property e.g. users
export const fastContextMetaData = "$fast_context";
// The list of contexts preceeding this context, the first of which should be the root property
export const fastContextsMetaData = "$fast_parent_contexts";
export const defsPropertyName = "$defs";
export const refPropertyName = "$ref";
/**
 * Module-level registry that maps custom element names to their schema maps.
 * Used for cross-element `$ref` resolution (e.g. nested element schemas).
 * Each Schema instance registers itself here on construction.
 * @public
 */
export const schemaRegistry = new Map();
/**
 * A constructed JSON schema from a template
 * @public
 */
export class Schema {
    constructor(name) {
        this.customElementName = name;
        this.schemaMap = new Map();
        schemaRegistry.set(name, this.schemaMap);
    }
    /**
     * Add a path to a schema
     * @param config - The path registration configuration.
     */
    addPath(config) {
        var _a, _b, _c;
        const splitPath = this.getSplitPath(config.pathConfig.path);
        let schema = this.schemaMap.get(config.rootPropertyName);
        let childRef = null;
        // Create a root level property JSON
        if (!schema) {
            this.addNewSchema(config.rootPropertyName);
            schema = this.schemaMap.get(config.rootPropertyName);
        }
        if (config.childrenMap) {
            childRef = this.getSchemaId(config.childrenMap.customElementName, config.childrenMap.attributeName);
            if (splitPath.length === 1) {
                schema.anyOf
                    ? schema.anyOf.push({ [refPropertyName]: childRef })
                    : (schema.anyOf = [{ [refPropertyName]: childRef }]);
            }
        }
        switch (config.pathConfig.type) {
            case "default":
            case "access": {
                if (splitPath.length > 1) {
                    if (config.pathConfig.currentContext === null) {
                        this.addPropertiesToAnObject(schema, splitPath.slice(1), config.pathConfig.currentContext, childRef);
                    }
                    else {
                        if (!((_a = schema[defsPropertyName]) === null || _a === void 0 ? void 0 : _a[splitPath[0]])) {
                            schema[defsPropertyName] = Object.assign(Object.assign({}, schema[defsPropertyName]), { [splitPath[0]]: {} });
                        }
                        this.addPropertiesToAContext(schema[defsPropertyName][splitPath[0]], splitPath.slice(1), config.pathConfig.currentContext, childRef);
                    }
                }
                break;
            }
            case "repeat": {
                this.addContext(schema, splitPath[splitPath.length - 1], // example items
                config.pathConfig.currentContext, // example item
                config.pathConfig.parentContext);
                if (splitPath.length > 2) {
                    let updatedSchema = schema;
                    const hasParentContext = !!config.pathConfig.parentContext;
                    if (hasParentContext) {
                        updatedSchema = this.addPropertiesToAnObject((_b = schema[defsPropertyName]) === null || _b === void 0 ? void 0 : _b[config.pathConfig.parentContext], splitPath.slice(1, -1), config.pathConfig.parentContext, childRef);
                    }
                    this.addPropertiesToAnObject(updatedSchema, hasParentContext ? splitPath.slice(2) : splitPath.slice(1), config.pathConfig.currentContext, childRef, "array");
                }
                else if (splitPath.length > 1) {
                    let schemaDefinition;
                    if (config.pathConfig.parentContext) {
                        schemaDefinition = (_c = schema === null || schema === void 0 ? void 0 : schema[defsPropertyName]) === null || _c === void 0 ? void 0 : _c[config.pathConfig.parentContext];
                    }
                    this.addPropertiesToAnObject(schemaDefinition !== null && schemaDefinition !== void 0 ? schemaDefinition : schema, splitPath.slice(1), config.pathConfig.currentContext, childRef, "array");
                }
                else {
                    schema.type = "array";
                    schema[refPropertyName] = this.getDefsPath(config.pathConfig.currentContext);
                }
                break;
            }
        }
    }
    /**
     * Gets the JSON schema for a property name
     * @param rootPropertyName - the root property the JSON schema is mapped to
     * @returns The JSON schema for the root property
     */
    getSchema(rootPropertyName) {
        var _a;
        return (_a = this.schemaMap.get(rootPropertyName)) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * Gets root properties
     * @returns IterableIterator<string>
     */
    getRootProperties() {
        return this.schemaMap.keys();
    }
    /**
     * Get a path split into property names
     * @param path - The dot syntax path, e.g. `a.b.c`.
     * @returns An array of items in the path
     */
    getSplitPath(path) {
        return path.split(".");
    }
    /**
     * Gets the path to the $def
     * @param context - The context name. For example, `item in items` creates the `item` context.
     * @returns A string to use as a $ref
     */
    getDefsPath(context) {
        return `#/${defsPropertyName}/${context}`;
    }
    /**
     * Get the schema $id
     * @param customElementName - The custom element name
     * @param propertyName - The property name
     * @returns The ID that can be used in the JSON schema as $id
     */
    getSchemaId(customElementName, propertyName) {
        return `https://fast.design/schemas/${customElementName}/${propertyName}.json`;
    }
    /**
     * Add a new JSON schema to the JSON schema map
     * @param propertyName - The name of the property to assign this JSON schema to.
     */
    addNewSchema(propertyName) {
        this.schemaMap.set(propertyName, {
            $schema: "https://json-schema.org/draft/2019-09/schema",
            $id: this.getSchemaId(this.customElementName, propertyName),
            [defsPropertyName]: {},
        });
    }
    /**
     * Add properties to a context
     * @param schema - The schema to add the properties to.
     * @param splitPath - The path split into property/context names.
     * @param context - The path context.
     */
    addPropertiesToAContext(schema, splitPath, context, childRef) {
        schema.type = "object";
        if (schema.properties && !schema.properties[splitPath[0]]) {
            schema.properties[splitPath[0]] = {};
        }
        else if (!schema.properties) {
            schema.properties = {
                [splitPath[0]]: {},
            };
        }
        if (splitPath.length > 1) {
            this.addPropertiesToAnObject(schema.properties[splitPath[0]], splitPath.slice(1), context, childRef);
        }
        else if (childRef) {
            if (schema.properties[splitPath[0]].anyOf) {
                schema.properties[splitPath[0]].anyOf.push({
                    [refPropertyName]: childRef,
                });
            }
            else {
                schema.properties[splitPath[0]].anyOf = [{ [refPropertyName]: childRef }];
            }
        }
    }
    /**
     * Add properties to an object
     * @param schema - The schema to add the properties to.
     * @param splitPath - The path split into property/context names.
     * @param context - The path context.
     * @param type - The data type (see JSON schema for details).
     */
    addPropertiesToAnObject(schema, splitPath, context, childRef, type = "object") {
        schema.type = "object";
        if (schema.properties && !schema.properties[splitPath[0]]) {
            schema.properties[splitPath[0]] = {};
        }
        else if (!schema.properties) {
            schema.properties = {
                [splitPath[0]]: {},
            };
        }
        if (type === "object" && splitPath.length > 1) {
            return this.addPropertiesToAnObject(schema.properties[splitPath[0]], splitPath.slice(1), context, childRef, type);
        }
        else if (type === "array") {
            if (splitPath.length > 1) {
                return this.addPropertiesToAnObject(schema.properties[splitPath[0]], splitPath.slice(1), context, childRef, type);
            }
            else {
                return this.addArrayToAnObject(schema.properties[splitPath[0]], context);
            }
        }
        if (schema.properties[splitPath[0]].anyOf && childRef) {
            schema.properties[splitPath[0]].anyOf.push({ [refPropertyName]: childRef });
        }
        else if (childRef) {
            schema.properties[splitPath[0]].anyOf = [{ [refPropertyName]: childRef }];
        }
        return schema.properties[splitPath[0]];
    }
    /**
     * Add an array to an object property
     * @param schema - The schema to add the properties to.
     * @param context - The name of the context.
     */
    addArrayToAnObject(schema, context) {
        schema.type = "array";
        schema.items = {
            [refPropertyName]: this.getDefsPath(context),
        };
        return schema.items;
    }
    /**
     * Add a context to the $defs property
     * @param schema - The schema to use.
     * @param propertyName - The name of the property the context belongs to.
     * @param currentContext - The current context.
     * @param parentContext - The parent context.
     * @returns
     */
    addContext(schema, propertyName, // e.g items
    currentContext, // e.g. item
    parentContext) {
        if (schema[defsPropertyName][currentContext]) {
            return;
        }
        schema[defsPropertyName][currentContext] = {
            [fastContextMetaData]: propertyName,
            [fastContextsMetaData]: this.getParentContexts(schema, parentContext),
        };
    }
    /**
     * Get parent contexts
     * @param schema - The schema to use.
     * @param parentContext - The parent context.
     * @param contexts - A list of parent contexts.
     * @returns
     */
    getParentContexts(schema, parentContext, contexts = []) {
        var _a;
        if (parentContext === null) {
            return [null, ...contexts];
        }
        const parentParentContext = (_a = schema === null || schema === void 0 ? void 0 : schema[defsPropertyName]) === null || _a === void 0 ? void 0 : _a[parentContext][fastContextsMetaData];
        return this.getParentContexts(schema, parentParentContext[parentParentContext.length - 1], [parentContext, ...contexts]);
    }
}
