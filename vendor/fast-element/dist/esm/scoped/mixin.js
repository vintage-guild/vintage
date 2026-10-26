/**
 * ScopedRegistryMixin for FAST Elements.
 *
 * @remarks
 * Provides a mixin that enables components to define and use scoped registries,
 * following the Lit labs pattern. Child elements are isolated within the
 * component's shadow root.
 */
import { createRegistry } from "./registry.js";
/**
 * Default DEV_MODE value when not defined at build time.
 * @internal
 */
const isDev = typeof DEV_MODE !== "undefined" ? DEV_MODE : true;
const initializedConstructors = new WeakSet();
const scopedRegistries = new WeakMap();
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
export function ScopedRegistryMixin(Base) {
    return class ScopedRegistryMixinClass extends Base {
        /**
         * Gets the scoped registry for this element class.
         * @remarks
         * Lazily creates the registry from elementDefinitions on first access.
         * Returns undefined if no definitions exist or if scoped registries
         * are not supported (fallback to global).
         */
        static get scopedRegistry() {
            if (!initializedConstructors.has(this)) {
                initializedConstructors.add(this);
                if (this.elementDefinitions) {
                    const keys = Object.keys(this.elementDefinitions);
                    if (keys.length > 0) {
                        // Convert { 'tag-name': Ctor } to [Ctor, 'tag-name'] format
                        const elementDefs = [];
                        for (let i = 0, len = keys.length; i < len; i++) {
                            const tagName = keys[i];
                            const ctor = this.elementDefinitions[tagName];
                            elementDefs.push([ctor, tagName]);
                        }
                        const registry = createRegistry(elementDefs);
                        scopedRegistries.set(this, registry);
                        if (isDev && registry) {
                            console.debug("[fast-af] Created scoped registry for " +
                                this.name +
                                " with " +
                                keys.length +
                                " element(s)");
                        }
                    }
                }
            }
            return scopedRegistries.get(this);
        }
        /**
         * Gets shadow root options with the scoped registry configured.
         * @remarks
         * Use this method when defining the element to include the scoped registry.
         * Returns options with customElementRegistry set if a registry was created.
         *
         * @param baseOptions - Optional base shadow root options to extend
         * @returns Shadow root options with customElementRegistry if applicable
         *
         * @example
         * ```typescript
         * MyComponent.define({
         *   name: 'my-component',
         *   template: myTemplate,
         *   shadowOptions: MyComponent.getShadowOptions({ mode: 'closed' }),
         * });
         * ```
         */
        static getShadowOptions(baseOptions) {
            const registry = this.scopedRegistry;
            const options = Object.assign({ mode: "open" }, baseOptions);
            if (registry) {
                options.customElementRegistry = registry;
                options.registry = registry;
            }
            return options;
        }
    };
}
