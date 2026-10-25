import type { Binding, BindingDirective } from "../binding/binding.js";
import { DOMAspect } from "../dom.js";
import type { DOMPolicy } from "../dom-policy.js";
import { ExecutionContext, type Expression, type ExpressionObserver } from "../observation/observable.js";
import { type AddViewBehaviorFactory, type Aspected, HTMLDirective, type ViewBehavior, type ViewBehaviorFactory, type ViewController } from "./html-directive.js";
/**
 * A simple View that can be interpolated into HTML content.
 * @public
 */
export interface ContentView {
    readonly context: ExecutionContext;
    /**
     * Binds a view's behaviors to its binding source.
     * @param source - The binding source for the view's binding behaviors.
     * @param context - The execution context to run the view within.
     */
    bind(source: any, context?: ExecutionContext): void;
    /**
     * Unbinds a view's behaviors from its binding source and context.
     */
    unbind(): void;
    /**
     * Inserts the view's DOM nodes before the referenced node.
     * @param node - The node to insert the view's DOM before.
     */
    insertBefore(node: Node): void;
    /**
     * Removes the view's DOM nodes.
     * The nodes are not disposed and the view can later be re-inserted.
     */
    remove(): void;
}
/**
 * A simple template that can create ContentView instances.
 * @public
 */
export interface ContentTemplate {
    /**
     * Creates a simple content view instance.
     */
    create(): ContentView;
}
/**
 * A template capable of hydrating content from existing DOM nodes.
 * @beta
 */
export interface HydratableContentTemplate extends ContentTemplate {
    /**
     * Hydrates a content view from first/last nodes.
     */
    hydrate(first: Node, last: Node): ContentView;
}
/**
 * The central binding directive that bridges data expressions and DOM updates.
 *
 * HTMLBindingDirective fulfills three roles simultaneously:
 * - **HTMLDirective**: Produces placeholder HTML via createHTML() during template authoring.
 * - **ViewBehaviorFactory**: Creates behaviors (returns itself) during view creation.
 * - **ViewBehavior / EventListener**: Attaches to a DOM node during bind, manages
 *   expression observers for reactive updates, and handles DOM events directly.
 *
 * The aspectType (set by HTMLDirective.assignAspect during template processing)
 * determines which DOM "sink" function is used to apply values — e.g.,
 * setAttribute for attributes, addEventListener for events, textContent for content.
 *
 * @public
 */
export declare class HTMLBindingDirective implements HTMLDirective, ViewBehaviorFactory, ViewBehavior, Aspected, BindingDirective {
    private data;
    private updateTarget;
    /**
     * The unique id of the factory.
     */
    id: string;
    /**
     * The structural id of the DOM node to which the created behavior will apply.
     */
    targetNodeId: string;
    /**
     * The tagname associated with the target node.
     */
    targetTagName: string | null;
    /**
     * The policy that the created behavior must run under.
     */
    policy: DOMPolicy;
    /**
     * The original source aspect exactly as represented in markup.
     */
    sourceAspect: string;
    /**
     * The evaluated target aspect, determined after processing the source.
     */
    targetAspect: string;
    /**
     * The type of aspect to target.
     */
    aspectType: DOMAspect;
    /**
     * The binding configuration to apply.
     */
    dataBinding: Binding;
    /**
     * Creates an instance of HTMLBindingDirective.
     * @param dataBinding - The binding configuration to apply.
     */
    constructor(dataBinding: Binding);
    /**
     * Creates HTML to be used within a template.
     * @param add - Can be used to add  behavior factories to a template.
     */
    createHTML(add: AddViewBehaviorFactory): string;
    /**
     * Creates a behavior.
     */
    createBehavior(): ViewBehavior;
    /**
     * Attaches this binding to its target DOM node.
     * - For events: stores the controller reference on the target element and registers
     *   this directive as the EventListener via addEventListener. The directive's
     *   handleEvent() method will be called when the event fires.
     * - For content bindings: registers an unbind handler, then falls through to the
     *   default path.
     * - For all non-event bindings: creates (or reuses) an ExpressionObserver, evaluates
     *   the binding expression, and applies the result to the DOM via the updateTarget
     *   sink function. The observer will call handleChange() on future data changes.
     * @internal
     */
    bind(controller: ViewController): void;
    /** @internal */
    unbind(controller: ViewController): void;
    /**
     * Implements the EventListener interface. When a DOM event fires on the target
     * element, this method retrieves the ViewController stored on the element,
     * sets the event on the ExecutionContext so `c.event` is available to the
     * binding expression, and evaluates the expression. If the expression returns
     * anything other than `true`, the event's default action is prevented.
     * @internal
     */
    handleEvent(event: Event): void;
    /**
     * Called by the ExpressionObserver when a tracked dependency changes.
     * Re-evaluates the binding expression via observer.bind() and pushes
     * the new value to the DOM through the updateTarget sink function.
     * This is the reactive update path that keeps the DOM in sync with data.
     *
     * Guards against stale notifications: when a view is unbound (e.g., after
     * a parent `when` directive tears down a child element), coupled-lifetime
     * observers may still hold active subscriptions. If a property change fires
     * on the source element while the view is inactive, this guard prevents
     * the binding expression from evaluating with a null source.
     * @internal
     */
    handleChange(binding: Expression, observer: ExpressionObserver): void;
}
