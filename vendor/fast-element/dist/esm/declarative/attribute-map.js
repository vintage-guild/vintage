import { AttributeDefinition } from "../components/attributes.js";
import { setDefinitionSchemaTransform } from "../components/definition-schema-transforms.js";
import { hasFASTElementTemplateResolver, trackLateAttributeDefinition, } from "../components/fast-definitions.js";
import { Observable } from "../observation/observable.js";
export { Schema, schemaRegistry, } from "../components/schema.js";
const attributeMapSchemaTransformKey = "attribute-map";
const attributeMapSchemaTransformPriority = 0;
function defineAttributeMap(definition, schema, config) {
    new AttributeMap(definition.type.prototype, schema, definition, config).defineProperties();
}
/**
 * Creates a FAST element extension that enables schema-driven attribute mapping
 * for the resolved definition. When called without arguments, uses the default
 * attribute-mapping behavior. The extension uses `definition.schema` immediately
 * for manual schemas, or the schema generated/augmented by `declarativeTemplate()`.
 * @public
 */
export function attributeMap(config = {}) {
    return definition => {
        const hasTemplateResolver = hasFASTElementTemplateResolver(definition);
        if (definition.schema && !hasTemplateResolver) {
            defineAttributeMap(definition, definition.schema, config);
            return;
        }
        if (!hasTemplateResolver) {
            throw new Error("attributeMap requires a schema. Provide one via FASTElement definition or use declarativeTemplate().");
        }
        setDefinitionSchemaTransform(definition, attributeMapSchemaTransformKey, ({ definition, schema }) => defineAttributeMap(definition, schema, config), attributeMapSchemaTransformPriority);
    };
}
/**
 * Converts a camelCase string to kebab-case.
 *
 * @example camelToKebab("fooBar")       // "foo-bar"
 * @example camelToKebab("myCustomProp") // "my-custom-prop"
 * @example camelToKebab("label")        // "label"
 */
function camelToKebab(str) {
    return str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
}
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
export class AttributeMap {
    constructor(classPrototype, schema, definition, config) {
        this.classPrototype = classPrototype;
        this.schema = schema;
        this.definition = definition;
        this.config = config;
    }
    defineProperties() {
        var _a, _b;
        const propertyNames = this.schema.getRootProperties();
        const existingAccessorNames = new Set(Observable.getAccessors(this.classPrototype).map(a => a.name));
        const strategy = (_b = (_a = this.config) === null || _a === void 0 ? void 0 : _a["attribute-name-strategy"]) !== null && _b !== void 0 ? _b : "camelCase";
        for (const propertyName of propertyNames) {
            const propertySchema = this.schema.getSchema(propertyName);
            // Only create @attr for leaf properties:
            // - no nested properties (not a dot-syntax path)
            // - no type (not an explicitly typed value like an array)
            // - no anyOf (not a child element reference)
            if (!propertySchema ||
                propertySchema.properties ||
                propertySchema.type ||
                propertySchema.anyOf) {
                continue;
            }
            // Skip if the property already has an accessor (from @attr or @observable)
            if (existingAccessorNames.has(propertyName)) {
                continue;
            }
            // Derive the HTML attribute name from the property name.
            // With "camelCase" strategy, convert camelCase to kebab-case
            // (e.g. fooBar → foo-bar). With "none", use the property name as-is.
            const attributeName = strategy === "camelCase" ? camelToKebab(propertyName) : propertyName;
            const attrDef = new AttributeDefinition(this.classPrototype.constructor, propertyName, attributeName);
            Observable.defineProperty(this.classPrototype, attrDef);
            // Mutate the existing observedAttributes array on the class.
            // FAST's FASTElementDefinition sets observedAttributes via
            // Reflect.defineProperty with a concrete array value (non-configurable,
            // non-writable), so the descriptor cannot be replaced. However, the
            // array itself is mutable, and pushing into it works because
            // registry.define() — which causes the browser to snapshot
            // observedAttributes — is called AFTER this method runs.
            const existingObservedAttrs = this.classPrototype.constructor.observedAttributes;
            if (Array.isArray(existingObservedAttrs) &&
                !existingObservedAttrs.includes(attributeName)) {
                existingObservedAttrs.push(attributeName);
            }
            if (this.definition) {
                this.definition.attributeLookup[attributeName] = attrDef;
                this.definition.propertyLookup[propertyName] = attrDef;
                const attrs = this.definition.attributes;
                if (Array.isArray(attrs) &&
                    !attrs.some((existing) => existing.name === attrDef.name ||
                        existing.attribute === attrDef.attribute)) {
                    attrs.push(attrDef);
                }
                if (this.definition.isDefined) {
                    trackLateAttributeDefinition(this.definition, attrDef);
                }
            }
        }
    }
}
