import { isString, noop } from "../interfaces.js";
import { HTMLDirective } from "./html-directive.js";
import { NodeObservationDirective, } from "./node-observation.js";
/**
 * The runtime behavior for child node observation.
 * @public
 */
export class ChildrenDirective extends NodeObservationDirective {
    /**
     * Creates an instance of ChildrenDirective.
     * @param options - The options to use in configuring the child observation behavior.
     */
    constructor(options) {
        super(options);
        this.observerProperty = Symbol();
        options.childList = true;
    }
    /**
     * Begins observation of the nodes.
     * @param target - The target to observe.
     */
    observe(target) {
        let observer = target[this.observerProperty];
        if (!observer) {
            const handleEvent = (mutations, observer) => {
                this.updateTarget(this.getSource(target), this.computeNodes(target));
            };
            observer = new MutationObserver(handleEvent);
            observer.toJSON = noop;
            target[this.observerProperty] = observer;
        }
        observer.observe(target, this.options);
    }
    /**
     * Disconnects observation of the nodes.
     * @param target - The target to unobserve.
     */
    disconnect(target) {
        const observer = target[this.observerProperty];
        observer.disconnect();
    }
    /**
     * Retrieves the raw nodes that should be assigned to the source property.
     * @param target - The target to get the node to.
     */
    getNodes(target) {
        if ("selector" in this.options) {
            return Array.from(target.querySelectorAll(this.options.selector));
        }
        return Array.from(target.childNodes);
    }
}
HTMLDirective.define(ChildrenDirective);
/**
 * A directive that observes the `childNodes` of an element and updates a property
 * whenever they change.
 * @param propertyOrOptions - The options used to configure child node observation.
 * @public
 */
export function children(propertyOrOptions) {
    if (isString(propertyOrOptions)) {
        propertyOrOptions = {
            property: propertyOrOptions,
        };
    }
    return new ChildrenDirective(propertyOrOptions);
}
