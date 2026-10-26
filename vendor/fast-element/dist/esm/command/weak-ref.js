const WeakRefConstructor = globalThis.WeakRef;
/** @internal */
export function createWeakReference(target) {
    return new WeakRefConstructor(target);
}
