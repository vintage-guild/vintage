import type { Schema } from "../components/schema.js";
import { ViewTemplate } from "../templating/template.js";
/**
 * The return type for {@link TemplateParser.parse}.
 * @public
 */
export interface ResolvedStringsAndValues {
    strings: Array<string>;
    values: Array<any>;
}
/**
 * Converts declarative HTML template markup into the `strings` and `values`
 * arrays that `ViewTemplate.create()` consumes.
 *
 * This class is intentionally stateless across invocations — all mutable
 * parsing state lives on the call stack or in the `TemplateResolutionContext`.
 *
 * The parsing pipeline is fully synchronous — no promises are allocated
 * during template resolution.
 * @public
 */
export declare class TemplateParser {
    /**
     * Parse declarative HTML into strings and values for ViewTemplate creation.
     * @param innerHTML - The transformed innerHTML to parse.
     * @param schema - The Schema instance for property tracking.
     * @returns The resolved strings and values.
     */
    parse(innerHTML: string, schema: Schema): ResolvedStringsAndValues;
    /**
     * Create a ViewTemplate from resolved strings and values.
     * @param strings - The strings array.
     * @param values - The interpreted values.
     */
    createTemplate(strings: Array<string>, values: Array<any>): ViewTemplate<any, any>;
    /**
     * Resolve strings and values from an innerHTML string.
     * @param rootPropertyName - The root property name for schema registration.
     * @param innerHTML - The innerHTML.
     * @param context - The template resolution context.
     */
    private resolveStringsAndValues;
    /**
     * Resolve a template directive (when/repeat).
     * @param rootPropertyName - The root property name for schema registration.
     * @param behaviorConfig - The directive behavior configuration object.
     * @param externalValues - The interpreted values from the parent.
     * @param innerHTML - The innerHTML.
     * @param context - The template resolution context.
     */
    private resolveTemplateDirective;
    /**
     * Resolve an attribute directive (children/slotted/ref).
     * @param name - The name of the directive.
     * @param propName - The property name to pass to the directive.
     * @param externalValues - The interpreted values from the parent.
     */
    private resolveAttributeDirective;
    /**
     * Resolve an access binding — shared by content bindings, boolean-attribute
     * fallback, and default attribute bindings.
     * @returns An object with the resolved binding function and the updated rootPropertyName.
     */
    private resolveAccessBinding;
    /**
     * Resolve an event binding (the "\@" aspect).
     * @returns An object with the event binding function and the updated rootPropertyName.
     */
    private resolveEventBinding;
    /**
     * Resolve a content data binding (`{{expression}}` in text content).
     */
    private resolveContentBinding;
    /**
     * Resolve an attribute data binding (`{{expression}}` in an HTML attribute).
     * Dispatches to event, expression, or access binding handlers based on aspect.
     */
    private resolveAttributeBinding;
    /**
     * Resolve an attribute directive binding (`f-children`, `f-slotted`, `f-ref`).
     */
    private resolveAttributeDirectiveBinding;
    /**
     * Dispatcher for data binding resolution. Routes to the appropriate handler
     * based on the binding subtype.
     */
    private resolveDataBinding;
    /**
     * Resolver of the innerHTML string. Finds the next binding or directive
     * in the HTML and dispatches to the appropriate handler.
     * @param rootPropertyName - The root property name for schema registration.
     * @param innerHTML - The innerHTML to parse.
     * @param strings - Accumulator for literal HTML segments and running previous-string.
     * @param values - The values array (accumulates binding functions and directives).
     * @param context - The template resolution context.
     */
    private resolveInnerHTML;
}
