/**
 * Minimal WeakRef surface used by command entries without requiring the
 * ES2021.WeakRef TypeScript library in FAST Element's compilation target.
 * @internal
 */
interface WeakReference<T extends object> {
    deref(): T | undefined;
}
/** @internal */
export declare function createWeakReference<T extends object>(target: T): WeakReference<T>;
export {};
