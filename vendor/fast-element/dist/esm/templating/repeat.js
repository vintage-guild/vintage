import { normalizeBinding } from "../binding/normalize.js";
import { HydrationMarkup, isHydratable } from "../components/hydration.js";
import { ArrayObserver } from "../observation/arrays.js";
import { Observable, } from "../observation/observable.js";
import { emptyArray } from "../platform.js";
import { HTMLDirective, } from "./html-directive.js";
import { HydrationStage } from "./hydration-view.js";
import { Markup } from "./markup.js";
import { HTMLView } from "./view.js";
const defaultRepeatOptions = Object.freeze({
    positioning: false,
    recycle: true,
});
function bindWithoutPositioning(view, items, index, controller) {
    view.context.parent = controller.source;
    view.context.parentContext = controller.context;
    view.bind(items[index]);
}
function bindWithPositioning(view, items, index, controller) {
    view.context.parent = controller.source;
    view.context.parentContext = controller.context;
    view.context.length = items.length;
    view.context.index = index;
    view.bind(items[index]);
}
function isCommentNode(node) {
    return node.nodeType === Node.COMMENT_NODE;
}
function removeNodeRange(first, last) {
    const parentNode = first.parentNode;
    if (parentNode === null) {
        return;
    }
    let current = first;
    while (current !== null) {
        const next = current.nextSibling;
        parentNode.removeChild(current);
        if (current === last) {
            break;
        }
        current = next;
    }
}
export class HydrationRepeatError extends Error {
    constructor(
    /**
     * The error message
     */
    message, propertyBag) {
        super(message);
        this.propertyBag = propertyBag;
    }
}
/**
 * A behavior that renders a template for each item in an array.
 * @public
 */
export class RepeatBehavior {
    /**
     * Creates an instance of RepeatBehavior.
     * @param location - The location in the DOM to render the repeat.
     * @param dataBinding - The array to render.
     * @param isItemsBindingVolatile - Indicates whether the items binding has volatile dependencies.
     * @param templateBinding - The template to render for each item.
     * @param isTemplateBindingVolatile - Indicates whether the template binding has volatile dependencies.
     * @param options - Options used to turn on special repeat features.
     */
    constructor(directive) {
        this.directive = directive;
        this.isBound = false;
        this.items = null;
        this.itemsObserver = null;
        this.bindView = bindWithoutPositioning;
        /** @internal */
        this.views = [];
        this.itemsBindingObserver = directive.dataBinding.createObserver(this, directive);
        this.templateBindingObserver = directive.templateBinding.createObserver(this, directive);
        if (directive.options.positioning) {
            this.bindView = bindWithPositioning;
        }
    }
    /**
     * Bind this behavior.
     * @param controller - The view controller that manages the lifecycle of this behavior.
     */
    bind(controller) {
        this.location = controller.targets[this.directive.targetNodeId];
        this.controller = controller;
        this.isBound = true;
        this.items = this.itemsBindingObserver.bind(controller);
        this.template = this.templateBindingObserver.bind(controller);
        this.observeItems(true);
        if (isHydratable(this.template) &&
            isHydratable(controller) &&
            controller.hydrationStage !== HydrationStage.hydrated) {
            this.hydrateViews(this.template);
        }
        else {
            this.refreshAllViews();
        }
        controller.onUnbind(this);
    }
    /**
     * Unbinds this behavior.
     */
    unbind() {
        this.isBound = false;
        if (this.itemsObserver !== null) {
            this.itemsObserver.unsubscribe(this);
        }
        this.unbindAllViews();
    }
    /**
     * Handles changes in the array, its items, and the repeat template.
     * @param source - The source of the change.
     * @param args - The details about what was changed.
     */
    handleChange(source, args) {
        // Notifications queued before unbind must not reobserve a cleared view source.
        if (!this.isBound) {
            return;
        }
        if (args === this.itemsBindingObserver) {
            this.items = this.itemsBindingObserver.bind(this.controller);
            this.observeItems();
            this.refreshAllViews();
        }
        else if (args === this.templateBindingObserver) {
            this.template = this.templateBindingObserver.bind(this.controller);
            this.refreshAllViews(true);
        }
        else if (!args[0]) {
            return;
        }
        else if (args[0].reset) {
            this.refreshAllViews();
        }
        else if (args[0].sorted) {
            this.updateSortedViews(args);
        }
        else {
            this.updateSplicedViews(args);
        }
    }
    observeItems(force = false) {
        if (!this.items) {
            this.items = emptyArray;
            return;
        }
        const oldObserver = this.itemsObserver;
        const newObserver = (this.itemsObserver = Observable.getNotifier(this.items));
        const hasNewObserver = oldObserver !== newObserver;
        if (hasNewObserver && oldObserver !== null) {
            oldObserver.unsubscribe(this);
        }
        if (hasNewObserver || force) {
            newObserver.subscribe(this);
        }
    }
    updateSortedViews(sorts) {
        const views = this.views;
        for (let i = 0, ii = sorts.length; i < ii; ++i) {
            const sortedItems = sorts[i].sorted.slice();
            const unsortedItems = sortedItems.slice().sort();
            for (let j = 0, jj = sortedItems.length; j < jj; ++j) {
                const sortedIndex = sortedItems.find(value => sortedItems[j] === unsortedItems[value]);
                if (sortedIndex !== j) {
                    const removedItems = unsortedItems.splice(sortedIndex, 1);
                    unsortedItems.splice(j, 0, ...removedItems);
                    const neighbor = views[j];
                    const location = neighbor ? neighbor.firstChild : this.location;
                    views[sortedIndex].remove();
                    views[sortedIndex].insertBefore(location);
                    const removedViews = views.splice(sortedIndex, 1);
                    views.splice(j, 0, ...removedViews);
                }
            }
        }
    }
    updateSplicedViews(splices) {
        const views = this.views;
        const bindView = this.bindView;
        const items = this.items;
        const template = this.template;
        const controller = this.controller;
        const recycle = this.directive.options.recycle;
        const leftoverViews = [];
        let leftoverIndex = 0;
        let availableViews = 0;
        for (let i = 0, ii = splices.length; i < ii; ++i) {
            const splice = splices[i];
            const removed = splice.removed;
            let removeIndex = 0;
            let addIndex = splice.index;
            const end = addIndex + splice.addedCount;
            const removedViews = views.splice(splice.index, removed.length);
            const totalAvailableViews = (availableViews =
                leftoverViews.length + removedViews.length);
            for (; addIndex < end; ++addIndex) {
                const neighbor = views[addIndex];
                const location = neighbor ? neighbor.firstChild : this.location;
                let view;
                if (recycle && availableViews > 0) {
                    if (removeIndex <= totalAvailableViews && removedViews.length > 0) {
                        view = removedViews[removeIndex];
                        removeIndex++;
                    }
                    else {
                        view = leftoverViews[leftoverIndex];
                        leftoverIndex++;
                    }
                    availableViews--;
                }
                else {
                    view = template.create();
                }
                views.splice(addIndex, 0, view);
                bindView(view, items, addIndex, controller);
                view.insertBefore(location);
            }
            if (removedViews[removeIndex]) {
                leftoverViews.push(...removedViews.slice(removeIndex));
            }
        }
        for (let i = leftoverIndex, ii = leftoverViews.length; i < ii; ++i) {
            leftoverViews[i].dispose();
        }
        if (this.directive.options.positioning) {
            for (let i = 0, viewsLength = views.length; i < viewsLength; ++i) {
                const context = views[i].context;
                context.length = viewsLength;
                context.index = i;
            }
        }
    }
    refreshAllViews(templateChanged = false) {
        const items = this.items;
        const template = this.template;
        const location = this.location;
        const bindView = this.bindView;
        const controller = this.controller;
        let itemsLength = items.length;
        let views = this.views;
        let viewsLength = views.length;
        if (itemsLength === 0 || templateChanged || !this.directive.options.recycle) {
            // all views need to be removed
            HTMLView.disposeContiguousBatch(views);
            viewsLength = 0;
        }
        if (viewsLength === 0) {
            // all views need to be created
            this.views = views = new Array(itemsLength);
            for (let i = 0; i < itemsLength; ++i) {
                const view = template.create();
                bindView(view, items, i, controller);
                views[i] = view;
                view.insertBefore(location);
            }
        }
        else {
            // attempt to reuse existing views with new data
            let i = 0;
            for (; i < itemsLength; ++i) {
                if (i < viewsLength) {
                    const view = views[i];
                    if (!view) {
                        const serializer = new XMLSerializer();
                        throw new HydrationRepeatError(`View is null or undefined inside "${this.location.getRootNode().host.nodeName}".`, {
                            index: i,
                            hydrationStage: this.controller
                                .hydrationStage,
                            itemsLength,
                            viewsState: views.map(v => (v ? "hydrated" : "empty")),
                            viewTemplateString: serializer.serializeToString(template.create().fragment),
                            rootNodeContent: serializer.serializeToString(this.location.getRootNode()),
                        });
                    }
                    bindView(view, items, i, controller);
                }
                else {
                    const view = template.create();
                    bindView(view, items, i, controller);
                    views.push(view);
                    view.insertBefore(location);
                }
            }
            const removed = views.splice(i, viewsLength - i);
            for (i = 0, itemsLength = removed.length; i < itemsLength; ++i) {
                removed[i].dispose();
            }
        }
    }
    unbindAllViews() {
        const views = this.views;
        for (let i = 0, ii = views.length; i < ii; ++i) {
            const view = views[i];
            if (!view) {
                const serializer = new XMLSerializer();
                throw new HydrationRepeatError(`View is null or undefined inside "${this.location.getRootNode().host.nodeName}".`, {
                    index: i,
                    hydrationStage: this.controller.hydrationStage,
                    viewsState: views.map(v => (v ? "hydrated" : "empty")),
                    rootNodeContent: serializer.serializeToString(this.location.getRootNode()),
                });
            }
            view.unbind();
        }
    }
    hydrateViews(template) {
        var _a;
        if (!this.items) {
            return;
        }
        const items = this.items;
        const itemCount = items.length;
        const views = (this.views = new Array(itemCount));
        // First pass: collect all repeat marker pairs by walking backward.
        // Each entry tracks both the item content range and its SSR markers.
        const itemRanges = [];
        let current = this.location.previousSibling;
        while (current !== null) {
            if (!isCommentNode(current) ||
                !HydrationMarkup.isRepeatViewEndMarker(current.data)) {
                current = current.previousSibling;
                continue;
            }
            const endMarker = current;
            endMarker.data = "";
            const end = endMarker.previousSibling;
            if (!end) {
                throw new Error(`Error when hydrating inside "${this.location.getRootNode().host.nodeName}": end should never be null.`);
            }
            // Find matching start marker via balanced counting
            let start = end;
            let depth = 0;
            while (start !== null) {
                if (isCommentNode(start)) {
                    if (HydrationMarkup.isRepeatViewEndMarker(start.data)) {
                        depth++;
                    }
                    else if (HydrationMarkup.isRepeatViewStartMarker(start.data)) {
                        if (depth === 0) {
                            const startMarker = start;
                            startMarker.data = "";
                            current = startMarker.previousSibling;
                            const itemStart = (_a = startMarker.nextSibling) !== null && _a !== void 0 ? _a : endMarker;
                            // Empty item: start and end markers are adjacent.
                            const itemEnd = end === startMarker ? itemStart : end;
                            itemRanges.push({
                                start: itemStart,
                                end: itemEnd,
                                startMarker,
                                endMarker,
                            });
                            break;
                        }
                        depth--;
                    }
                }
                start = start.previousSibling;
            }
            if (!start) {
                throw new Error(`Error when hydrating inside "${this.location.getRootNode().host.nodeName}": repeat start marker not found.`);
            }
        }
        // Ranges were collected backward (last item first).
        // Reverse so index 0 = first SSR item.
        itemRanges.reverse();
        // Hydrate each SSR item at its correct index (0-based from start).
        const hydrationCount = Math.min(itemRanges.length, itemCount);
        for (let i = 0; i < hydrationCount; i++) {
            const { start, end } = itemRanges[i];
            const view = template.hydrate(start, end);
            views[i] = view;
            this.bindView(view, items, i, this.controller);
        }
        for (let i = hydrationCount; i < itemCount; i++) {
            const view = template.create();
            views[i] = view;
            this.bindView(view, items, i, this.controller);
            view.insertBefore(this.location);
        }
        for (let i = itemCount, ii = itemRanges.length; i < ii; i++) {
            const { startMarker, endMarker } = itemRanges[i];
            removeNodeRange(startMarker, endMarker);
        }
    }
}
/**
 * A directive that configures list rendering.
 * @public
 */
export class RepeatDirective {
    /**
     * Creates a placeholder string based on the directive's index within the template.
     * @param index - The index of the directive within the template.
     */
    createHTML(add) {
        return Markup.comment(add(this));
    }
    /**
     * Creates an instance of RepeatDirective.
     * @param dataBinding - The binding that provides the array to render.
     * @param templateBinding - The template binding used to obtain a template to render for each item in the array.
     * @param options - Options used to turn on special repeat features.
     */
    constructor(dataBinding, templateBinding, options) {
        this.dataBinding = dataBinding;
        this.templateBinding = templateBinding;
        this.options = options;
        ArrayObserver.enable();
    }
    /**
     * Creates a behavior for the provided target node.
     * @param target - The node instance to create the behavior for.
     */
    createBehavior() {
        return new RepeatBehavior(this);
    }
}
HTMLDirective.define(RepeatDirective);
/**
 * A directive that enables list rendering.
 * @param items - The array to render.
 * @param template - The template or a template binding used obtain a template
 * to render for each item in the array.
 * @param options - Options used to turn on special repeat features.
 * @public
 */
export function repeat(items, template, options = defaultRepeatOptions) {
    const dataBinding = normalizeBinding(items);
    const templateBinding = normalizeBinding(template);
    return new RepeatDirective(dataBinding, templateBinding, Object.assign(Object.assign({}, defaultRepeatOptions), options));
}
