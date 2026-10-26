import type { CompiledViewBehaviorFactory, ViewBehaviorFactory, ViewBehaviorTargets } from "../templating/html-directive.js";
import { type HydrationMismatchActual, type HydrationMismatchExpectation } from "./diagnostics.js";
export declare class HydrationTargetElementError extends Error {
    /**
     * The Compiled View Behavior Factories that belong to the view.
     */
    readonly factories: CompiledViewBehaviorFactory[];
    /**
     * The node to target factory.
     */
    readonly node: Node;
    /**
     * Structured description of the binding the hydration walk was
     * attempting to apply when the mismatch was detected. Free-form
     * string for structural errors that do not correspond to a single
     * binding factory.
     */
    readonly expected?: (HydrationMismatchExpectation | string) | undefined;
    /**
     * Structured description of the server-rendered DOM that was
     * encountered at the mismatch point.
     */
    readonly received?: HydrationMismatchActual | undefined;
    /**
     * String representation of the HTML in the template that
     * threw the target element error.
     */
    templateString?: string;
    constructor(
    /**
     * The error message
     */
    message: string | undefined, 
    /**
     * The Compiled View Behavior Factories that belong to the view.
     */
    factories: CompiledViewBehaviorFactory[], 
    /**
     * The node to target factory.
     */
    node: Node, 
    /**
     * Structured description of the binding the hydration walk was
     * attempting to apply when the mismatch was detected. Free-form
     * string for structural errors that do not correspond to a single
     * binding factory.
     */
    expected?: (HydrationMismatchExpectation | string) | undefined, 
    /**
     * Structured description of the server-rendered DOM that was
     * encountered at the mismatch point.
     */
    received?: HydrationMismatchActual | undefined);
}
/**
 * Represents the DOM boundaries controlled by a view
 * @public
 */
export interface ViewBoundaries {
    first: Node;
    last: Node;
}
/**
 * Stores relationships between a {@link ViewBehaviorFactory} and
 * the {@link ViewBoundaries} the factory created.
 * @public
 */
export interface ViewBehaviorBoundaries {
    [factoryId: string]: ViewBoundaries;
}
/**
 * Returns a range object inclusive of all nodes including and between the
 * provided first and last node.
 * @param first - The first node
 * @param last - This last node
 * @returns
 */
export declare function createRangeForNodes(first: Node, last: Node): Range;
/**
 * Maps compiled ViewBehaviorFactory IDs to their corresponding DOM nodes in the
 * server-rendered shadow root. Uses a TreeWalker to scan the existing DOM between
 * firstNode and lastNode, processing data-free sequential hydration markers.
 *
 * A sequential factory pointer advances through the factories array in DFS order.
 * Since the template compiler and hydration walker both traverse the DOM in
 * identical depth-first order, no embedded indices are needed in markers.
 *
 * For element nodes: parses `data-fe="N"` to determine the count of attribute
 * binding factories, then consumes N factories sequentially.
 *
 * For comment nodes: `fe:b` markers consume the next factory for content bindings,
 * using balanced depth counting for nested marker pairing. `fe:e` markers cause
 * the walker to skip nested custom element subtrees.
 *
 * Host bindings (targetNodeId='h') appear at the start of the factories array but
 * have no SSR markers — getHydrationIndexOffset() computes the initial pointer value.
 *
 * @param firstNode - The first node of the view.
 * @param lastNode -  The last node of the view.
 * @param factories - The Compiled View Behavior Factories that belong to the view.
 * @returns - A {@link ViewBehaviorTargets } object for the factories in the view.
 */
export declare function buildViewBindingTargets(firstNode: Node, lastNode: Node, factories: CompiledViewBehaviorFactory[]): {
    targets: ViewBehaviorTargets;
    boundaries: ViewBehaviorBoundaries;
};
export declare function targetFactory(factory: ViewBehaviorFactory, node: Node, targets: ViewBehaviorTargets): void;
