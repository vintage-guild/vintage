import { isFunction, isString } from "../interfaces.js";
import { Observable } from "../observation/observable.js";
import { ElementStyles } from "../styles/element-styles.js";
import { AttributeDefinition } from "./attributes.js";
import { fastElementRegistry } from "./fast-element-registry.js";
const defaultShadowOptions = { mode: "open" };
const defaultElementOptions = {};
const fastElementBaseTypes = new Set();
function normalizeShadowOptions(options) {
    if (options === null) {
        return void 0;
    }
    const normalized = Object.assign(Object.assign({}, defaultShadowOptions), options);
    if (normalized.customElementRegistry === void 0 && normalized.registry !== void 0) {
        normalized.customElementRegistry = normalized.registry;
    }
    if (normalized.registry === void 0 && normalized.customElementRegistry !== void 0) {
        normalized.registry = normalized.customElementRegistry;
    }
    return normalized;
}
const templateResolvers = new WeakMap();
const pendingTemplateResolutions = new WeakMap();
const templateResolutionErrors = new WeakMap();
const extensionRegistries = new WeakMap();
const registeredExtensions = new Set();
const lateAttributeLookups = new WeakMap();
function isFASTElementTemplateResolver(value) {
    return isFunction(value);
}
function isPromiseLike(value) {
    return typeof (value === null || value === void 0 ? void 0 : value.then) === "function";
}
function finalizeResolvedTemplate(definition, template) {
    pendingTemplateResolutions.delete(definition);
    if (definition.template === void 0 && template !== void 0) {
        definition.template = template;
    }
    if (definition.template !== void 0) {
        templateResolutionErrors.delete(definition);
        templateResolvers.delete(definition);
        return definition.template;
    }
    return void 0;
}
/**
 * Applies extension callbacks to a FAST element definition.
 * @internal
 */
export function applyFASTElementExtensions(definition, registry = definition.registry, extensions) {
    if (registeredExtensions.size === 0 && !(extensions === null || extensions === void 0 ? void 0 : extensions.length)) {
        return;
    }
    const typedDefinition = definition;
    let registries = extensionRegistries.get(typedDefinition);
    if (registries === null || registries === void 0 ? void 0 : registries.has(registry)) {
        return;
    }
    if (registries === void 0) {
        registries = new WeakSet();
        extensionRegistries.set(typedDefinition, registries);
    }
    registries.add(registry);
    for (const extension of registeredExtensions) {
        extension(definition, registry);
    }
    for (const extension of extensions !== null && extensions !== void 0 ? extensions : []) {
        if (!registeredExtensions.has(extension)) {
            extension(definition, registry);
        }
    }
}
/**
 * Registers an extension that applies to every subsequently defined FAST element.
 * @param extension - The extension to register.
 * @returns A callback that removes the extension registration.
 * @internal
 */
export function registerFASTElementExtension(extension) {
    registeredExtensions.add(extension);
    return () => {
        registeredExtensions.delete(extension);
    };
}
/**
 * Tracks attribute definitions that were added after the element was already
 * registered with the platform and therefore are not covered by the browser's
 * static observedAttributes snapshot.
 * @internal
 */
export function trackLateAttributeDefinition(definition, attribute) {
    const typedDefinition = definition;
    let lateAttributeLookup = lateAttributeLookups.get(typedDefinition);
    if (lateAttributeLookup === void 0) {
        const lookup = Object.create(null);
        lateAttributeLookups.set(typedDefinition, lookup);
        lateAttributeLookup = lookup;
    }
    lateAttributeLookup[attribute.attribute] = attribute;
}
/**
 * Gets the attribute definitions that were added after platform registration.
 * @internal
 */
export function getLateAttributeLookup(definition) {
    var _a;
    return ((_a = lateAttributeLookups.get(definition)) !== null && _a !== void 0 ? _a : null);
}
/**
 * Resolves the concrete template for a FAST element definition when the
 * definition was composed with a template resolver.
 * @internal
 */
export function resolveFASTElementTemplate(definition) {
    if (definition.template !== void 0) {
        templateResolutionErrors.delete(definition);
        return definition.template;
    }
    const pendingResolution = pendingTemplateResolutions.get(definition);
    if (pendingResolution) {
        return pendingResolution;
    }
    const templateResolver = templateResolvers.get(definition);
    if (!templateResolver) {
        return void 0;
    }
    templateResolutionErrors.delete(definition);
    let template;
    try {
        template = templateResolver(definition);
    }
    catch (error) {
        templateResolutionErrors.set(definition, error);
        throw error;
    }
    if (isPromiseLike(template)) {
        const resolution = Promise.resolve(template)
            .then(resolvedTemplate => finalizeResolvedTemplate(definition, resolvedTemplate))
            .catch(error => {
            pendingTemplateResolutions.delete(definition);
            templateResolutionErrors.set(definition, error);
            throw error;
        });
        pendingTemplateResolutions.set(definition, resolution);
        return resolution;
    }
    return finalizeResolvedTemplate(definition, template);
}
/**
 * Indicates whether a definition still has a pending template resolver.
 * @internal
 */
export function hasFASTElementTemplateResolver(definition) {
    return templateResolvers.has(definition);
}
/**
 * Gets any pending template resolution error for a FAST element definition.
 * @internal
 */
export function getFASTElementTemplateError(definition) {
    return templateResolutionErrors.get(definition);
}
/**
 * Sets or clears the template resolution error for a FAST element definition.
 * @internal
 */
export function setFASTElementTemplateError(definition, error) {
    const typedDefinition = definition;
    if (error === void 0) {
        templateResolutionErrors.delete(typedDefinition);
        return;
    }
    templateResolutionErrors.set(typedDefinition, error);
}
/**
 * Defines metadata for a FASTElement.
 * @public
 */
export class FASTElementDefinition {
    /**
     * Indicates if this element has been defined in at least one registry.
     */
    get isDefined() {
        return this.platformDefined;
    }
    constructor(type, nameOrConfig = type
        .definition) {
        var _a;
        this.platformDefined = false;
        if (isString(nameOrConfig)) {
            nameOrConfig = { name: nameOrConfig };
        }
        this.type = type;
        this.name = nameOrConfig.name;
        this.registry = (_a = nameOrConfig.registry) !== null && _a !== void 0 ? _a : customElements;
        if (isFASTElementTemplateResolver(nameOrConfig.template)) {
            templateResolvers.set(this, nameOrConfig.template);
        }
        else {
            this.template = nameOrConfig.template;
        }
        const proto = type.prototype;
        const attributes = AttributeDefinition.collect(type, nameOrConfig.attributes);
        const observedAttributes = new Array(attributes.length);
        const propertyLookup = {};
        const attributeLookup = {};
        for (let i = 0, ii = attributes.length; i < ii; ++i) {
            const current = attributes[i];
            observedAttributes[i] = current.attribute;
            propertyLookup[current.name] = current;
            attributeLookup[current.attribute] = current;
            Observable.defineProperty(proto, current);
        }
        Reflect.defineProperty(type, "observedAttributes", {
            value: observedAttributes,
            enumerable: true,
        });
        this.attributes = attributes;
        this.propertyLookup = propertyLookup;
        this.attributeLookup = attributeLookup;
        this.shadowOptions = normalizeShadowOptions(nameOrConfig.shadowOptions);
        this.elementOptions =
            nameOrConfig.elementOptions === void 0
                ? defaultElementOptions
                : Object.assign(Object.assign({}, defaultElementOptions), nameOrConfig.elementOptions);
        this.styles = ElementStyles.normalize(nameOrConfig.styles);
        this.schema = nameOrConfig.schema;
        fastElementRegistry.register(this);
    }
    /**
     * Defines a custom element based on this definition.
     * @param registry - The element registry to define the element in.
     * @param extensions - An optional array of extension callbacks to invoke
     * with this definition before platform registration.
     * @remarks
     * This operation is idempotent per registry.
     */
    define(registry = this.registry, extensions) {
        const type = this.type;
        if (!registry.get(this.name)) {
            applyFASTElementExtensions(this, registry, extensions);
            if (this.template === void 0 && templateResolvers.has(this)) {
                void Promise.resolve()
                    .then(() => resolveFASTElementTemplate(this))
                    .then(template => {
                    if (template !== void 0 && !registry.get(this.name)) {
                        this.platformDefined = true;
                        registry.define(this.name, type, this.elementOptions);
                    }
                })
                    .catch(error => {
                    setFASTElementTemplateError(this, error);
                    Observable.notify(this, "template");
                });
                return this;
            }
            this.platformDefined = true;
            registry.define(this.name, type, this.elementOptions);
        }
        return this;
    }
    /**
     * Creates an instance of FASTElementDefinition.
     * @param type - The type this definition is being created for.
     * @param nameOrDef - The name of the element to define or a config object
     * that describes the element to define.
     */
    static compose(type, nameOrDef) {
        const definition = fastElementBaseTypes.has(type) || fastElementRegistry.getByType(type)
            ? new FASTElementDefinition(class extends type {
            }, nameOrDef)
            : new FASTElementDefinition(type, nameOrDef);
        return Promise.resolve(definition);
    }
    /**
     * Registers a FASTElement base type.
     * @param type - The type to register as a base type.
     * @internal
     */
    static registerBaseType(type) {
        fastElementBaseTypes.add(type);
    }
}
/**
 * Gets the element definition associated with the specified type.
 * @param type - The custom element type to retrieve the definition for.
 */
FASTElementDefinition.getByType = fastElementRegistry.getByType;
/**
 * Gets the element definition associated with the instance.
 * @param instance - The custom element instance to retrieve the definition for.
 */
FASTElementDefinition.getForInstance = fastElementRegistry.getForInstance;
Observable.defineProperty(FASTElementDefinition.prototype, "template");
