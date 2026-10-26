import type { HydrationDebugger } from "../hydration/hydration-debugger.js";
/**
 * Describes when FAST should stop hydrating newly connected prerendered elements.
 * @public
 */
export declare const StopHydration: Readonly<{
    /**
     * Stop hydrating new prerendered elements after the active hydration batch completes.
     */
    readonly hydrationComplete: "hydration-complete";
    /**
     * Keep the hydration hook active for later prerendered elements.
     */
    readonly never: "never";
}>;
/**
 * Describes when FAST should stop hydrating newly connected prerendered elements.
 * @public
 */
export type StopHydration = (typeof StopHydration)[keyof typeof StopHydration];
/**
 * Options for configuring hydration behavior.
 * @public
 */
export interface HydrationOptions {
    /**
     * Indicates when the hydration hook should stop handling new
     * prerendered elements.
     *
     * @defaultValue StopHydration.hydrationComplete
     */
    stopHydration?: StopHydration;
    /**
     * Optional opt-in debugger that swaps the default minimal hydration
     * mismatch error message for a rich "Expected … / Received …" report
     * including an HTML snippet of the SSR DOM and structured
     * `expected`/`received` fields on `HydrationBindingError` /
     * `HydrationTargetElementError`. Obtained via
     * `hydrationDebugger()` from `@lushly-dev/fast-element/hydration.js`.
     */
    debugger?: HydrationDebugger;
}
/**
 * The controller returned by `enableHydration()`.
 * @public
 */
export interface HydrationController {
    /**
     * Resolves when the active hydration batch completes, or when hydration work
     * for the specified tag name completes.
     * @param tagName - The optional custom element tag name to observe.
     * @remarks
     * If hydration is configured with `stopHydration: StopHydration.never`, the
     * global promise intentionally remains pending because hydration never
     * reaches a global completion point.
     */
    whenHydrated(tagName?: string): Promise<void>;
}
/**
 * Tracks prerendered elements through the hydration lifecycle and
 * exposes the active global hydration completion promise.
 *
 * @public
 */
export declare class HydrationTracker implements HydrationController {
    private elements;
    private elementTags;
    private tagHydrationStates;
    private started;
    private completed;
    private checkTimer;
    private stopHydration;
    private _whenHydrated;
    private resolveWhenHydrated;
    constructor(options: HydrationOptions);
    /**
     * Resolves when the active hydration batch completes, or when hydration work
     * for the specified tag name completes.
     */
    whenHydrated(tagName?: string): Promise<void>;
    /**
     * Indicates whether the hydration hook should attempt to hydrate
     * prerendered elements.
     */
    get shouldHydrate(): boolean;
    /**
     * Registers an element as pending hydration.
     */
    add(element: HTMLElement): void;
    /**
     * Removes an element from the pending set and schedules
     * a debounced completion check.
     */
    remove(element: HTMLElement): void;
    /**
     * Merges additional options into the tracker.
     */
    mergeOptions(incoming: HydrationOptions): void;
    private prepareHydrationPromise;
    private getTagHydrationPromise;
    private addTagHydration;
    private removeTagHydration;
    private getTagHydrationState;
    private createTagHydrationState;
    private prepareTagHydrationState;
    private resolveTagHydrationState;
    private scheduleTagHydrationResolution;
    private resolveTagHydrationPromises;
    private resolveHydrationPromise;
}
