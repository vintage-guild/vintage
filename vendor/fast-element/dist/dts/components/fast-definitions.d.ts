import { type Constructable } from "../interfaces.js";
import type { TypeDefinition, TypeRegistry } from "../platform.js";
import { type ComposableStyles, ElementStyles } from "../styles/element-styles.js";
import type { ElementViewTemplate } from "../templating/template.js";
import { type AttributeConfiguration, AttributeDefinition } from "./attributes.js";
import type { Schema } from "./schema.js";
export type { TypeDefinition, TypeRegistry };
/**
 * Shadow root initialization options.
 * @public
 */
export interface ShadowRootOptions extends ShadowRootInit {
    /**
     * A registry that provides the custom elements visible
     * from within this shadow root.
     * @beta
     */
    registry?: CustomElementRegistry;
}
/**
 * A callback that receives a FASTElementDefinition during element registration.
 * Extensions are invoked before the element is registered with the platform,
 * allowing plugins to inspect or act on the resolved definition.
 * @public
 */
export type FASTElementExtension = (definition: FASTElementDefinition, registry: CustomElementRegistry) => void;
/**
 * Resolves an element template from a composed definition.
 * @public
 */
export type FASTElementTemplateResolver<TType extends Constructable<HTMLElement> = Constructable<HTMLElement>> = (definition: FASTElementDefinition<TType>) => ElementViewTemplate<InstanceType<TType>> | Promise<ElementViewTemplate<InstanceType<TType>>>;
/**
 * Applies extension callbacks to a FAST element definition.
 * @internal
 */
export declare function applyFASTElementExtensions(definition: FASTElementDefinition, registry?: CustomElementRegistry, extensions?: FASTElementExtension[]): void;
/**
 * Registers an extension that applies to every subsequently defined FAST element.
 * @param extension - The extension to register.
 * @returns A callback that removes the extension registration.
 * @internal
 */
export declare function registerFASTElementExtension(extension: FASTElementExtension): () => void;
/**
 * Tracks attribute definitions that were added after the element was already
 * registered with the platform and therefore are not covered by the browser's
 * static observedAttributes snapshot.
 * @internal
 */
export declare function trackLateAttributeDefinition(definition: FASTElementDefinition, attribute: AttributeDefinition): void;
/**
 * Gets the attribute definitions that were added after platform registration.
 * @internal
 */
export declare function getLateAttributeLookup(definition: FASTElementDefinition): Readonly<Record<string, AttributeDefinition>> | null;
/**
 * Resolves the concrete template for a FAST element definition when the
 * definition was composed with a template resolver.
 * @internal
 */
export declare function resolveFASTElementTemplate<TType extends Constructable<HTMLElement> = Constructable<HTMLElement>>(definition: FASTElementDefinition<TType>): ElementViewTemplate<InstanceType<TType>> | Promise<ElementViewTemplate<InstanceType<TType>> | undefined> | undefined;
/**
 * Indicates whether a definition still has a pending template resolver.
 * @internal
 */
export declare function hasFASTElementTemplateResolver<TType extends Constructable<HTMLElement> = Constructable<HTMLElement>>(definition: FASTElementDefinition<TType>): boolean;
/**
 * Gets any pending template resolution error for a FAST element definition.
 * @internal
 */
export declare function getFASTElementTemplateError<TType extends Constructable<HTMLElement> = Constructable<HTMLElement>>(definition: FASTElementDefinition<TType>): unknown;
/**
 * Sets or clears the template resolution error for a FAST element definition.
 * @internal
 */
export declare function setFASTElementTemplateError<TType extends Constructable<HTMLElement> = Constructable<HTMLElement>>(definition: FASTElementDefinition<TType>, error?: unknown): void;
/**
 * Represents metadata configuration for a custom element.
 * @public
 */
export interface PartialFASTElementDefinition<TType extends Constructable<HTMLElement> = Constructable<HTMLElement>> {
    /**
     * The name of the custom element.
     */
    readonly name: string;
    /**
     * The template, or template resolver, for the custom element.
     */
    readonly template?: ElementViewTemplate<InstanceType<TType>> | FASTElementTemplateResolver<TType>;
    /**
     * The styles to associate with the custom element.
     */
    readonly styles?: ComposableStyles | ComposableStyles[];
    /**
     * The custom attributes of the custom element.
     */
    readonly attributes?: (AttributeConfiguration | string)[];
    /**
     * Options controlling the creation of the custom element's shadow DOM.
     * @remarks
     * If not provided, defaults to an open shadow root. Provide null
     * to render to the associated template to the light DOM instead.
     */
    readonly shadowOptions?: Partial<ShadowRootOptions> | null;
    /**
     * Options controlling how the custom element is defined with the platform.
     */
    readonly elementOptions?: ElementDefinitionOptions;
    /**
     * The registry to register this component in by default.
     * @remarks
     * If not provided, defaults to the global registry.
     */
    readonly registry?: CustomElementRegistry;
    /**
     * The optional schema associated with the custom element definition.
     * Declarative templates assign this automatically during template resolution.
     * Non-declarative callers can provide one for schema-driven extensions.
     */
    readonly schema?: Schema;
}
/**
 * Defines metadata for a FASTElement.
 * @public
 */
export declare class FASTElementDefinition<TType extends Constructable<HTMLElement> = Constructable<HTMLElement>> {
    private platformDefined;
    /**
     * The type this element definition describes.
     */
    readonly type: TType;
    /**
     * Indicates if this element has been defined in at least one registry.
     */
    get isDefined(): boolean;
    /**
     * The name of the custom element.
     */
    readonly name: string;
    /**
     * The custom attributes of the custom element.
     */
    readonly attributes: ReadonlyArray<AttributeDefinition>;
    /**
     * A map enabling lookup of attribute by associated property name.
     */
    readonly propertyLookup: Record<string, AttributeDefinition>;
    /**
     * A map enabling lookup of property by associated attribute name.
     */
    readonly attributeLookup: Record<string, AttributeDefinition>;
    /**
     * The template to render for the custom element.
     */
    template?: ElementViewTemplate<InstanceType<TType>>;
    /**
     * The styles to associate with the custom element.
     */
    readonly styles?: ElementStyles;
    /**
     * Options controlling the creation of the custom element's shadow DOM.
     */
    shadowOptions?: ShadowRootOptions;
    /**
     * Options controlling how the custom element is defined with the platform.
     */
    readonly elementOptions: ElementDefinitionOptions;
    /**
     * The registry to register this component in by default.
     */
    readonly registry: CustomElementRegistry;
    /**
     * The optional schema associated with the custom element definition.
     * Declarative templates assign this automatically during template resolution.
     * Non-declarative callers can provide one for schema-driven extensions.
     */
    schema?: Schema;
    private constructor();
    /**
     * Defines a custom element based on this definition.
     * @param registry - The element registry to define the element in.
     * @param extensions - An optional array of extension callbacks to invoke
     * with this definition before platform registration.
     * @remarks
     * This operation is idempotent per registry.
     */
    define(registry?: CustomElementRegistry, extensions?: FASTElementExtension[]): this;
    /**
     * Creates an instance of FASTElementDefinition.
     * @param type - The type this definition is being created for.
     * @param nameOrDef - The name of the element to define or a config object
     * that describes the element to define.
     */
    static compose<TType extends Constructable<HTMLElement> = Constructable<HTMLElement>>(type: TType, nameOrDef?: string | PartialFASTElementDefinition<TType>): Promise<FASTElementDefinition<TType>>;
    /**
     * Registers a FASTElement base type.
     * @param type - The type to register as a base type.
     * @internal
     */
    static registerBaseType(type: Function): void;
    /**
     * Gets the element definition associated with the specified type.
     * @param type - The custom element type to retrieve the definition for.
     */
    static readonly getByType: (key: Function) => FASTElementDefinition<Constructable<HTMLElement>> | undefined;
    /**
     * Gets the element definition associated with the instance.
     * @param instance - The custom element instance to retrieve the definition for.
     */
    static readonly getForInstance: (object: any) => FASTElementDefinition<Constructable<HTMLElement>> | undefined;
}
