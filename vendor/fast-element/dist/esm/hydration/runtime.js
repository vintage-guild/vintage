import { Hydratable } from "../components/hydration.js";
import { ViewTemplate } from "../templating/template.js";
import { HydrationView } from "../templating/hydration-view.js";
let installed = false;
/**
 * Installs the hydration runtime on `ViewTemplate.prototype`,
 * making all templates hydratable. Call this before any hydration
 * occurs. Safe to call multiple times — subsequent calls are no-ops.
 * @internal
 */
export function ensureHydrationRuntime() {
    if (installed) {
        return;
    }
    const prototype = ViewTemplate.prototype;
    if (prototype[Hydratable] !== Hydratable) {
        Object.defineProperties(prototype, {
            [Hydratable]: {
                value: Hydratable,
                enumerable: false,
                configurable: false,
            },
            hydrate: {
                value(firstChild, lastChild, hostBindingTarget) {
                    return new HydrationView(firstChild, lastChild, this, hostBindingTarget);
                },
                enumerable: true,
                configurable: false,
            },
        });
    }
    installed = true;
}
