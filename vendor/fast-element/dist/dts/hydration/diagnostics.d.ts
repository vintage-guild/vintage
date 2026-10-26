import type { ViewBehaviorFactory } from "../templating/html-directive.js";
/**
 * Structured description of the binding hydration was expecting to apply when
 * a mismatch is detected.
 * @public
 */
export interface HydrationMismatchExpectation {
    /**
     * The tag name of the element the binding was expecting (e.g. `"SPAN"`),
     * or `null` when the binding does not target a specific element (host or
     * template-level bindings).
     */
    tagName: string | null;
    /**
     * Human-readable description of the binding aspect, for example
     * `"content"`, `"property className"`, or `"attribute aria-label"`.
     */
    aspect: string;
}
/**
 * Structured description of the DOM hydration actually encountered at the
 * mismatch point.
 * @public
 */
export interface HydrationMismatchActual {
    /**
     * Serialized HTML snippet of the server-rendered DOM where the mismatch
     * was detected. Truncated with an ellipsis when long.
     */
    html: string;
}
/**
 * Result of a hydration-mismatch diagnostic format call.
 * @public
 */
export interface HydrationDiagnosticResult {
    /**
     * The error message to attach to the thrown hydration error.
     */
    message: string;
    /**
     * Structured description of the binding the hydration walk was
     * attempting to apply. The default diagnostic leaves this `undefined`;
     * install `hydrationDebugger()` to populate it.
     */
    expected?: HydrationMismatchExpectation | string;
    /**
     * Structured description of the server-rendered DOM that was
     * encountered at the mismatch point. The default diagnostic leaves
     * this `undefined`; install `hydrationDebugger()` to populate it.
     */
    received?: HydrationMismatchActual;
}
/**
 * Pluggable formatter for hydration mismatch errors. The default
 * implementation is a minimal one-line message; install
 * {@link hydrationDebugger} to swap in the rich "Expected … / Received …"
 * formatter with an HTML snippet of the SSR DOM.
 * @public
 */
export interface HydrationDiagnostic {
    /**
     * Format a binding-resolution mismatch (a factory whose `targetNodeId`
     * has no entry in the resolved targets after the SSR DOM walk).
     */
    formatBindingMismatch(factory: ViewBehaviorFactory, firstChild: Node, lastChild: Node, hostName: string | undefined): HydrationDiagnosticResult;
    /**
     * Format a structural error encountered during the SSR DOM walk
     * (e.g. attribute binding count overflow, missing close marker).
     */
    formatStructuralError(node: Node, hostName: string | undefined, expectedDescription: string): HydrationDiagnosticResult;
}
/**
 * Installs a {@link HydrationDiagnostic} as the active formatter for
 * hydration mismatch errors. Called by `enableHydration()` when an opt-in
 * debugger configuration is supplied; not exposed as `@public` because
 * library consumers should always go through `enableHydration` to install
 * a debugger.
 * @internal
 */
export declare function installHydrationDiagnostic(diagnostic: HydrationDiagnostic): void;
/**
 * Returns the currently active {@link HydrationDiagnostic} — either the
 * minimal default or one installed by an opt-in debugger.
 * @internal
 */
export declare function getHydrationDiagnostic(): HydrationDiagnostic;
/**
 * Reads the host element's tag name from any node inside a hydration view.
 * Returns `undefined` when the node is not inside a shadow root.
 * @internal
 */
export declare function getHostName(node: Node | null | undefined): string | undefined;
