import type { Notifier, Subscriber } from "../observation/notifier.js";
import { ExecutionContext, type ExpressionController, SourceLifetime } from "../observation/observable.js";
import { ElementStyles } from "../styles/element-styles.js";
import type { HostBehavior, HostController } from "../styles/host.js";
import type { StyleStrategy, StyleTarget } from "../styles/style-strategy.js";
import type { ElementViewTemplate } from "../templating/template.js";
import type { ElementView } from "../templating/view.js";
import type { TrustEmitOptions } from "../trust/types.js";
import { FASTElementDefinition, type ShadowRootOptions } from "./fast-definitions.js";
/**
 * Creates an optional behavior for a newly constructed element controller.
 * @internal
 */
export type ElementControllerBehaviorFactory = (element: HTMLElement) => HostBehavior<HTMLElement> | undefined;
/**
 * Registers a focused integration hook for optional element behaviors.
 * @param factory - Factory invoked for each new element controller.
 * @returns A callback that removes the factory.
 * @internal
 */
export declare function registerElementControllerBehaviorFactory(factory: ElementControllerBehaviorFactory): () => void;
/**
 * A type that instantiates an ElementController
 * @public
 */
export interface ElementControllerStrategy {
    new (element: HTMLElement, definition: FASTElementDefinition): ElementController;
}
/**
 * The various lifecycle stages of an ElementController.
 * @public
 */
export declare const enum Stages {
    /** The element is in the process of connecting. */
    connecting = 0,
    /** The element is connected. */
    connected = 1,
    /** The element is in the process of disconnecting. */
    disconnecting = 2,
    /** The element is disconnected. */
    disconnected = 3
}
/**
 * Controls the lifecycle and rendering of a `FASTElement`.
 * @public
 */
export declare class ElementController<TElement extends HTMLElement = HTMLElement> implements Notifier, HostController<TElement> {
    /**
     * Internal notifier used to delegate subscriber management.
     */
    private _notifier;
    /**
     * A map of observable properties that were set on the element before upgrade.
     */
    private boundObservables;
    /**
     * Indicates whether the controller needs to perform initial rendering.
     */
    protected needsInitialization: boolean;
    /**
     * Indicates whether the element has an existing shadow root (e.g. from declarative shadow DOM).
     */
    protected hasExistingShadowRoot: boolean;
    /**
     * Resolves the isPrerendered promise.
     */
    private _resolvePrerendered;
    /**
     * Resolves the isHydrated promise.
     */
    private _resolveHydrated;
    /**
     * Resolves `true` when the element had an existing shadow root
     * (from SSR or declarative shadow DOM) at connect time, `false`
     * otherwise.
     */
    readonly isPrerendered: Promise<boolean>;
    /**
     * Resolves `true` after prerendered content has been successfully
     * hydrated, or `false` when the component is client-side rendered
     * or hydration is not enabled.
     */
    readonly isHydrated: Promise<boolean>;
    /**
     * The template used to render the component.
     */
    private _template;
    /**
     * The shadow root options for the component.
     */
    private _shadowRootOptions;
    /**
     * The current lifecycle stage of the controller.
     */
    protected stage: Stages;
    /**
     * A guard against connecting behaviors multiple times
     * during connect in scenarios where a behavior adds
     * another behavior during it's connectedCallback
     */
    private guardBehaviorConnection;
    /**
     * The behaviors associated with the component.
     */
    protected behaviors: Map<HostBehavior<TElement>, number> | null;
    /**
     * Tracks whether behaviors are connected so that
     * behaviors cant be connected multiple times
     */
    private behaviorsConnected;
    /**
     * The main set of styles used for the component, independent of any
     * dynamically added styles.
     */
    private _mainStyles;
    /**
     * This allows Observable.getNotifier(...) to return the Controller
     * when the notifier for the Controller itself is being requested. The
     * result is that the Observable system does not need to create a separate
     * instance of Notifier for observables on the Controller. The component and
     * the controller will now share the same notifier, removing one-object construct
     * per web component instance.
     */
    private readonly $fastController;
    /**
     * The element being controlled by this controller.
     */
    readonly source: TElement;
    /**
     * The element definition that instructs this controller
     * in how to handle rendering and other platform integrations.
     */
    readonly definition: FASTElementDefinition;
    /**
     * The view associated with the custom element.
     * @remarks
     * If `null` then the element is managing its own rendering.
     */
    readonly view: ElementView<TElement> | null;
    /**
     * Indicates whether or not the custom element has been
     * connected to the document.
     */
    get isConnected(): boolean;
    /**
     * The context the expression is evaluated against.
     */
    get context(): ExecutionContext;
    /**
     * Indicates whether the controller is bound.
     */
    get isBound(): boolean;
    /**
     * Indicates how the source's lifetime relates to the controller's lifetime.
     */
    get sourceLifetime(): SourceLifetime | undefined;
    /**
     * Gets/sets the template used to render the component.
     * @remarks
     * This value can only be accurately read after connect but can be set at any time.
     */
    get template(): ElementViewTemplate<TElement> | null;
    set template(value: ElementViewTemplate<TElement> | null);
    /**
     * The shadow root options for the component.
     */
    get shadowOptions(): ShadowRootOptions | undefined;
    set shadowOptions(value: ShadowRootOptions | undefined);
    /**
     * The main set of styles used for the component, independent
     * of any dynamically added styles.
     */
    get mainStyles(): ElementStyles | null;
    set mainStyles(value: ElementStyles | null);
    /**
     * Creates a Controller to control the specified element.
     * @param element - The element to be controlled by this controller.
     * @param definition - The element definition metadata that instructs this
     * controller in how to handle rendering and other platform integrations.
     * @internal
     */
    constructor(element: TElement, definition: FASTElementDefinition);
    /**
     * The subject that subscribers will receive notifications for.
     */
    get subject(): TElement;
    /**
     * Notifies all subscribers of a property change.
     * @param args - The property name that changed.
     */
    notify(args: any): void;
    /**
     * Subscribes to notification of changes in the element's state.
     * @param subscriber - The object that is subscribing for change notification.
     * @param propertyToWatch - The name of the property to watch for changes.
     */
    subscribe(subscriber: Subscriber, propertyToWatch?: any): void;
    /**
     * Unsubscribes from notification of changes in the element's state.
     * @param subscriber - The object that is unsubscribing from change notification.
     * @param propertyToUnwatch - The name of the property to unsubscribe from.
     */
    unsubscribe(subscriber: Subscriber, propertyToUnwatch?: any): void;
    /**
     * Registers an unbind handler with the controller.
     * @param behavior - An object to call when the controller unbinds.
     */
    onUnbind(behavior: {
        unbind(controller: ExpressionController<TElement>): any;
    }): void;
    /**
     * Adds the behavior to the component.
     * @param behavior - The behavior to add.
     */
    addBehavior(behavior: HostBehavior<TElement>): void;
    /**
     * Removes the behavior from the component.
     * @param behavior - The behavior to remove.
     * @param force - Forces removal even if this behavior was added more than once.
     */
    removeBehavior(behavior: HostBehavior<TElement>, force?: boolean): void;
    /**
     * Adds styles to this element. Providing an HTMLStyleElement will attach the element instance to the shadowRoot.
     * @param styles - The styles to add.
     */
    addStyles(styles: ElementStyles | HTMLStyleElement | null | undefined): void;
    /**
     * Removes styles from this element. Providing an HTMLStyleElement will detach the element instance from the shadowRoot.
     * @param styles - the styles to remove.
     */
    removeStyles(styles: ElementStyles | HTMLStyleElement | null | undefined): void;
    /**
     * Runs connected lifecycle behavior on the associated element.
     */
    connect(): void;
    /**
     * Binds any observables that were set before upgrade.
     */
    protected bindObservables(): void;
    /**
     * Captures public own-properties that shadow observable accessors on the
     * prototype so they can be rebound through the accessor before rendering.
     */
    protected captureBoundObservables(): void;
    /**
     * Synchronizes late-defined attribute-map attributes from the live DOM to the
     * associated property values before the initial render occurs.
     */
    protected syncLateAttributes(): void;
    /**
     * Observes late-defined attribute-map attributes that the platform does not
     * surface through attributeChangedCallback because they were added after
     * customElements.define() completed.
     */
    protected observeLateAttributes(): void;
    /**
     * Connects any existing behaviors on the associated element.
     */
    protected connectBehaviors(): void;
    /**
     * Disconnects any behaviors on the associated element.
     */
    protected disconnectBehaviors(): void;
    /**
     * Runs disconnected lifecycle behavior on the associated element.
     */
    disconnect(): void;
    /**
     * Runs the attribute changed callback for the associated element.
     * @param name - The name of the attribute that changed.
     * @param oldValue - The previous value of the attribute.
     * @param newValue - The new value of the attribute.
     */
    onAttributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
    /**
     * Emits a custom HTML event.
     * @param type - The type name of the event.
     * @param detail - The event detail object to send with the event.
     * @param options - The event options. By default bubbles and composed.
     * @remarks
     * Only emits events if connected.
     */
    emit(type: string, detail?: any, options?: TrustEmitOptions): void | boolean;
    /**
     * Renders the provided template to the element.
     *
     * @param template - The template to render.
     * @remarks
     * If `null` is provided, any existing view will be removed.
     */
    protected renderTemplate(template: ElementViewTemplate | null | undefined): void;
    /**
     * Standard client-side render: clears any stale content, clones the
     * compiled fragment, binds, and appends to the host.
     */
    private renderClientSide;
    /**
     * Locates or creates a controller for the specified element.
     * @param element - The element to return the controller for.
     * @param override - Reset the controller even if one has been defined.
     * @remarks
     * The specified element must have a {@link FASTElementDefinition}
     * registered either through the use of the {@link customElement}
     * decorator or a call to `FASTElement.define`.
     */
    static forCustomElement(element: HTMLElement, override?: boolean): ElementController;
    /**
     * Sets the strategy that ElementController.forCustomElement uses to construct
     * ElementController instances for an element.
     * @param strategy - The strategy to use.
     */
    static setStrategy(strategy: ElementControllerStrategy): void;
    /**
     * A hook that, when set, handles prerendered content hydration.
     * Called by renderTemplate when an existing shadow root is detected.
     * Returns true if hydration was performed, false to fall back to client-side.
     * @internal
     */
    private static hydrationHook;
    /**
     * Installs the hydration hook. Called by enableHydration().
     * @internal
     */
    static installHydrationHook(hook: (controller: ElementController, template: ElementViewTemplate, element: HTMLElement, host: Node) => boolean): void;
}
/**
 * https://wicg.github.io/construct-stylesheets/
 * https://developers.google.com/web/updates/2019/02/constructable-stylesheets
 *
 * @internal
 */
export declare class AdoptedStyleSheetsStrategy implements StyleStrategy {
    private static styleSheetCache;
    /** @internal */
    readonly sheets: CSSStyleSheet[];
    constructor(styles: (string | CSSStyleSheet)[]);
    addStylesTo(target: StyleTarget): void;
    removeStylesFrom(target: StyleTarget): void;
}
/**
 * @internal
 */
export declare class StyleElementStrategy implements StyleStrategy {
    private readonly styles;
    private readonly styleClass;
    constructor(styles: string[]);
    addStylesTo(target: StyleTarget): void;
    removeStylesFrom(target: StyleTarget): void;
}
