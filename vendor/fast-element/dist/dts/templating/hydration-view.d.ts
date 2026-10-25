import { Hydratable } from "../components/hydration.js";
import { type HydrationMismatchActual, type HydrationMismatchExpectation } from "../hydration/diagnostics.js";
import { type ViewBehaviorBoundaries } from "../hydration/target-builder.js";
import { type ExecutionContext, SourceLifetime } from "../observation/observable.js";
import type { ViewTemplate } from "../templating/template.js";
import type { ViewBehaviorFactory, ViewBehaviorTargets, ViewController } from "./html-directive.js";
import { DefaultExecutionContext, type ElementView, type SyntheticView } from "./view.js";
/** @public */
export interface HydratableView<TSource = any, TParent = any> extends ElementView<TSource, TParent>, SyntheticView<TSource, TParent>, DefaultExecutionContext<TParent> {
    [Hydratable]: symbol;
    readonly bindingViewBoundaries: Record<string, ViewNodes>;
    readonly hydrationStage: keyof typeof HydrationStage;
}
/**
 * A view controller that can hydrate existing DOM nodes.
 * @beta
 */
export type HydratableViewController<TSource = any, TParent = any> = HydratableView<TSource, TParent> & ViewController<TSource, TParent>;
/** @public */
export interface ViewNodes {
    first: Node;
    last: Node;
}
/** @public */
export declare const HydrationStage: {
    readonly unhydrated: "unhydrated";
    readonly hydrating: "hydrating";
    readonly hydrated: "hydrated";
};
/** @public */
export declare class HydrationBindingError extends Error {
    /**
     * The factory that was unable to be bound
     */
    readonly factory: ViewBehaviorFactory;
    /**
     * A DocumentFragment containing a clone of the
     * view's Nodes.
     */
    readonly fragment: DocumentFragment;
    /**
     * String representation of the HTML in the template that
     * threw the binding error.
     */
    readonly templateString: string;
    /**
     * Structured description of the binding the hydration walk was
     * attempting to apply when the mismatch was detected.
     */
    readonly expected?: HydrationMismatchExpectation | undefined;
    /**
     * Structured description of the server-rendered DOM that was
     * encountered at the mismatch point.
     */
    readonly received?: HydrationMismatchActual | undefined;
    constructor(
    /**
     * The error message
     */
    message: string | undefined, 
    /**
     * The factory that was unable to be bound
     */
    factory: ViewBehaviorFactory, 
    /**
     * A DocumentFragment containing a clone of the
     * view's Nodes.
     */
    fragment: DocumentFragment, 
    /**
     * String representation of the HTML in the template that
     * threw the binding error.
     */
    templateString: string, 
    /**
     * Structured description of the binding the hydration walk was
     * attempting to apply when the mismatch was detected.
     */
    expected?: HydrationMismatchExpectation | undefined, 
    /**
     * Structured description of the server-rendered DOM that was
     * encountered at the mismatch point.
     */
    received?: HydrationMismatchActual | undefined);
}
export declare class HydrationView<TSource = any, TParent = any> extends DefaultExecutionContext<TParent> implements HydratableView {
    readonly firstChild: Node;
    readonly lastChild: Node;
    private sourceTemplate;
    private hostBindingTarget?;
    [Hydratable]: symbol;
    context: ExecutionContext<any>;
    source: TSource | null;
    isBound: boolean;
    get hydrationStage(): "unhydrated" | "hydrating" | "hydrated";
    get targets(): ViewBehaviorTargets;
    get bindingViewBoundaries(): ViewBehaviorBoundaries;
    readonly sourceLifetime: SourceLifetime;
    private unbindables;
    private fragment;
    private behaviors;
    private factories;
    private _hydrationStage;
    private _bindingViewBoundaries;
    private _targets;
    constructor(firstChild: Node, lastChild: Node, sourceTemplate: ViewTemplate, hostBindingTarget?: Element | undefined);
    /**
     * no-op. Hydrated views are don't need to be moved from a documentFragment
     * to the target node.
     */
    insertBefore(node: Node): void;
    /**
     * Appends the view to a node. In cases where this is called before the
     * view has been removed, the method will no-op.
     * @param node - the node to append the view to.
     */
    appendTo(node: Node): void;
    remove(): void;
    bind(source: TSource, context?: ExecutionContext<any>): void;
    unbind(): void;
    /**
     * Removes the view and unbinds its behaviors, disposing of DOM nodes afterward.
     * Once a view has been disposed, it cannot be inserted or bound again.
     */
    dispose(): void;
    onUnbind(behavior: {
        unbind(controller: ViewController<TSource, TParent>): void;
    }): void;
    private evaluateUnbindables;
}
