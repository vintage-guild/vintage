/**
 * ScopedRegistryMixin for FAST Elements.
 *
 * @remarks
 * Provides a mixin that enables components to define and use scoped registries,
 * following the Lit labs pattern. Child elements are isolated within the
 * component's shadow root.
 */
import type { ScopedShadowRootInit } from "./types.js";
/**
 * Map of element definitions: tag-name to constructor.
 *
 * @remarks
 * Used with ScopedRegistryMixin to define child elements that should
 * be registered in the component's scoped registry.
 *
 * @example
 * ```typescript
 * static elementDefinitions: ElementDefinitionMap = {
 *   'my-button': MyButton,
 *   'my-input': MyInput,
 * };
 * ```
 *
 * @public
 */
export type ElementDefinitionMap = Record<string, CustomElementConstructor>;
/**
 * Interface for classes that host a scoped registry.
 *
 * @remarks
 * Implemented by classes using the ScopedRegistryMixin.
 *
 * @public
 */
export interface ScopedRegistryHost {
    /**
     * Static element definitions for the scoped registry.
     */
    elementDefinitions?: ElementDefinitionMap;
    /**
     * The scoped registry created from elementDefinitions.
     * @remarks
     * Lazily created on first access.
     */
    scopedRegistry: CustomElementRegistry | undefined;
}
/**
 * Static interface for ScopedRegistryMixin classes.
 * @public
 */
export interface ScopedRegistryHostConstructor {
    /**
     * Static element definitions for the scoped registry.
     */
    elementDefinitions?: ElementDefinitionMap;
    /**
     * The scoped registry created from elementDefinitions.
     */
    readonly scopedRegistry: CustomElementRegistry | undefined;
    /**
     * Gets shadow root options with the scoped registry configured.
     * @param baseOptions - Optional base shadow root options to extend
     * @returns Shadow root options with customElementRegistry if applicable
     */
    getShadowOptions(baseOptions?: ScopedShadowRootInit): ScopedShadowRootInit;
}
/**
 * Creates a mixin that enables scoped custom element registries for a FASTElement.
 *
 * @remarks
 * The ScopedRegistryMixin provides a way to define child elements that are
 * scoped to the component's shadow root, preventing namespace collisions
 * in micro-frontend scenarios and enabling design system versioning.
 *
 * The mixin adds:
 * - A static `elementDefinitions` property for defining child elements
 * - A static `scopedRegistry` getter that lazily creates the registry
 * - A method to get shadow root options with the scoped registry
 *
 * When scoped registries are not supported by the browser, elements fall back
 * to the global registry with a development warning.
 *
 * @param Base - The FASTElement base class to extend
 * @returns A class that supports scoped element definitions
 *
 * @example
 * ```typescript
 * import { FASTElement, html, css } from '@lushly-dev/fast-element';
 * import { ScopedRegistryMixin } from '@lushly-dev/fast-element/scoped.js';
 *
 * class MyButton extends FASTElement {
 *   // Button implementation
 * }
 *
 * class MyCard extends ScopedRegistryMixin(FASTElement) {
 *   static elementDefinitions = {
 *     'my-button': MyButton,
 *   };
 * }
 *
 * // Define with scoped registry support
 * MyCard.define({
 *   name: 'my-card',
 *   template: html`<my-button>Click me</my-button>`,
 *   shadowOptions: MyCard.getShadowOptions(),
 * });
 * ```
 *
 * @public
 */
export declare function ScopedRegistryMixin<T extends CustomElementConstructor>(Base: T): T & ScopedRegistryHostConstructor;
