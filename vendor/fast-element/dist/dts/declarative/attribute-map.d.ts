import { type FASTElementExtension } from "../components/fast-definitions.js";
import type { Schema } from "../components/schema.js";
export { type AccessCachedPath, type CachedPath, type CachedPathCommon, type CachedPathMap, type ChildrenMap, type DefaultCachedPath, type EventCachedPath, type JSONSchema, type JSONSchemaCommon, type JSONSchemaDefinition, type RegisterPathConfig, type RepeatCachedPath, Schema, schemaRegistry, } from "../components/schema.js";
/**
 * Configuration object for the attributeMap extension.
 * Omitting all fields uses the default attribute-mapping behavior.
 * @public
 */
export interface AttributeMapConfig {
    /**
     * Strategy for mapping template binding keys to HTML attribute names.
     *
     * - `"camelCase"` (default): the binding key is treated as a camelCase property
     *   name and the attribute name is derived by converting it to
     *   kebab-case (e.g. `{{fooBar}}` → property `fooBar`, attribute
     *   `foo-bar`). This matches the build-time `attribute-name-strategy`
     *   option in `@microsoft/fast-build`.
     * - `"none"`: the binding key is used as-is for both the
     *   property name and the attribute name (e.g. `{{foo-bar}}` →
     *   property `foo-bar`, attribute `foo-bar`).
     */
    "attribute-name-strategy"?: "none" | "camelCase";
}
/**
 * Creates a FAST element extension that enables schema-driven attribute mapping
 * for the resolved definition. When called without arguments, uses the default
 * attribute-mapping behavior. The extension uses `definition.schema` immediately
 * for manual schemas, or the schema generated/augmented by `declarativeTemplate()`.
 * @public
 */
export declare function attributeMap(config?: AttributeMapConfig): FASTElementExtension;
/**
 * AttributeMap provides functionality for detecting simple (leaf) properties in
 * a generated JSON schema and defining them as attr properties on a class prototype.
 *
 * A property is a candidate for attr when its schema entry has no nested `properties`,
 * no `type`, and no `anyOf` — for example, a plain `foo` binding.
 *
 * When `attribute-name-strategy` is `"camelCase"` (the default), the binding key is treated as a
 * camelCase property name and the HTML attribute name is derived by converting it to
 * kebab-case (e.g. property `fooBar` → attribute `foo-bar`). This matches the
 * build-time `attribute-name-strategy` option in `@microsoft/fast-build`.
 *
 * When `attribute-name-strategy` is `"none"`, the binding key is used
 * as both the attribute name and property name — no normalization is applied.
 *
 * Properties already decorated with `attr` or `observable` on the class are left
 * untouched.
 * @public
 */
export declare class AttributeMap {
    private schema;
    private classPrototype;
    private definition;
    private config;
    constructor(classPrototype: any, schema: Schema, definition?: any, config?: AttributeMapConfig);
    defineProperties(): void;
}
