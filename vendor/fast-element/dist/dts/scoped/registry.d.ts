/**
 * Registry builder utilities for Scoped Custom Element Registries.
 */
import type { CreateRegistryOptions, ElementDefinition } from "./types.js";
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
export declare function createRegistry(definitions: ElementDefinition[], options?: CreateRegistryOptions): CustomElementRegistry | undefined;
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
export declare function createRegistryAsync(definitions: ElementDefinition[], options?: CreateRegistryOptions): Promise<CustomElementRegistry>;
