import { Observable } from "./observable.js";
/**
 * Decorator: Marks a property getter as having volatile observable dependencies.
 * @param target - The target that the property is defined on.
 * @param name - The property name.
 * @param descriptor - The existing descriptor.
 * @public
 */
export function volatile(target, name, descriptor) {
    return Object.assign({}, descriptor, {
        get() {
            Observable.trackVolatile();
            return descriptor.get.apply(this);
        },
    });
}
