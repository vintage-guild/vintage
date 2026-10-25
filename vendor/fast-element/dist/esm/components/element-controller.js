var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { Message } from "../interfaces.js";
import { PropertyChangeNotifier } from "../observation/notifier.js";
import { ExecutionContext, Observable, SourceLifetime, } from "../observation/observable.js";
import { FAST, makeSerializationNoop } from "../platform.js";
import { ElementStyles } from "../styles/element-styles.js";
import { wrapDetailWithTrust } from "../trust/utils.js";
import { FASTElementDefinition, getLateAttributeLookup, } from "./fast-definitions.js";
const defaultEventOptions = {
    bubbles: true,
    composed: true,
    cancelable: true,
};
const isConnectedPropertyName = "isConnected";
const shadowRoots = new WeakMap();
const lateAttributeObserver = Symbol("fast-late-attribute-observer");
const behaviorFactories = new Set();
/**
 * Registers a focused integration hook for optional element behaviors.
 * @param factory - Factory invoked for each new element controller.
 * @returns A callback that removes the factory.
 * @internal
 */
export function registerElementControllerBehaviorFactory(factory) {
    behaviorFactories.add(factory);
    return () => behaviorFactories.delete(factory);
}
function getShadowRoot(element) {
    var _a, _b;
    return (_b = (_a = element.shadowRoot) !== null && _a !== void 0 ? _a : shadowRoots.get(element)) !== null && _b !== void 0 ? _b : null;
}
let elementControllerStrategy;
/**
 * The various lifecycle stages of an ElementController.
 * @public
 */
export var Stages;
(function (Stages) {
    /** The element is in the process of connecting. */
    Stages[Stages["connecting"] = 0] = "connecting";
    /** The element is connected. */
    Stages[Stages["connected"] = 1] = "connected";
    /** The element is in the process of disconnecting. */
    Stages[Stages["disconnecting"] = 2] = "disconnecting";
    /** The element is disconnected. */
    Stages[Stages["disconnected"] = 3] = "disconnected";
})(Stages || (Stages = {}));
/**
 * Controls the lifecycle and rendering of a `FASTElement`.
 * @public
 */
export class ElementController {
    /**
     * Indicates whether or not the custom element has been
     * connected to the document.
     */
    get isConnected() {
        Observable.track(this, isConnectedPropertyName);
        return this.stage === Stages.connected;
    }
    /**
     * The context the expression is evaluated against.
     */
    get context() {
        var _a, _b;
        return (_b = (_a = this.view) === null || _a === void 0 ? void 0 : _a.context) !== null && _b !== void 0 ? _b : ExecutionContext.default;
    }
    /**
     * Indicates whether the controller is bound.
     */
    get isBound() {
        var _a, _b;
        return (_b = (_a = this.view) === null || _a === void 0 ? void 0 : _a.isBound) !== null && _b !== void 0 ? _b : false;
    }
    /**
     * Indicates how the source's lifetime relates to the controller's lifetime.
     */
    get sourceLifetime() {
        var _a;
        return (_a = this.view) === null || _a === void 0 ? void 0 : _a.sourceLifetime;
    }
    /**
     * Gets/sets the template used to render the component.
     * @remarks
     * This value can only be accurately read after connect but can be set at any time.
     */
    get template() {
        var _a;
        // 1. Template overrides take top precedence.
        if (this._template === null) {
            const definition = this.definition;
            if (this.source.resolveTemplate) {
                // 2. Allow for element instance overrides next.
                this._template = this.source.resolveTemplate();
            }
            else if (definition.template) {
                // 3. Default to the static definition.
                this._template =
                    (_a = definition.template) !== null && _a !== void 0 ? _a : null;
            }
        }
        return this._template;
    }
    set template(value) {
        if (this._template === value) {
            return;
        }
        this._template = value;
        if (!this.needsInitialization) {
            this.renderTemplate(value);
        }
    }
    /**
     * The shadow root options for the component.
     */
    get shadowOptions() {
        return this._shadowRootOptions;
    }
    set shadowOptions(value) {
        // options on the shadowRoot can only be set once
        if (this._shadowRootOptions === void 0 && value !== void 0) {
            this._shadowRootOptions = value;
            let shadowRoot = this.source.shadowRoot;
            if (shadowRoot) {
                this.hasExistingShadowRoot = true;
            }
            else {
                shadowRoot = this.source.attachShadow(value);
                if (value.mode === "closed") {
                    shadowRoots.set(this.source, shadowRoot);
                }
            }
        }
    }
    /**
     * The main set of styles used for the component, independent
     * of any dynamically added styles.
     */
    get mainStyles() {
        var _a;
        // 1. Styles overrides take top precedence.
        if (this._mainStyles === null) {
            const definition = this.definition;
            if (this.source.resolveStyles) {
                // 2. Allow for element instance overrides next.
                this._mainStyles = this.source.resolveStyles();
            }
            else if (definition.styles) {
                // 3. Default to the static definition.
                this._mainStyles = (_a = definition.styles) !== null && _a !== void 0 ? _a : null;
            }
        }
        return this._mainStyles;
    }
    set mainStyles(value) {
        if (this._mainStyles === value) {
            return;
        }
        if (this._mainStyles !== null) {
            this.removeStyles(this._mainStyles);
        }
        this._mainStyles = value;
        if (!this.needsInitialization) {
            this.addStyles(value);
        }
    }
    /**
     * Creates a Controller to control the specified element.
     * @param element - The element to be controlled by this controller.
     * @param definition - The element definition metadata that instructs this
     * controller in how to handle rendering and other platform integrations.
     * @internal
     */
    constructor(element, definition) {
        /**
         * A map of observable properties that were set on the element before upgrade.
         */
        this.boundObservables = null;
        /**
         * Indicates whether the controller needs to perform initial rendering.
         */
        this.needsInitialization = true;
        /**
         * Indicates whether the element has an existing shadow root (e.g. from declarative shadow DOM).
         */
        this.hasExistingShadowRoot = false;
        /**
         * Resolves `true` when the element had an existing shadow root
         * (from SSR or declarative shadow DOM) at connect time, `false`
         * otherwise.
         */
        this.isPrerendered = new Promise(resolve => {
            this._resolvePrerendered = resolve;
        });
        /**
         * Resolves `true` after prerendered content has been successfully
         * hydrated, or `false` when the component is client-side rendered
         * or hydration is not enabled.
         */
        this.isHydrated = new Promise(resolve => {
            this._resolveHydrated = resolve;
        });
        /**
         * The template used to render the component.
         */
        this._template = null;
        /**
         * The current lifecycle stage of the controller.
         */
        this.stage = Stages.disconnected;
        /**
         * A guard against connecting behaviors multiple times
         * during connect in scenarios where a behavior adds
         * another behavior during it's connectedCallback
         */
        this.guardBehaviorConnection = false;
        /**
         * The behaviors associated with the component.
         */
        this.behaviors = null;
        /**
         * Tracks whether behaviors are connected so that
         * behaviors cant be connected multiple times
         */
        this.behaviorsConnected = false;
        /**
         * The main set of styles used for the component, independent of any
         * dynamically added styles.
         */
        this._mainStyles = null;
        /**
         * This allows Observable.getNotifier(...) to return the Controller
         * when the notifier for the Controller itself is being requested. The
         * result is that the Observable system does not need to create a separate
         * instance of Notifier for observables on the Controller. The component and
         * the controller will now share the same notifier, removing one-object construct
         * per web component instance.
         */
        this.$fastController = this;
        /**
         * The view associated with the custom element.
         * @remarks
         * If `null` then the element is managing its own rendering.
         */
        this.view = null;
        this._notifier = new PropertyChangeNotifier(element);
        this.source = element;
        this.definition = definition;
        this.shadowOptions = definition.shadowOptions;
        const prototype = Reflect.getPrototypeOf(element);
        const accessors = prototype === null ? [] : Observable.getAccessors(prototype);
        if (accessors.length > 0) {
            const boundObservables = (this.boundObservables = Object.create(null));
            for (let i = 0, ii = accessors.length; i < ii; ++i) {
                const propertyName = accessors[i].name;
                const value = element[propertyName];
                if (value !== void 0) {
                    delete element[propertyName];
                    boundObservables[propertyName] = value;
                }
            }
            if (Object.keys(boundObservables).length === 0) {
                this.boundObservables = null;
            }
        }
        // Capture any observable values that were set after construction but before
        // the first connect (for example, late-defined declarative accessors).
        this.captureBoundObservables();
        for (const factory of behaviorFactories) {
            const behavior = factory(element);
            if (behavior !== void 0) {
                this.addBehavior(behavior);
            }
        }
    }
    /**
     * The subject that subscribers will receive notifications for.
     */
    get subject() {
        return this._notifier.subject;
    }
    /**
     * Notifies all subscribers of a property change.
     * @param args - The property name that changed.
     */
    notify(args) {
        this._notifier.notify(args);
    }
    /**
     * Subscribes to notification of changes in the element's state.
     * @param subscriber - The object that is subscribing for change notification.
     * @param propertyToWatch - The name of the property to watch for changes.
     */
    subscribe(subscriber, propertyToWatch) {
        this._notifier.subscribe(subscriber, propertyToWatch);
    }
    /**
     * Unsubscribes from notification of changes in the element's state.
     * @param subscriber - The object that is unsubscribing from change notification.
     * @param propertyToUnwatch - The name of the property to unsubscribe from.
     */
    unsubscribe(subscriber, propertyToUnwatch) {
        this._notifier.unsubscribe(subscriber, propertyToUnwatch);
    }
    /**
     * Registers an unbind handler with the controller.
     * @param behavior - An object to call when the controller unbinds.
     */
    onUnbind(behavior) {
        var _a;
        (_a = this.view) === null || _a === void 0 ? void 0 : _a.onUnbind(behavior);
    }
    /**
     * Adds the behavior to the component.
     * @param behavior - The behavior to add.
     */
    addBehavior(behavior) {
        var _a, _b;
        const targetBehaviors = (_a = this.behaviors) !== null && _a !== void 0 ? _a : (this.behaviors = new Map());
        const count = (_b = targetBehaviors.get(behavior)) !== null && _b !== void 0 ? _b : 0;
        if (count === 0) {
            targetBehaviors.set(behavior, 1);
            behavior.addedCallback && behavior.addedCallback(this);
            if (behavior.connectedCallback &&
                !this.guardBehaviorConnection &&
                (this.stage === Stages.connected || this.stage === Stages.connecting)) {
                behavior.connectedCallback(this);
            }
        }
        else {
            targetBehaviors.set(behavior, count + 1);
        }
    }
    /**
     * Removes the behavior from the component.
     * @param behavior - The behavior to remove.
     * @param force - Forces removal even if this behavior was added more than once.
     */
    removeBehavior(behavior, force = false) {
        const targetBehaviors = this.behaviors;
        if (targetBehaviors === null) {
            return;
        }
        const count = targetBehaviors.get(behavior);
        if (count === void 0) {
            return;
        }
        if (count === 1 || force) {
            targetBehaviors.delete(behavior);
            if (behavior.disconnectedCallback && this.stage !== Stages.disconnected) {
                behavior.disconnectedCallback(this);
            }
            behavior.removedCallback && behavior.removedCallback(this);
        }
        else {
            targetBehaviors.set(behavior, count - 1);
        }
    }
    /**
     * Adds styles to this element. Providing an HTMLStyleElement will attach the element instance to the shadowRoot.
     * @param styles - The styles to add.
     */
    addStyles(styles) {
        var _a;
        if (!styles) {
            return;
        }
        const source = this.source;
        if (styles instanceof HTMLElement) {
            const target = (_a = getShadowRoot(source)) !== null && _a !== void 0 ? _a : this.source;
            target.append(styles);
        }
        else if (!styles.isAttachedTo(source)) {
            styles.addStylesTo(source);
        }
    }
    /**
     * Removes styles from this element. Providing an HTMLStyleElement will detach the element instance from the shadowRoot.
     * @param styles - the styles to remove.
     */
    removeStyles(styles) {
        var _a;
        if (!styles) {
            return;
        }
        const source = this.source;
        if (styles instanceof HTMLElement) {
            const target = (_a = getShadowRoot(source)) !== null && _a !== void 0 ? _a : source;
            target.removeChild(styles);
        }
        else if (styles.isAttachedTo(source)) {
            styles.removeStylesFrom(source);
        }
    }
    /**
     * Runs connected lifecycle behavior on the associated element.
     */
    connect() {
        if (this.stage !== Stages.disconnected) {
            return;
        }
        this.stage = Stages.connecting;
        this.captureBoundObservables();
        this.syncLateAttributes();
        this.observeLateAttributes();
        this.bindObservables();
        this.connectBehaviors();
        if (this.needsInitialization) {
            this.renderTemplate(this.template);
            this.addStyles(this.mainStyles);
            this.needsInitialization = false;
        }
        else if (this.view !== null) {
            this.view.bind(this.source);
        }
        this.stage = Stages.connected;
        Observable.notify(this, isConnectedPropertyName);
    }
    /**
     * Binds any observables that were set before upgrade.
     */
    bindObservables() {
        if (this.boundObservables !== null) {
            const element = this.source;
            const boundObservables = this.boundObservables;
            const propertyNames = Object.keys(boundObservables);
            for (let i = 0, ii = propertyNames.length; i < ii; ++i) {
                const propertyName = propertyNames[i];
                element[propertyName] = boundObservables[propertyName];
            }
            this.boundObservables = null;
        }
    }
    /**
     * Captures public own-properties that shadow observable accessors on the
     * prototype so they can be rebound through the accessor before rendering.
     */
    captureBoundObservables() {
        const element = this.source;
        const propertyNames = Object.getOwnPropertyNames(element);
        const hasPrototypeAccessor = (propertyName) => {
            let currentTarget = Reflect.getPrototypeOf(element);
            while (currentTarget !== null) {
                const descriptor = Reflect.getOwnPropertyDescriptor(currentTarget, propertyName);
                if ((descriptor === null || descriptor === void 0 ? void 0 : descriptor.get) || (descriptor === null || descriptor === void 0 ? void 0 : descriptor.set)) {
                    return true;
                }
                currentTarget = Reflect.getPrototypeOf(currentTarget);
            }
            return false;
        };
        let boundObservables = this.boundObservables;
        for (let i = 0, ii = propertyNames.length; i < ii; ++i) {
            const ownPropertyName = propertyNames[i];
            const propertyName = ownPropertyName;
            if (!hasPrototypeAccessor(propertyName)) {
                continue;
            }
            const value = element[propertyName];
            if (value === void 0) {
                delete element[propertyName];
                continue;
            }
            delete element[propertyName];
            (boundObservables !== null && boundObservables !== void 0 ? boundObservables : (boundObservables = this.boundObservables = Object.create(null)))[propertyName] = value;
        }
    }
    /**
     * Synchronizes late-defined attribute-map attributes from the live DOM to the
     * associated property values before the initial render occurs.
     */
    syncLateAttributes() {
        const lateAttributes = getLateAttributeLookup(this.definition);
        if (lateAttributes === null) {
            return;
        }
        for (const attributeName of Object.keys(lateAttributes)) {
            if (!this.source.hasAttribute(attributeName)) {
                continue;
            }
            this.onAttributeChangedCallback(attributeName, null, this.source.getAttribute(attributeName));
        }
    }
    /**
     * Observes late-defined attribute-map attributes that the platform does not
     * surface through attributeChangedCallback because they were added after
     * customElements.define() completed.
     */
    observeLateAttributes() {
        const lateAttributes = getLateAttributeLookup(this.definition);
        if (lateAttributes === null) {
            return;
        }
        const element = this.source;
        if (element[lateAttributeObserver] !== void 0) {
            return;
        }
        element[lateAttributeObserver] = new MutationObserver(records => {
            const controller = element.$fastController;
            const lateAttributes = getLateAttributeLookup(controller.definition);
            if (lateAttributes === null) {
                return;
            }
            for (let i = 0, ii = records.length; i < ii; ++i) {
                const attributeName = records[i].attributeName;
                if (attributeName === null || lateAttributes[attributeName] === void 0) {
                    continue;
                }
                controller.onAttributeChangedCallback(attributeName, null, element.getAttribute(attributeName));
            }
        });
        element[lateAttributeObserver].observe(element, {
            attributes: true,
            attributeFilter: Object.keys(lateAttributes),
        });
    }
    /**
     * Connects any existing behaviors on the associated element.
     */
    connectBehaviors() {
        if (this.behaviorsConnected === false) {
            const behaviors = this.behaviors;
            if (behaviors !== null) {
                this.guardBehaviorConnection = true;
                for (const key of behaviors.keys()) {
                    key.connectedCallback && key.connectedCallback(this);
                }
                this.guardBehaviorConnection = false;
            }
            this.behaviorsConnected = true;
        }
    }
    /**
     * Disconnects any behaviors on the associated element.
     */
    disconnectBehaviors() {
        if (this.behaviorsConnected === true) {
            const behaviors = this.behaviors;
            if (behaviors !== null) {
                for (const key of behaviors.keys()) {
                    key.disconnectedCallback && key.disconnectedCallback(this);
                }
            }
            this.behaviorsConnected = false;
        }
    }
    /**
     * Runs disconnected lifecycle behavior on the associated element.
     */
    disconnect() {
        if (this.stage !== Stages.connected) {
            return;
        }
        this.stage = Stages.disconnecting;
        Observable.notify(this, isConnectedPropertyName);
        if (this.view !== null) {
            this.view.unbind();
        }
        this.disconnectBehaviors();
        this.stage = Stages.disconnected;
    }
    /**
     * Runs the attribute changed callback for the associated element.
     * @param name - The name of the attribute that changed.
     * @param oldValue - The previous value of the attribute.
     * @param newValue - The new value of the attribute.
     */
    onAttributeChangedCallback(name, oldValue, newValue) {
        const attrDef = this.definition.attributeLookup[name];
        if (attrDef !== void 0) {
            attrDef.onAttributeChangedCallback(this.source, newValue);
        }
    }
    /**
     * Emits a custom HTML event.
     * @param type - The type name of the event.
     * @param detail - The event detail object to send with the event.
     * @param options - The event options. By default bubbles and composed.
     * @remarks
     * Only emits events if connected.
     */
    emit(type, detail, options) {
        if (this.stage === Stages.connected) {
            const _a = options !== null && options !== void 0 ? options : {}, { confidence, reasoning } = _a, eventOptions = __rest(_a, ["confidence", "reasoning"]);
            const wrappedDetail = wrapDetailWithTrust(detail, confidence, reasoning);
            return this.source.dispatchEvent(new CustomEvent(type, Object.assign(Object.assign(Object.assign({}, defaultEventOptions), eventOptions), { detail: wrappedDetail })));
        }
        return false;
    }
    /**
     * Renders the provided template to the element.
     *
     * @param template - The template to render.
     * @remarks
     * If `null` is provided, any existing view will be removed.
     */
    renderTemplate(template) {
        var _a;
        const element = this.source;
        const host = (_a = getShadowRoot(element)) !== null && _a !== void 0 ? _a : element;
        if (this.view !== null) {
            this.view.dispose();
            this.view = null;
        }
        else if (!this.needsInitialization || this.hasExistingShadowRoot) {
            if (!this.hasExistingShadowRoot || !this.needsInitialization) {
                for (let child = host.firstChild; child !== null; child = host.firstChild) {
                    host.removeChild(child);
                }
            }
        }
        if (template) {
            const hasPrerenderedContent = this.hasExistingShadowRoot && this.needsInitialization;
            let didHydrate = false;
            if (hasPrerenderedContent && ElementController.hydrationHook) {
                didHydrate = ElementController.hydrationHook(this, template, element, host);
            }
            if (!didHydrate) {
                this.renderClientSide(template, element, host);
            }
            this._resolvePrerendered(hasPrerenderedContent);
            this._resolveHydrated(didHydrate);
        }
        else if (this.needsInitialization) {
            this._resolvePrerendered(false);
            this._resolveHydrated(false);
        }
    }
    /**
     * Standard client-side render: clears any stale content, clones the
     * compiled fragment, binds, and appends to the host.
     */
    renderClientSide(template, element, host) {
        if (this.hasExistingShadowRoot) {
            for (let child = host.firstChild; child !== null; child = host.firstChild) {
                host.removeChild(child);
            }
            this.hasExistingShadowRoot = false;
        }
        this.view = template.render(element, host, element);
        this.view.sourceLifetime =
            SourceLifetime.coupled;
    }
    /**
     * Locates or creates a controller for the specified element.
     * @param element - The element to return the controller for.
     * @param override - Reset the controller even if one has been defined.
     * @remarks
     * The specified element must have a {@link FASTElementDefinition}
     * registered either through the use of the {@link customElement}
     * decorator or a call to `FASTElement.define`.
     */
    static forCustomElement(element, override = false) {
        const controller = element.$fastController;
        if (controller !== void 0 && !override) {
            return controller;
        }
        const definition = FASTElementDefinition.getForInstance(element);
        if (definition === void 0) {
            throw FAST.error(Message.missingElementDefinition);
        }
        Observable.getNotifier(definition).subscribe({
            handleChange: () => {
                ElementController.forCustomElement(element, true);
                element.$fastController.connect();
            },
        }, "template");
        Observable.getNotifier(definition).subscribe({
            handleChange: () => {
                ElementController.forCustomElement(element, true);
                element.$fastController.connect();
            },
        }, "shadowOptions");
        return (element.$fastController = new elementControllerStrategy(element, definition));
    }
    /**
     * Sets the strategy that ElementController.forCustomElement uses to construct
     * ElementController instances for an element.
     * @param strategy - The strategy to use.
     */
    static setStrategy(strategy) {
        elementControllerStrategy = strategy;
    }
    /**
     * Installs the hydration hook. Called by enableHydration().
     * @internal
     */
    static installHydrationHook(hook) {
        ElementController.hydrationHook = hook;
    }
}
// --- Static hydration hook ---
/**
 * A hook that, when set, handles prerendered content hydration.
 * Called by renderTemplate when an existing shadow root is detected.
 * Returns true if hydration was performed, false to fall back to client-side.
 * @internal
 */
ElementController.hydrationHook = null;
makeSerializationNoop(ElementController);
// Set default strategy for ElementController
ElementController.setStrategy(ElementController);
/**
 * Converts a styleTarget into the operative target. When the provided target is an Element
 * that is a FASTElement, the function will return the ShadowRoot for that element. Otherwise,
 * it will return the root node for the element.
 * @param target
 * @returns
 */
function normalizeStyleTarget(target) {
    var _a;
    if ("adoptedStyleSheets" in target) {
        return target;
    }
    else {
        return ((_a = getShadowRoot(target)) !== null && _a !== void 0 ? _a : target.getRootNode());
    }
}
// Default StyleStrategy implementations are defined in this module because they
// require access to element shadowRoots, and we don't want to leak shadowRoot
// objects out of this module.
/**
 * https://wicg.github.io/construct-stylesheets/
 * https://developers.google.com/web/updates/2019/02/constructable-stylesheets
 *
 * @internal
 */
export class AdoptedStyleSheetsStrategy {
    constructor(styles) {
        const styleSheetCache = AdoptedStyleSheetsStrategy.styleSheetCache;
        this.sheets = styles.map((x) => {
            if (x instanceof CSSStyleSheet) {
                return x;
            }
            let sheet = styleSheetCache.get(x);
            if (sheet === void 0) {
                sheet = new CSSStyleSheet();
                sheet.replaceSync(x);
                styleSheetCache.set(x, sheet);
            }
            return sheet;
        });
    }
    addStylesTo(target) {
        addAdoptedStyleSheets(normalizeStyleTarget(target), this.sheets);
    }
    removeStylesFrom(target) {
        removeAdoptedStyleSheets(normalizeStyleTarget(target), this.sheets);
    }
}
AdoptedStyleSheetsStrategy.styleSheetCache = new Map();
let id = 0;
const nextStyleId = () => `fast-${++id}`;
function usableStyleTarget(target) {
    return target === document ? document.body : target;
}
/**
 * @internal
 */
export class StyleElementStrategy {
    constructor(styles) {
        this.styles = styles;
        this.styleClass = nextStyleId();
    }
    addStylesTo(target) {
        target = usableStyleTarget(normalizeStyleTarget(target));
        const styles = this.styles;
        const styleClass = this.styleClass;
        for (let i = 0; i < styles.length; i++) {
            const element = document.createElement("style");
            element.innerHTML = styles[i];
            element.className = styleClass;
            target.append(element);
        }
    }
    removeStylesFrom(target) {
        target = usableStyleTarget(normalizeStyleTarget(target));
        const styles = target.querySelectorAll(`.${this.styleClass}`);
        for (let i = 0, ii = styles.length; i < ii; ++i) {
            target.removeChild(styles[i]);
        }
    }
}
let addAdoptedStyleSheets = (target, sheets) => {
    target.adoptedStyleSheets = [...target.adoptedStyleSheets, ...sheets];
};
let removeAdoptedStyleSheets = (target, sheets) => {
    target.adoptedStyleSheets = target.adoptedStyleSheets.filter((x) => sheets.indexOf(x) === -1);
};
if (ElementStyles.supportsAdoptedStyleSheets) {
    try {
        // Test if browser implementation uses FrozenArray.
        // If not, use push / splice to alter the stylesheets
        // in place. This circumvents a bug in Safari 16.4 where
        // periodically, assigning the array would previously
        // cause sheets to be removed.
        document.adoptedStyleSheets.push();
        document.adoptedStyleSheets.splice();
        addAdoptedStyleSheets = (target, sheets) => {
            target.adoptedStyleSheets.push(...sheets);
        };
        removeAdoptedStyleSheets = (target, sheets) => {
            for (const sheet of sheets) {
                const index = target.adoptedStyleSheets.indexOf(sheet);
                if (index !== -1) {
                    target.adoptedStyleSheets.splice(index, 1);
                }
            }
        };
    }
    catch (_e) {
        // Do nothing if an error is thrown, the default
        // case handles FrozenArray.
    }
    ElementStyles.setDefaultStrategy(AdoptedStyleSheetsStrategy);
}
else {
    ElementStyles.setDefaultStrategy(StyleElementStrategy);
}
