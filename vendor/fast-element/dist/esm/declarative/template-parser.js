import { children } from "../templating/children.js";
import { elements } from "../templating/node-observation.js";
import { ref } from "../templating/ref.js";
import { repeat } from "../templating/repeat.js";
import { slotted } from "../templating/slotted.js";
import { ViewTemplate } from "../templating/template.js";
import { when } from "../templating/when.js";
import { ensureDeclarativeRuntime } from "./runtime.js";
import { bindingResolver, contextPrefixDot, getBooleanBinding, getExpressionChain, getNextBehavior, getRootPropertyName, parseEventArgs, } from "./utilities.js";
/**
 * Tracks string segments accumulated during template parsing and maintains
 * a running concatenation so that `bindingResolver` can receive the full
 * preceding HTML without an O(N) `join("")` at every binding site.
 */
class StringsAccumulator {
    constructor() {
        this.segments = [];
        this._previousString = "";
    }
    push(segment) {
        this.segments.push(segment);
        this._previousString += segment;
    }
    /**
     * The full concatenation of all segments pushed so far.
     * Used by `bindingResolver` to detect child-element attribute bindings.
     */
    get previousString() {
        return this._previousString;
    }
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
export class TemplateParser {
    /**
     * Parse declarative HTML into strings and values for ViewTemplate creation.
     * @param innerHTML - The transformed innerHTML to parse.
     * @param schema - The Schema instance for property tracking.
     * @returns The resolved strings and values.
     */
    parse(innerHTML, schema) {
        return this.resolveStringsAndValues(null, innerHTML, {
            parentContext: null,
            level: 0,
            schema,
        });
    }
    /**
     * Create a ViewTemplate from resolved strings and values.
     * @param strings - The strings array.
     * @param values - The interpreted values.
     */
    createTemplate(strings, values) {
        ensureDeclarativeRuntime();
        return ViewTemplate.create(strings, values);
    }
    /**
     * Resolve strings and values from an innerHTML string.
     * @param rootPropertyName - The root property name for schema registration.
     * @param innerHTML - The innerHTML.
     * @param context - The template resolution context.
     */
    resolveStringsAndValues(rootPropertyName, innerHTML, context) {
        const strings = new StringsAccumulator();
        const values = [];
        this.resolveInnerHTML(rootPropertyName, innerHTML, strings, values, context);
        strings.segments.raw = strings.segments.map(value => String.raw({ raw: value }));
        return {
            strings: strings.segments,
            values,
        };
    }
    /**
     * Resolve a template directive (when/repeat).
     * @param rootPropertyName - The root property name for schema registration.
     * @param behaviorConfig - The directive behavior configuration object.
     * @param externalValues - The interpreted values from the parent.
     * @param innerHTML - The innerHTML.
     * @param context - The template resolution context.
     */
    resolveTemplateDirective(rootPropertyName, behaviorConfig, externalValues, innerHTML, context) {
        switch (behaviorConfig.name) {
            case "when": {
                const expressionChain = getExpressionChain(behaviorConfig.value);
                const whenLogic = getBooleanBinding(rootPropertyName, expressionChain, context.parentContext, context.level, context.schema);
                const { strings, values } = this.resolveStringsAndValues(rootPropertyName, innerHTML.slice(behaviorConfig.openingTagEndIndex, behaviorConfig.closingTagStartIndex), context);
                externalValues.push(when(whenLogic, this.createTemplate(strings, values)));
                break;
            }
            case "repeat": {
                const valueAttr = behaviorConfig.value.split(" "); // syntax {{x in y}}
                const updatedLevel = context.level + 1;
                rootPropertyName = getRootPropertyName(rootPropertyName, valueAttr[2], context.parentContext, behaviorConfig.name);
                const binding = bindingResolver(null, rootPropertyName, valueAttr[2], context.parentContext, behaviorConfig.name, context.schema, valueAttr[0], context.level);
                const repeatContext = {
                    parentContext: valueAttr[0],
                    level: updatedLevel,
                    schema: context.schema,
                };
                const { strings, values } = this.resolveStringsAndValues(rootPropertyName, innerHTML.slice(behaviorConfig.openingTagEndIndex, behaviorConfig.closingTagStartIndex), repeatContext);
                externalValues.push(repeat((x, c) => binding(x, c), this.createTemplate(strings, values)));
                break;
            }
        }
    }
    /**
     * Resolve an attribute directive (children/slotted/ref).
     * @param name - The name of the directive.
     * @param propName - The property name to pass to the directive.
     * @param externalValues - The interpreted values from the parent.
     */
    resolveAttributeDirective(name, propName, externalValues) {
        switch (name) {
            case "children": {
                externalValues.push(children(propName));
                break;
            }
            case "slotted": {
                const parts = propName.trim().split(" filter ");
                const slottedOption = {
                    property: parts[0],
                };
                if (parts[1]) {
                    if (parts[1].startsWith("elements(")) {
                        let params = parts[1].replace("elements(", "");
                        params = params.substring(0, params.lastIndexOf(")"));
                        Object.assign(slottedOption, {
                            filter: elements(params || undefined),
                        });
                    }
                }
                externalValues.push(slotted(slottedOption));
                break;
            }
            case "ref": {
                externalValues.push(ref(propName));
                break;
            }
        }
    }
    /**
     * Resolve an access binding — shared by content bindings, boolean-attribute
     * fallback, and default attribute bindings.
     * @returns An object with the resolved binding function and the updated rootPropertyName.
     */
    resolveAccessBinding(rootPropertyName, propName, previousStrings, context) {
        rootPropertyName = getRootPropertyName(rootPropertyName, propName, context.parentContext, "access");
        const resolved = bindingResolver(previousStrings, rootPropertyName, propName, context.parentContext, "access", context.schema, context.parentContext, context.level);
        return {
            binding: (x, c) => resolved(x, c),
            rootPropertyName,
        };
    }
    /**
     * Resolve an event binding (the "\@" aspect).
     * @returns An object with the event binding function and the updated rootPropertyName.
     */
    resolveEventBinding(rootPropertyName, innerHTML, behaviorConfig, strings, context) {
        const bindingHTML = innerHTML.slice(behaviorConfig.openingEndIndex, behaviorConfig.closingStartIndex);
        const openingParenthesis = bindingHTML.indexOf("(");
        const closingParenthesis = bindingHTML.indexOf(")");
        const propName = innerHTML.slice(behaviorConfig.openingEndIndex, behaviorConfig.closingStartIndex -
            (closingParenthesis - openingParenthesis) -
            1);
        const type = "event";
        rootPropertyName = getRootPropertyName(rootPropertyName, propName, context.parentContext, type);
        const argsString = bindingHTML.slice(openingParenthesis + 1, closingParenthesis);
        const previousString = strings.previousString;
        const resolved = bindingResolver(previousString, rootPropertyName, propName, context.parentContext, type, context.schema, context.parentContext, context.level);
        const isContextPath = propName.startsWith(contextPrefixDot);
        const getOwner = isContextPath
            ? (_x, c) => {
                const ownerPath = propName.split(".").slice(1, -1);
                return ownerPath.reduce((prev, item) => prev === null || prev === void 0 ? void 0 : prev[item], c);
            }
            : (x, _c) => x;
        const parsedArgs = parseEventArgs(argsString);
        const argResolvers = parsedArgs.map((parsedArg) => {
            switch (parsedArg.type) {
                case "event":
                    return (_x, c) => c.event;
                case "context":
                    return (_x, c) => c;
                case "binding":
                    return bindingResolver(previousString, rootPropertyName, parsedArg.rawArg, context.parentContext, type, context.schema, context.parentContext, context.level);
            }
        });
        return {
            binding: (x, c) => resolved(x, c).bind(getOwner(x, c))(...argResolvers.map(resolve => resolve(x, c))),
            rootPropertyName,
        };
    }
    /**
     * Resolve a content data binding (`{{expression}}` in text content).
     */
    resolveContentBinding(rootPropertyName, innerHTML, strings, values, behaviorConfig, context) {
        strings.push(innerHTML.slice(0, behaviorConfig.openingStartIndex));
        const propName = innerHTML.slice(behaviorConfig.openingEndIndex, behaviorConfig.closingStartIndex);
        const result = this.resolveAccessBinding(rootPropertyName, propName, strings.previousString, context);
        rootPropertyName = result.rootPropertyName;
        values.push(result.binding);
        this.resolveInnerHTML(rootPropertyName, innerHTML.slice(behaviorConfig.closingEndIndex, innerHTML.length), strings, values, context);
    }
    /**
     * Resolve an attribute data binding (`{{expression}}` in an HTML attribute).
     * Dispatches to event, expression, or access binding handlers based on aspect.
     */
    resolveAttributeBinding(rootPropertyName, innerHTML, strings, values, behaviorConfig, context) {
        strings.push(innerHTML.slice(0, behaviorConfig.openingStartIndex));
        let attributeBinding;
        const aspect = behaviorConfig.subtype === "attribute" ? behaviorConfig.aspect : null;
        switch (aspect) {
            case "@": {
                const result = this.resolveEventBinding(rootPropertyName, innerHTML, behaviorConfig, strings, context);
                attributeBinding = result.binding;
                rootPropertyName = result.rootPropertyName;
                break;
            }
            case "?": {
                const propName = innerHTML.slice(behaviorConfig.openingEndIndex, behaviorConfig.closingStartIndex);
                const expressionChain = getExpressionChain(propName);
                if (expressionChain === null || expressionChain === void 0 ? void 0 : expressionChain.expression.operator) {
                    attributeBinding = getBooleanBinding(rootPropertyName, expressionChain, context.parentContext, context.level, context.schema);
                }
                else {
                    const result = this.resolveAccessBinding(rootPropertyName, propName, strings.previousString, context);
                    attributeBinding = result.binding;
                    rootPropertyName = result.rootPropertyName;
                }
                break;
            }
            default: {
                const propName = innerHTML.slice(behaviorConfig.openingEndIndex, behaviorConfig.closingStartIndex);
                const result = this.resolveAccessBinding(rootPropertyName, propName, strings.previousString, context);
                attributeBinding = result.binding;
                rootPropertyName = result.rootPropertyName;
            }
        }
        values.push(attributeBinding);
        this.resolveInnerHTML(rootPropertyName, innerHTML.slice(behaviorConfig.closingEndIndex, innerHTML.length), strings, values, context);
    }
    /**
     * Resolve an attribute directive binding (`f-children`, `f-slotted`, `f-ref`).
     */
    resolveAttributeDirectiveBinding(rootPropertyName, innerHTML, strings, values, behaviorConfig, context) {
        strings.push(innerHTML.slice(0, behaviorConfig.openingStartIndex - behaviorConfig.name.length - 4));
        const propName = innerHTML.slice(behaviorConfig.openingEndIndex, behaviorConfig.closingStartIndex);
        this.resolveAttributeDirective(behaviorConfig.name, propName, values);
        this.resolveInnerHTML(rootPropertyName, innerHTML.slice(behaviorConfig.closingEndIndex + 1, innerHTML.length), strings, values, context);
    }
    /**
     * Dispatcher for data binding resolution. Routes to the appropriate handler
     * based on the binding subtype.
     */
    resolveDataBinding(rootPropertyName, innerHTML, strings, values, behaviorConfig, context) {
        switch (behaviorConfig.subtype) {
            case "content":
                this.resolveContentBinding(rootPropertyName, innerHTML, strings, values, behaviorConfig, context);
                break;
            case "attribute":
                this.resolveAttributeBinding(rootPropertyName, innerHTML, strings, values, behaviorConfig, context);
                break;
            case "attributeDirective":
                this.resolveAttributeDirectiveBinding(rootPropertyName, innerHTML, strings, values, behaviorConfig, context);
                break;
        }
    }
    /**
     * Resolver of the innerHTML string. Finds the next binding or directive
     * in the HTML and dispatches to the appropriate handler.
     * @param rootPropertyName - The root property name for schema registration.
     * @param innerHTML - The innerHTML to parse.
     * @param strings - Accumulator for literal HTML segments and running previous-string.
     * @param values - The values array (accumulates binding functions and directives).
     * @param context - The template resolution context.
     */
    resolveInnerHTML(rootPropertyName, innerHTML, strings, values, context) {
        const behaviorConfig = getNextBehavior(innerHTML);
        if (behaviorConfig === null) {
            strings.push(innerHTML);
        }
        else {
            switch (behaviorConfig.type) {
                case "dataBinding": {
                    this.resolveDataBinding(rootPropertyName, innerHTML, strings, values, behaviorConfig, context);
                    break;
                }
                case "templateDirective": {
                    strings.push(innerHTML.slice(0, behaviorConfig.openingTagStartIndex));
                    this.resolveTemplateDirective(rootPropertyName, behaviorConfig, values, innerHTML, context);
                    this.resolveInnerHTML(rootPropertyName, innerHTML.slice(behaviorConfig.closingTagEndIndex, innerHTML.length), strings, values, context);
                    break;
                }
            }
        }
    }
}
