/**
 * Registry builder utilities for Scoped Custom Element Registries.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { fastElementRegistry } from "../components/fast-element-registry.js";
import { ensureScopedRegistrySupport, supportsScopedRegistries } from "./detection.js";
/**
 * Default DEV_MODE value when not defined at build time.
 * @internal
 */
const isDev = typeof DEV_MODE !== "undefined" ? DEV_MODE : true;
function defineElements(registry, definitions) {
    for (const [ctor, tagName] of definitions) {
        if (registry.get(tagName)) {
            continue;
        }
        const fastDefinition = fastElementRegistry.getByType(ctor);
        if ((fastDefinition === null || fastDefinition === void 0 ? void 0 : fastDefinition.name) === tagName) {
            fastDefinition.define(registry);
        }
        else {
            registry.define(tagName, ctor, fastDefinition === null || fastDefinition === void 0 ? void 0 : fastDefinition.elementOptions);
        }
    }
}
/**
 * Creates a scoped custom element registry with the provided element definitions.
 *
 * @remarks
 * When scoped registries are supported, creates a new CustomElementRegistry
 * and defines all provided elements in it. When not supported, falls back to
 * registering elements on the global `customElements` registry (with a dev warning).
 *
 * In strict mode, throws an error if scoped registries are not supported
 * instead of falling back to the global registry.
 *
 * @param definitions - Array of [Constructor, tagName] tuples to register
 * @param options - Configuration options
 * @returns The created registry, or undefined if fallback to global occurred
 *
 * @example
 * ```typescript
 * // Basic usage
 * const registry = createRegistry([
 *   [MyButton, 'my-button'],
 *   [MyInput, 'my-input'],
 * ]);
 *
 * if (registry) {
 *   element.attachShadow({ mode: 'open', customElementRegistry: registry });
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Strict mode - throws if not supported
 * const registry = createRegistry(
 *   [[MyButton, 'my-button']],
 *   { strict: true }
 * );
 * ```
 *
 * @public
 */
export function createRegistry(definitions, options) {
    if (!supportsScopedRegistries()) {
        if (options === null || options === void 0 ? void 0 : options.strict) {
            throw new Error("[fast-af] Scoped custom element registries are not supported in this browser");
        }
        if (isDev) {
            console.warn("[fast-af] Scoped registries not supported. Falling back to global registry. " +
                "Elements will be globally registered which may cause conflicts in MFE scenarios.");
        }
        // Fallback: register on global registry
        defineElements(customElements, definitions);
        return undefined; // Signal fallback occurred
    }
    const registry = new CustomElementRegistry();
    defineElements(registry, definitions);
    return registry;
}
/**
 * Creates a scoped custom element registry with automatic polyfill loading.
 *
 * @remarks
 * This async version first ensures scoped registry support is available
 * (loading the polyfill if necessary), then creates the registry.
 *
 * Unlike `createRegistry()`, this function always operates in strict mode
 * after polyfill loading, as the polyfill should provide support. If the
 * polyfill fails to load, the underlying `ensureScopedRegistrySupport()`
 * will throw.
 *
 * @param definitions - Array of [Constructor, tagName] tuples to register
 * @param options - Configuration options (strict is always true after polyfill)
 * @returns Promise resolving to the created registry
 *
 * @throws Error if polyfill loading fails
 *
 * @example
 * ```typescript
 * // Automatically loads polyfill if needed
 * const registry = await createRegistryAsync([
 *   [MyButton, 'my-button'],
 *   [MyInput, 'my-input'],
 * ]);
 *
 * element.attachShadow({ mode: 'open', customElementRegistry: registry });
 * ```
 *
 * @public
 */
export function createRegistryAsync(definitions, options) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureScopedRegistrySupport();
        // After polyfill loading, we should have support - use strict mode
        const registry = createRegistry(definitions, Object.assign(Object.assign({}, options), { strict: true }));
        // TypeScript knows this won't be undefined because strict: true would throw
        return registry;
    });
}
