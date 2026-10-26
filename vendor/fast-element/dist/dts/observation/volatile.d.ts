import { type Accessor } from "./observable.js";
/**
 * Decorator: Marks a property getter as having volatile observable dependencies.
 * @param target - The target that the property is defined on.
 * @param name - The property name.
 * @param descriptor - The existing descriptor.
 * @public
 */
export declare function volatile(target: {}, name: string | Accessor, descriptor: PropertyDescriptor): PropertyDescriptor;
