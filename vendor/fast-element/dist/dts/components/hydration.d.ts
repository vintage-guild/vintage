import type { ContentTemplate, HydratableContentTemplate } from "../templating/html-binding-directive.js";
import type { ViewController } from "../templating/html-directive.js";
import type { HydratableViewController } from "../templating/hydration-view.js";
import type { ElementViewTemplate, HydratableElementViewTemplate, HydratableSyntheticViewTemplate, SyntheticViewTemplate } from "../templating/template.js";
/**
 * Markup utilities to aid in template hydration.
 * @internal
 */
export declare const HydrationMarkup: Readonly<{
    attributeMarkerName: "data-fe";
    legacyAttributeMarkerName: "data-fe-b";
    legacyCompactAttributeMarkerName: "data-fe-c";
    contentBindingStartMarker(): string;
    contentBindingEndMarker(): string;
    repeatStartMarker(): string;
    repeatEndMarker(): string;
    elementBoundaryStartMarker(): string;
    elementBoundaryEndMarker(): string;
    isContentBindingStartMarker(data: string): boolean;
    isContentBindingEndMarker(data: string): boolean;
    isRepeatViewStartMarker(data: string): boolean;
    isRepeatViewEndMarker(data: string): boolean;
    isElementBoundaryStartMarker(node: Node): boolean;
    isElementBoundaryEndMarker(node: Node): boolean;
    /**
     * Returns the count of attribute bindings on the element, or null
     * if no attribute binding marker is present.
     *
     * Parses the `data-fe="N"` attribute format where N is the count
     * of attribute binding factories targeting this element.
     */
    parseAttributeBindingCount(node: Element): number | null;
    parseLegacyAttributeBindingIndices(node: Element): number[] | null;
    removeLegacyAttributeBindingMarkers(node: Element): void;
    parseLegacyContentBindingStartIndex(data: string): number | null;
}>;
/**
 * @internal
 */
export declare const Hydratable: unique symbol;
/**
 * Tests if a template or ViewController is hydratable.
 *
 * @beta
 */
export declare function isHydratable(view: ViewController): view is HydratableViewController;
/** @beta */
export declare function isHydratable<TSource = any, TParent = any>(template: SyntheticViewTemplate<TSource, TParent>): template is HydratableSyntheticViewTemplate<TSource, TParent>;
/** @beta */
export declare function isHydratable<TSource = any, TParent = any>(template: ElementViewTemplate<TSource, TParent>): template is HydratableElementViewTemplate<TSource, TParent>;
/** @beta */
export declare function isHydratable(template: ContentTemplate): template is HydratableContentTemplate;
