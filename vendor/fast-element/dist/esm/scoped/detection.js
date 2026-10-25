/**
 * Detection and polyfill loading for Scoped Custom Element Registries.
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
/**
 * Default DEV_MODE value when not defined at build time.
 * @internal
 */
const isDev = typeof DEV_MODE !== "undefined" ? DEV_MODE : true;
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
export function supportsScopedRegistries() {
    try {
        // Test 1: Can we construct a CustomElementRegistry?
        const reg = new CustomElementRegistry();
        // Test 2: Can we use it with attachShadow?
        const div = document.createElement("div");
        const shadow = div.attachShadow({
            mode: "open",
            customElementRegistry: reg,
            registry: reg,
        });
        const scopedShadow = shadow;
        return (scopedShadow.customElementRegistry === reg || scopedShadow.registry === reg);
    }
    catch (_a) {
        return false;
    }
}
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
export function ensureScopedRegistrySupport() {
    return __awaiter(this, void 0, void 0, function* () {
        // Check native support first
        if (supportsScopedRegistries()) {
            return;
        }
        const scope = globalThis;
        if (scope.__scopedRegistryPolyfillPromise) {
            return scope.__scopedRegistryPolyfillPromise;
        }
        scope.__scopedRegistryPolyfillPromise = import("@webcomponents/scoped-custom-element-registry")
            .then(() => {
            scope.__scopedRegistryPolyfillApplied = true;
            if (isDev) {
                console.info("[fast-af] Scoped registry polyfill loaded successfully");
            }
        })
            .catch(e => {
            scope.__scopedRegistryPolyfillApplied = false;
            scope.__scopedRegistryPolyfillPromise = void 0;
            const error = new Error("[fast-af] Failed to load scoped registry polyfill");
            error.cause = e;
            throw error;
        });
        return scope.__scopedRegistryPolyfillPromise;
    });
}
