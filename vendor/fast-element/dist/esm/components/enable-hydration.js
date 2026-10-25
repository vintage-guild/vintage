import { installHydrationDiagnostic } from "../hydration/diagnostics.js";
import { ensureHydrationRuntime } from "../hydration/runtime.js";
import { SourceLifetime } from "../observation/observable.js";
import { ElementController } from "./element-controller.js";
import { isHydratable } from "./hydration.js";
import { HydrationTracker, } from "./hydration-tracker.js";
export { StopHydration } from "./hydration-tracker.js";
/**
 * No-op handler used during prerendered bind to discard the
 * upgrade-time burst of attributeChangedCallbacks.
 */
function noopAttributeHandler() { }
let tracker = null;
let hookInstalled = false;
/**
 * Enables hydration support for prerendered FAST elements.
 *
 * @remarks
 * Call this before any FAST elements connect to the DOM. Hydration
 * logic is not active unless this function is called, keeping
 * `FASTElement` lightweight for client-side-only applications.
 *
 * Safe to call multiple times — the hydration hook is installed once
 * and subsequent calls merge their options into the shared tracker.
 * By default, the hook stops hydrating new prerendered elements after
 * the initial hydration batch completes. Await the returned controller's
 * `whenHydrated()` promise to run code after the active hydration batch
 * completes.
 *
 * Set `stopHydration` to `StopHydration.never` for streaming scenarios
 * that append hydratable Declarative Shadow DOM after the initial batch.
 * In this mode, `whenHydrated` intentionally remains pending because
 * hydration never reaches a global completion point.
 *
 * Pass `debugger: hydrationDebugger()` to swap the default minimal
 * hydration mismatch error message for a rich "Expected / Received"
 * report including the SSR HTML snippet and structured
 * `expected`/`received` fields on `HydrationBindingError` /
 * `HydrationTargetElementError`. The debugger module is tree-shaken
 * out of production hydration bundles unless explicitly imported.
 *
 * @example
 * ```ts
 * import { enableHydration } from "@lushly-dev/fast-element/hydration.js";
 *
 * const hydration = enableHydration();
 *
 * await hydration.whenHydrated();
 * console.log("hydration complete");
 * ```
 *
 * @example Streaming Declarative Shadow DOM
 * ```ts
 * import { enableHydration, StopHydration } from "@lushly-dev/fast-element/hydration.js";
 *
 * enableHydration({
 *     stopHydration: StopHydration.never,
 * });
 * ```
 *
 * @example Rich hydration mismatch diagnostics
 * ```ts
 * import { enableHydration, hydrationDebugger } from "@lushly-dev/fast-element/hydration.js";
 *
 * enableHydration({ debugger: hydrationDebugger() });
 * ```
 *
 * @param options - Optional hydration behavior.
 * @public
 */
export function enableHydration(options) {
    ensureHydrationRuntime();
    if (options === null || options === void 0 ? void 0 : options.debugger) {
        installHydrationDiagnostic(options.debugger.diagnostic);
    }
    if (!hookInstalled) {
        tracker = new HydrationTracker(options !== null && options !== void 0 ? options : {});
        hookInstalled = true;
        const activeTracker = tracker;
        ElementController.installHydrationHook((controller, template, element, host) => {
            if (!activeTracker.shouldHydrate || !isHydratable(template)) {
                return false;
            }
            activeTracker.add(element);
            try {
                const firstChild = host.firstChild;
                const lastChild = host.lastChild;
                const view = template.hydrate(firstChild, lastChild, element);
                controller.view = view;
                const realHandler = controller.onAttributeChangedCallback;
                controller.onAttributeChangedCallback = noopAttributeHandler;
                try {
                    view._skipAttrUpdates = true;
                    view.isPrerendered = Promise.resolve(true);
                    view.isHydrated = Promise.resolve(true);
                    view.bind(controller.source);
                    view._skipAttrUpdates = false;
                }
                finally {
                    controller.onAttributeChangedCallback = realHandler;
                }
                view.sourceLifetime =
                    SourceLifetime.coupled;
                controller.hasExistingShadowRoot = false;
            }
            finally {
                activeTracker.remove(element);
            }
            return true;
        });
    }
    else if (options && tracker) {
        // Merge options into existing tracker for subsequent calls
        tracker.mergeOptions(options);
    }
    return tracker;
}
/**
 * The attribute used to defer hydration of an element.
 * Retained for intersection observer viewport hydration rendering.
 * @beta
 */
export const deferHydrationAttribute = "defer-hydration";
