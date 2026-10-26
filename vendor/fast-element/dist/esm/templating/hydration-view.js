var _a;
import { Hydratable } from "../components/hydration.js";
import { getHostName, getHydrationDiagnostic, } from "../hydration/diagnostics.js";
import { buildViewBindingTargets, createRangeForNodes, HydrationTargetElementError, targetFactory, } from "../hydration/target-builder.js";
import { SourceLifetime } from "../observation/observable.js";
import { makeSerializationNoop } from "../platform.js";
import { DefaultExecutionContext, removeNodeSequence, } from "./view.js";
/** @public */
export const HydrationStage = {
    unhydrated: "unhydrated",
    hydrating: "hydrating",
    hydrated: "hydrated",
};
/** @public */
export class HydrationBindingError extends Error {
    constructor(
    /**
     * The error message
     */
    message, 
    /**
     * The factory that was unable to be bound
     */
    factory, 
    /**
     * A DocumentFragment containing a clone of the
     * view's Nodes.
     */
    fragment, 
    /**
     * String representation of the HTML in the template that
     * threw the binding error.
     */
    templateString, 
    /**
     * Structured description of the binding the hydration walk was
     * attempting to apply when the mismatch was detected.
     */
    expected, 
    /**
     * Structured description of the server-rendered DOM that was
     * encountered at the mismatch point.
     */
    received) {
        super(message);
        this.factory = factory;
        this.fragment = fragment;
        this.templateString = templateString;
        this.expected = expected;
        this.received = received;
    }
}
export class HydrationView extends DefaultExecutionContext {
    get hydrationStage() {
        return this._hydrationStage;
    }
    get targets() {
        return this._targets;
    }
    get bindingViewBoundaries() {
        return this._bindingViewBoundaries;
    }
    constructor(firstChild, lastChild, sourceTemplate, hostBindingTarget) {
        super();
        this.firstChild = firstChild;
        this.lastChild = lastChild;
        this.sourceTemplate = sourceTemplate;
        this.hostBindingTarget = hostBindingTarget;
        this[_a] = Hydratable;
        this.context = this;
        this.source = null;
        this.isBound = false;
        this.sourceLifetime = SourceLifetime.unknown;
        this.unbindables = [];
        this.fragment = null;
        this.behaviors = null;
        this._hydrationStage = HydrationStage.unhydrated;
        this._bindingViewBoundaries = {};
        this._targets = {};
        this.factories = sourceTemplate.compile().factories;
    }
    /**
     * no-op. Hydrated views are don't need to be moved from a documentFragment
     * to the target node.
     */
    insertBefore(node) {
        // No-op in cases where this is called before the view is removed,
        // because the nodes will already be in the document and just need hydrating.
        if (this.fragment === null) {
            return;
        }
        if (this.fragment.hasChildNodes()) {
            node.parentNode.insertBefore(this.fragment, node);
        }
        else {
            const end = this.lastChild;
            if (node.previousSibling === end)
                return;
            const parentNode = node.parentNode;
            let current = this.firstChild;
            let next;
            while (current !== end) {
                next = current.nextSibling;
                parentNode.insertBefore(current, node);
                current = next;
            }
            parentNode.insertBefore(end, node);
        }
    }
    /**
     * Appends the view to a node. In cases where this is called before the
     * view has been removed, the method will no-op.
     * @param node - the node to append the view to.
     */
    appendTo(node) {
        if (this.fragment !== null) {
            node.appendChild(this.fragment);
        }
    }
    remove() {
        const fragment = this.fragment || (this.fragment = document.createDocumentFragment());
        const end = this.lastChild;
        let current = this.firstChild;
        let next;
        while (current !== end) {
            next = current.nextSibling;
            if (!next) {
                throw new Error(`Unmatched first/last child inside "${end.getRootNode().host.nodeName}".`);
            }
            fragment.appendChild(current);
            current = next;
        }
        fragment.appendChild(end);
    }
    bind(source, context = this) {
        if (this.source === source && this.context === context) {
            return;
        }
        if (this.hydrationStage !== HydrationStage.hydrated) {
            this._hydrationStage = HydrationStage.hydrating;
        }
        let behaviors = this.behaviors;
        if (behaviors === null) {
            this.source = source;
            this.context = context;
            try {
                const { targets, boundaries } = buildViewBindingTargets(this.firstChild, this.lastChild, this.factories);
                this._targets = targets;
                this._bindingViewBoundaries = boundaries;
            }
            catch (error) {
                if (error instanceof HydrationTargetElementError) {
                    let templateString = this.sourceTemplate.html;
                    if (typeof templateString !== "string") {
                        templateString = templateString.innerHTML;
                    }
                    error.templateString = templateString;
                }
                throw error;
            }
            this.behaviors = behaviors = new Array(this.factories.length);
            const factories = this.factories;
            for (let i = 0, ii = factories.length; i < ii; ++i) {
                const factory = factories[i];
                if (factory.targetNodeId === "h" && this.hostBindingTarget) {
                    targetFactory(factory, this.hostBindingTarget, this._targets);
                }
                // If the binding has been targeted or it is a host binding and the view has a hostBindingTarget
                if (factory.targetNodeId in this.targets) {
                    const behavior = factory.createBehavior();
                    behavior.bind(this);
                    behaviors[i] = behavior;
                }
                else {
                    let templateString = this.sourceTemplate.html;
                    if (typeof templateString !== "string") {
                        templateString = templateString.innerHTML;
                    }
                    const fragment = createRangeForNodes(this.firstChild, this.lastChild).cloneContents();
                    const result = getHydrationDiagnostic().formatBindingMismatch(factory, this.firstChild, this.lastChild, getHostName(this.firstChild));
                    throw new HydrationBindingError(result.message, factory, fragment, templateString, result.expected, result.received);
                }
            }
        }
        else {
            if (this.source !== null) {
                this.evaluateUnbindables();
            }
            this.isBound = false;
            this.source = source;
            this.context = context;
            for (let i = 0, ii = behaviors.length; i < ii; ++i) {
                behaviors[i].bind(this);
            }
        }
        this.isBound = true;
        this._hydrationStage = HydrationStage.hydrated;
    }
    unbind() {
        if (!this.isBound || this.source === null) {
            return;
        }
        this.evaluateUnbindables();
        this.source = null;
        this.context = this;
        this.isBound = false;
    }
    /**
     * Removes the view and unbinds its behaviors, disposing of DOM nodes afterward.
     * Once a view has been disposed, it cannot be inserted or bound again.
     */
    dispose() {
        removeNodeSequence(this.firstChild, this.lastChild);
        this.unbind();
    }
    onUnbind(behavior) {
        this.unbindables.push(behavior);
    }
    evaluateUnbindables() {
        const unbindables = this.unbindables;
        for (let i = 0, ii = unbindables.length; i < ii; ++i) {
            unbindables[i].unbind(this);
        }
        unbindables.length = 0;
    }
}
_a = Hydratable;
makeSerializationNoop(HydrationView);
