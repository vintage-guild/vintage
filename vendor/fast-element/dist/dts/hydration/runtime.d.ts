/**
 * Installs the hydration runtime on `ViewTemplate.prototype`,
 * making all templates hydratable. Call this before any hydration
 * occurs. Safe to call multiple times — subsequent calls are no-ops.
 * @internal
 */
export declare function ensureHydrationRuntime(): void;
