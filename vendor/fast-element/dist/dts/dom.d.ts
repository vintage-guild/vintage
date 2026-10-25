import type { DOMPolicy as DOMPolicyDefinition } from "./dom-policy.js";
/**
 * The type of HTML aspect to target.
 * @public
 */
export declare const DOMAspect: Readonly<{
    /**
     * Not aspected.
     */
    readonly none: 0;
    /**
     * An attribute.
     */
    readonly attribute: 1;
    /**
     * A boolean attribute.
     */
    readonly booleanAttribute: 2;
    /**
     * A property.
     */
    readonly property: 3;
    /**
     * Content
     */
    readonly content: 4;
    /**
     * A token list.
     */
    readonly tokenList: 5;
    /**
     * An event.
     */
    readonly event: 6;
}>;
/**
 * The type of HTML aspect to target.
 * @public
 */
export type DOMAspect = (typeof DOMAspect)[Exclude<keyof typeof DOMAspect, "none">];
/**
 * A function used to send values to a DOM sink.
 * @public
 */
export type DOMSink = (target: Node, aspectName: string, value: any, ...args: any[]) => void;
/**
 * A security policy that FAST can use to interact with the DOM.
 * @public
 */
export interface DOMPolicy extends DOMPolicyDefinition {
}
/**
 * Common DOM APIs.
 * @public
 */
export declare const DOM: Readonly<{
    /**
     * Gets the dom policy used by the templating system.
     */
    readonly policy: DOMPolicyDefinition;
    /**
     * Sets the dom policy used by the templating system.
     * @param policy - The policy to set.
     * @remarks
     * This API can only be called once, for security reasons. It should be
     * called by the application developer at the start of their program.
     */
    setPolicy(value: DOMPolicyDefinition): void;
    /**
     * Sets an attribute value on an element.
     * @param element - The element to set the attribute value on.
     * @param attributeName - The attribute name to set.
     * @param value - The value of the attribute to set.
     * @remarks
     * If the value is `null` or `undefined`, the attribute is removed, otherwise
     * it is set to the provided value using the standard `setAttribute` API.
     */
    setAttribute(element: HTMLElement, attributeName: string, value: any): void;
    /**
     * Sets a boolean attribute value.
     * @param element - The element to set the boolean attribute value on.
     * @param attributeName - The attribute name to set.
     * @param value - The value of the attribute to set.
     * @remarks
     * If the value is true, the attribute is added; otherwise it is removed.
     */
    setBooleanAttribute(element: HTMLElement, attributeName: string, value: boolean): void;
}>;
