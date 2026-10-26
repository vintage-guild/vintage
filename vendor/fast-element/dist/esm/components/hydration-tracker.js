import { FASTElementDefinition } from "./fast-definitions.js";
/**
 * Describes when FAST should stop hydrating newly connected prerendered elements.
 * @public
 */
export const StopHydration = Object.freeze({
    /**
     * Stop hydrating new prerendered elements after the active hydration batch completes.
     */
    hydrationComplete: "hydration-complete",
    /**
     * Keep the hydration hook active for later prerendered elements.
     */
    never: "never",
});
/**
 * Tracks prerendered elements through the hydration lifecycle and
 * exposes the active global hydration completion promise.
 *
 * @public
 */
export class HydrationTracker {
    constructor(options) {
        var _a;
        this.elements = new Set();
        this.elementTags = new WeakMap();
        this.tagHydrationStates = new Map();
        this.started = false;
        this.completed = false;
        this.checkTimer = null;
        this.resolveWhenHydrated = null;
        this.prepareHydrationPromise();
        this.stopHydration = (_a = options.stopHydration) !== null && _a !== void 0 ? _a : StopHydration.hydrationComplete;
    }
    /**
     * Resolves when the active hydration batch completes, or when hydration work
     * for the specified tag name completes.
     */
    whenHydrated(tagName) {
        if (tagName !== void 0) {
            return this.getTagHydrationPromise(tagName);
        }
        return this._whenHydrated;
    }
    /**
     * Indicates whether the hydration hook should attempt to hydrate
     * prerendered elements.
     */
    get shouldHydrate() {
        return !this.completed || this.stopHydration === StopHydration.never;
    }
    /**
     * Registers an element as pending hydration.
     */
    add(element) {
        var _a, _b;
        this.completed = false;
        if (!this.started) {
            this.started = true;
            if (this.resolveWhenHydrated === null) {
                this.prepareHydrationPromise();
            }
        }
        if (!this.elements.has(element)) {
            const tagName = (_b = (_a = FASTElementDefinition.getForInstance(element)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : element.localName;
            this.elements.add(element);
            this.elementTags.set(element, tagName);
            this.addTagHydration(tagName);
        }
    }
    /**
     * Removes an element from the pending set and schedules
     * a debounced completion check.
     */
    remove(element) {
        if (this.elements.delete(element)) {
            const tagName = this.elementTags.get(element);
            if (tagName !== void 0) {
                this.elementTags.delete(element);
                this.removeTagHydration(tagName);
            }
        }
        // Debounce: reset on every removal so we wait until no
        // new elements arrive before declaring complete.
        if (this.checkTimer !== null) {
            clearTimeout(this.checkTimer);
        }
        if (this.elements.size === 0) {
            this.checkTimer = setTimeout(() => {
                this.checkTimer = null;
                if (this.elements.size === 0) {
                    if (this.stopHydration !== StopHydration.never) {
                        this.resolveHydrationPromise();
                        this.completed = true;
                    }
                    this.started = false;
                }
            }, 0);
        }
    }
    /**
     * Merges additional options into the tracker.
     */
    mergeOptions(incoming) {
        if (incoming.stopHydration !== void 0) {
            this.stopHydration = incoming.stopHydration;
            if (incoming.stopHydration === StopHydration.never &&
                this.resolveWhenHydrated === null) {
                this.prepareHydrationPromise();
            }
        }
    }
    prepareHydrationPromise() {
        this._whenHydrated = new Promise(resolve => {
            this.resolveWhenHydrated = resolve;
        });
    }
    getTagHydrationPromise(tagName) {
        const state = this.getTagHydrationState(tagName);
        if (this.completed && this.stopHydration !== StopHydration.never) {
            this.resolveTagHydrationState(state);
        }
        return state.promise;
    }
    addTagHydration(tagName) {
        const state = this.getTagHydrationState(tagName);
        if (state.resolveTimer !== null) {
            clearTimeout(state.resolveTimer);
            state.resolveTimer = null;
        }
        if (state.resolved) {
            this.prepareTagHydrationState(state);
        }
        state.pendingCount++;
    }
    removeTagHydration(tagName) {
        const state = this.getTagHydrationState(tagName);
        if (state.pendingCount > 0) {
            state.pendingCount--;
        }
        if (state.pendingCount === 0) {
            this.scheduleTagHydrationResolution(state);
        }
    }
    getTagHydrationState(tagName) {
        const normalizedTagName = tagName.toLowerCase();
        let state = this.tagHydrationStates.get(normalizedTagName);
        if (state === void 0) {
            state = this.createTagHydrationState();
            this.tagHydrationStates.set(normalizedTagName, state);
        }
        return state;
    }
    createTagHydrationState() {
        let resolve;
        const promise = new Promise(settle => {
            resolve = settle;
        });
        return {
            promise,
            pendingCount: 0,
            resolve,
            resolveTimer: null,
            resolved: false,
        };
    }
    prepareTagHydrationState(state) {
        let resolve;
        state.promise = new Promise(settle => {
            resolve = settle;
        });
        state.resolve = resolve;
        state.resolved = false;
    }
    resolveTagHydrationState(state) {
        if (state.resolved) {
            return;
        }
        if (state.resolveTimer !== null) {
            clearTimeout(state.resolveTimer);
            state.resolveTimer = null;
        }
        state.resolved = true;
        state.resolve();
    }
    scheduleTagHydrationResolution(state) {
        if (state.resolveTimer !== null) {
            clearTimeout(state.resolveTimer);
        }
        state.resolveTimer = setTimeout(() => {
            state.resolveTimer = null;
            if (state.pendingCount === 0) {
                this.resolveTagHydrationState(state);
            }
        }, 0);
    }
    resolveTagHydrationPromises() {
        for (const state of this.tagHydrationStates.values()) {
            if (state.pendingCount === 0) {
                this.resolveTagHydrationState(state);
            }
        }
    }
    resolveHydrationPromise() {
        const resolve = this.resolveWhenHydrated;
        this.resolveWhenHydrated = null;
        resolve === null || resolve === void 0 ? void 0 : resolve();
        this.resolveTagHydrationPromises();
    }
}
