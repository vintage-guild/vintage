import type { HydrationDiagnostic } from "./diagnostics.js";
/**
 * Opt-in hydration debugger configuration. Pass to `enableHydration` to
 * install the rich "Expected / Received" hydration mismatch formatter:
 *
 * ```ts
 * import { enableHydration, hydrationDebugger } from "@lushly-dev/fast-element/hydration.js";
 *
 * enableHydration({ debugger: hydrationDebugger() });
 * ```
 *
 * @public
 */
export interface HydrationDebugger {
    /**
     * The {@link HydrationDiagnostic} the debugger installs when consumed
     * by `enableHydration`.
     */
    readonly diagnostic: HydrationDiagnostic;
}
/**
 * Returns a {@link HydrationDebugger} that, when supplied to
 * `enableHydration({ debugger })`, installs the rich hydration mismatch
 * formatter: a single-line "Expected … / Received …" message plus an HTML
 * snippet of the SSR DOM and structured `expected`/`received` fields on
 * the thrown error (both `HydrationBindingError` and
 * `HydrationTargetElementError`).
 *
 * Without the debugger, hydration errors emit only a minimal one-line
 * message pointing at this function — keeping the runtime hydration cost
 * small for production bundles that do not need rich diagnostics.
 *
 * @public
 */
export declare function hydrationDebugger(): HydrationDebugger;
