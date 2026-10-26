/**
 * Detection and polyfill loading for Scoped Custom Element Registries.
 */
declare global {
    interface GlobalThis {
        __scopedRegistryPolyfillApplied?: boolean;
        __scopedRegistryPolyfillPromise?: Promise<void>;
    }
}
/**
 * Robust feature detection for Scoped Custom Element Registries.
 *
 * @remarks
 * Tests the full API surface, not just the constructor existence.
 * This ensures the browser actually supports attaching a custom registry
 * to a shadow root, which is the critical functionality.
 *
 * @returns true if the browser supports scoped custom element registries
 *
 * @example
 * ```typescript
 * if (supportsScopedRegistries()) {
 *   const registry = new CustomElementRegistry();
 *   element.attachShadow({ mode: 'open', customElementRegistry: registry });
 * }
 * ```
 *
 * @public
 */
export declare function supportsScopedRegistries(): boolean;
/**
 * Idempotency-safe polyfill loading for Scoped Custom Element Registries.
 *
 * @remarks
 * Safe to call from multiple micro-frontend bundles. Uses a global flag
 * (`window.__scopedRegistryPolyfillApplied`) to prevent double-patching
 * which could corrupt the CustomElementRegistry prototype.
 *
 * If native support is detected, returns immediately without loading the polyfill.
 * On polyfill load failure, the flag is reset to allow retry on subsequent calls.
 *
 * @throws Error if the polyfill fails to load (network error, etc.)
 *
 * @example
 * ```typescript
 * // At app startup
 * await ensureScopedRegistrySupport();
 *
 * // Now safe to use scoped registries
 * const registry = new CustomElementRegistry();
 * ```
 *
 * @public
 */
export declare function ensureScopedRegistrySupport(): Promise<void>;
